const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({ TextEncoder });
vm.runInContext(fs.readFileSync(path.join(root, 'src/game-save.js'), 'utf8'), context, { filename: 'src/game-save.js' });
const api = vm.runInContext('({ createGameSaveSnapshot, serializeGameSave, parseGameSave, validateGameSave, GAME_SAVE_SCHEMA, GAME_SAVE_VERSION })', context);
const savedAt = '2024-11-06T09:00:00.000Z';
const positionKey = JSON.stringify(['white', 'black:king:85,white:king:15,white:rook:11', 'white:QK,black:K', null]);

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
			{ name: 'blackKing', rank: 'king', color: 'black', position: 85, ableToCastle: false },
			{ name: 'whiteRook1', rank: 'rook', color: 'white', position: 11, ableToCastle: true },
		],
		enPassantTarget: null,
		enPassantPawn: null,
		halfmoveClock: 12,
		moveHistory: ['1. e4', '1... e5'],
		positionCounts: new Map([[positionKey, 1]]),
		lastMove: [35, 55],
		clock: {
			remainingMilliseconds: { white: 100000, black: 120000 },
			incrementMilliseconds: 2000,
			activeColor: 'white',
			running: false,
			flaggedColor: null,
		},
	};
}

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

test('versioned snapshot preserves stable chess state, piece rights, history, repetition, and clock fields', () => {
	const snapshot = api.createGameSaveSnapshot(makeGame(), savedAt);
	assert.equal(snapshot.schema, api.GAME_SAVE_SCHEMA);
	assert.equal(snapshot.version, 1);
	assert.equal(snapshot.savedAt, savedAt);
	assert.equal(snapshot.state.turn, 'white');
	assert.deepEqual(clone(snapshot.state.pieces[0]), {
		name: 'whiteKing', rank: 'king', color: 'white', position: 15, ableToCastle: true,
	});
	assert.deepEqual(clone(snapshot.state.moveHistory), ['1. e4', '1... e5']);
	assert.deepEqual(clone(snapshot.state.positionCounts), [[positionKey, 1]]);
	assert.deepEqual(clone(snapshot.state.lastMove), [35, 55]);
	assert.deepEqual(clone(snapshot.state.clock), {
		whiteMilliseconds: 100000,
		blackMilliseconds: 120000,
		incrementMilliseconds: 2000,
		activeColor: 'white',
		running: false,
		flaggedColor: null,
	});
	assert.deepEqual(clone(api.validateGameSave(snapshot)), []);
});

test('serialized save parses back into a validated, JSON-safe snapshot', () => {
	const serialized = api.serializeGameSave(makeGame(), savedAt);
	assert.equal(typeof serialized, 'string');
	const parsed = api.parseGameSave(serialized);
	assert.deepEqual(clone(parsed), clone(api.createGameSaveSnapshot(makeGame(), savedAt)));
});

test('schema validation rejects unsupported versions and structurally invalid chess state', () => {
	const base = api.createGameSaveSnapshot(makeGame(), savedAt);
	const unsupported = clone(base);
	unsupported.version = 2;
	assert.ok(api.validateGameSave(unsupported).some(error => error.includes('version')));

	const invalidPosition = clone(base);
	invalidPosition.state.pieces[0].position = 19;
	assert.ok(api.validateGameSave(invalidPosition).some(error => error.includes('board position')));

	const duplicateSquare = clone(base);
	duplicateSquare.state.pieces[2].position = 15;
	assert.ok(api.validateGameSave(duplicateSquare).some(error => error.includes('multiple pieces')));

	const missingKing = clone(base);
	missingKing.state.pieces = missingKing.state.pieces.filter(piece => piece.color !== 'black' || piece.rank !== 'king');
	assert.ok(api.validateGameSave(missingKing).some(error => error.includes('king of each color')));

	const invalidHistory = clone(base);
	invalidHistory.state.moveHistory.push({ notation: '3. Nf3' });
	assert.ok(api.validateGameSave(invalidHistory).some(error => error.includes('Move history')));
});

test('validation rejects inconsistent en-passant, repetition, clock, and timestamp data', () => {
	const base = api.createGameSaveSnapshot(makeGame(), savedAt);
	const invalidEnPassant = clone(base);
	invalidEnPassant.state.enPassantTarget = 44;
	invalidEnPassant.state.enPassantPawn = 'whiteKing';
	assert.ok(api.validateGameSave(invalidEnPassant).some(error => error.includes('saved pawn')));

	const invalidCounts = clone(base);
	invalidCounts.state.positionCounts = [['not a serialized position key', 0]];
	assert.ok(api.validateGameSave(invalidCounts).some(error => error.includes('Position count')));

	const invalidClock = clone(base);
	invalidClock.state.clock.running = true;
	invalidClock.state.clock.flaggedColor = 'white';
	assert.ok(api.validateGameSave(invalidClock).some(error => error.includes('Clock state')));

	const invalidDate = clone(base);
	invalidDate.savedAt = 'yesterday-ish';
	assert.ok(api.validateGameSave(invalidDate).some(error => error.includes('timestamp')));
});

test('parser gives clear failures for malformed, oversized, and invalid-version saves', () => {
	assert.throws(() => api.parseGameSave('{broken'), { name: 'SyntaxError', message: /valid JSON/ });
	assert.throws(() => api.parseGameSave('x'.repeat(256 * 1024 + 1)), { name: 'TypeError', message: /256 KB/ });
	assert.throws(() => api.parseGameSave('é'.repeat(131073)), { name: 'TypeError', message: /256 KB/ });
	assert.throws(() => api.parseGameSave(JSON.stringify({ schema: api.GAME_SAVE_SCHEMA, version: 9, savedAt, state: {} })), /version/);
	assert.throws(() => api.parseGameSave(JSON.stringify({ schema: api.GAME_SAVE_SCHEMA, version: 1, savedAt, state: null })), /Save state must be an object/);
});

test('snapshot creation refuses finished or transitional game states', () => {
	const finished = makeGame();
	finished.gameOver = true;
	assert.throws(() => api.createGameSaveSnapshot(finished, savedAt), /stable, in-progress/);

	const promoting = makeGame();
	promoting.pendingPromotion = promoting.pieces[0];
	assert.throws(() => api.createGameSaveSnapshot(promoting, savedAt), /stable, in-progress/);
});
