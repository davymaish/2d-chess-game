const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({ console: { log() {} }, document: { getElementById: () => null } });
vm.runInContext(fs.readFileSync(path.join(root, 'src/replay-cursor.js'), 'utf8'), context, { filename: 'src/replay-cursor.js' });
const gameSource = fs.readFileSync(path.join(root, 'src/Game.js'), 'utf8').split('\nconst pieces = [')[0];
vm.runInContext(gameSource, context, { filename: 'src/Game.js' });
const ReplayCursor = vm.runInContext('ReplayCursor', context);
const Game = vm.runInContext('Game', context);

test('replay cursor advances and retreats one move while reporting its position', () => {
	const cursor = new ReplayCursor(['1. e4', '1... e5', '2. Nf3']);
	assert.deepEqual(JSON.parse(JSON.stringify(cursor.getState())), { index: -1, totalMoves: 3, currentMove: null, atStart: true, atEnd: false });
	assert.equal(cursor.previous(), false);
	assert.equal(cursor.next().currentMove, '1. e4');
	assert.equal(cursor.next().currentMove, '1... e5');
	assert.equal(cursor.previous().currentMove, '1. e4');
	assert.equal(cursor.next().index, 1);
});

test('cursor seeks only valid integer positions and first/last respect boundaries', () => {
	const cursor = new ReplayCursor(['1. e4', '1... e5']);
	assert.equal(cursor.seek(-2), false);
	assert.equal(cursor.seek(2), false);
	assert.equal(cursor.seek(0.5), false);
	assert.equal(cursor.last().currentMove, '1... e5');
	assert.equal(cursor.last().atEnd, true);
	assert.equal(cursor.next(), false);
	assert.equal(cursor.first().index, -1);
});

test('empty histories and invalid constructor input are handled predictably', () => {
	const cursor = new ReplayCursor([]);
	assert.equal(cursor.next(), false);
	assert.equal(cursor.last().totalMoves, 0);
	assert.equal(cursor.last().atStart, true);
	assert.equal(cursor.last().atEnd, true);
	assert.throws(() => new ReplayCursor('1. e4'), /history array/);
	assert.throws(() => new ReplayCursor([null]), /must be strings/);
});

test('cursor snapshots its input and Game synchronizes completed move history', () => {
	const history = ['1. e4'];
	const cursor = new ReplayCursor(history);
	history.push('1... e5');
	assert.equal(cursor.getState().totalMoves, 1);
	assert.throws(() => cursor.moves.push('2. Nf3'), /not extensible/);
	assert.equal(cursor.getState().totalMoves, 1, 'public state does not expose the internal move array');

	const game = Object.create(Game.prototype);
	Object.assign(game, { moveHistory: [], fullmoveNumber: 1, replayCursor: new ReplayCursor([]), formatMove: () => 'e4', moveList: null });
	game.recordMoveHistory({ color: 'white' });
	assert.equal(game.getReplayState().totalMoves, 1);
	assert.equal(game.stepReplay('next').currentMove, '1. e4');
	assert.equal(game.stepReplay('next'), false);
});
