const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({ TextEncoder });
for (const file of ['src/game-save.js', 'src/game-persistence.js']) {
	vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const api = vm.runInContext('({ GAME_SAVE_STORAGE_KEY, saveGameToStorage, loadGameFromStorage, inspectGameSaveStorage, clearGameSaveFromStorage })', context);
const positionKey = JSON.stringify(['white', 'black:king:85,white:king:15', 'white:-,black:-', null]);

function makeGame() {
	return {
		gameOver: false,
		pendingPromotion: null,
		pendingHistoryMove: null,
		pendingCapture: false,
		pendingUndoEntry: null,
		turn: 'white',
		pieces: [
			{ name: 'whiteKing', rank: 'king', color: 'white', position: 15, ableToCastle: true },
			{ name: 'blackKing', rank: 'king', color: 'black', position: 85, ableToCastle: true },
		],
		enPassantTarget: null,
		enPassantPawn: null,
		halfmoveClock: 0,
		moveHistory: [],
		positionCounts: new Map([[positionKey, 1]]),
		lastMove: null,
		clock: null,
	};
}

function makeStorage(initial = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem(key) { return values.has(key) ? values.get(key) : null; },
		setItem(key, value) { values.set(key, String(value)); },
		removeItem(key) { values.delete(key); },
	};
}

test('completed game state is serialized to the versioned local-save key and loaded back', () => {
	const storage = makeStorage();
	assert.equal(api.saveGameToStorage(makeGame(), storage), true);
	const serialized = storage.getItem(api.GAME_SAVE_STORAGE_KEY);
	assert.equal(typeof serialized, 'string');
	const restored = api.loadGameFromStorage(storage);
	assert.equal(restored.schema, '2d-chess-game');
	assert.equal(restored.version, 1);
	assert.equal(restored.state.pieces.length, 2);
	assert.deepEqual(Array.from(restored.state.positionCounts[0]), [positionKey, 1]);
});

test('load returns null for absent or malformed storage values without throwing', () => {
	assert.equal(api.loadGameFromStorage(makeStorage()), null);
	assert.equal(api.loadGameFromStorage(makeStorage({ [api.GAME_SAVE_STORAGE_KEY]: '{broken' })), null);
	const blocked = { getItem() { throw new Error('storage blocked'); } };
	assert.equal(api.loadGameFromStorage(blocked), null);
});

test('storage inspection distinguishes missing, available, corrupt, outdated, and unavailable saves', () => {
	const validStorage = makeStorage();
	assert.equal(api.inspectGameSaveStorage(validStorage).status, 'missing');
	api.saveGameToStorage(makeGame(), validStorage);
	assert.equal(api.inspectGameSaveStorage(validStorage).status, 'available');

	const corrupt = makeStorage({ [api.GAME_SAVE_STORAGE_KEY]: '{broken' });
	assert.equal(api.inspectGameSaveStorage(corrupt).status, 'corrupt');
	assert.equal(corrupt.getItem(api.GAME_SAVE_STORAGE_KEY), null, 'unreadable data is removed when possible');

	const outdated = makeStorage({ [api.GAME_SAVE_STORAGE_KEY]: JSON.stringify({ schema: '2d-chess-game', version: 0 }) });
	assert.equal(api.inspectGameSaveStorage(outdated).status, 'outdated');
	assert.equal(outdated.getItem(api.GAME_SAVE_STORAGE_KEY), null, 'unsupported data is removed when possible');
	const oversized = makeStorage({ [api.GAME_SAVE_STORAGE_KEY]: 'x'.repeat(256 * 1024 + 1) });
	assert.equal(api.inspectGameSaveStorage(oversized).status, 'corrupt');
	assert.equal(oversized.getItem(api.GAME_SAVE_STORAGE_KEY), null, 'oversized data is removed when possible');

	const blocked = { getItem() { throw new Error('storage blocked'); } };
	assert.equal(api.inspectGameSaveStorage(blocked).status, 'unavailable');
	assert.equal(api.inspectGameSaveStorage(null).status, 'unavailable');
});

test('invalid snapshots remain safely ignorable when browser storage refuses cleanup', () => {
	const storage = {
		getItem() { return '{broken'; },
		removeItem() { throw new Error('storage blocked'); },
	};
	const result = api.inspectGameSaveStorage(storage);
	assert.equal(result.status, 'corrupt');
	assert.equal(result.save, null);
});

test('write and clear report unavailable or blocked storage without interrupting game flow', () => {
	assert.equal(api.saveGameToStorage(makeGame(), null), false);
	assert.equal(api.saveGameToStorage(makeGame(), { setItem() { throw new Error('quota exceeded'); } }), false);
	const storage = makeStorage({ [api.GAME_SAVE_STORAGE_KEY]: 'saved' });
	assert.equal(api.clearGameSaveFromStorage(storage), true);
	assert.equal(storage.getItem(api.GAME_SAVE_STORAGE_KEY), null);
	assert.equal(api.clearGameSaveFromStorage({ removeItem() { throw new Error('storage blocked'); } }), false);
});
