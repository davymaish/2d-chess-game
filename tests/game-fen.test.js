const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({ console: { log() {} }, TextEncoder, document: { getElementById: () => null } });
vm.runInContext(fs.readFileSync(path.join(root, 'src/game-save.js'), 'utf8'), context, { filename: 'src/game-save.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'src/fen.js'), 'utf8'), context, { filename: 'src/fen.js' });
const gameSource = fs.readFileSync(path.join(root, 'src/Game.js'), 'utf8').split('\nconst pieces = [')[0];
vm.runInContext(gameSource, context, { filename: 'src/Game.js' });
const Game = vm.runInContext('Game', context);

test('Game.toFEN delegates the live position to the FEN serializer', () => {
	const game = Object.create(Game.prototype);
	Object.assign(game, {
		pieces: [
			{ name: 'whiteKing', rank: 'king', color: 'white', position: 15 },
			{ name: 'blackKing', rank: 'king', color: 'black', position: 85 },
			{ name: 'whiteQueen', rank: 'queen', color: 'white', position: 44 },
		],
		turn: 'black',
		enPassantTarget: null,
		halfmoveClock: 9,
		moveHistory: ['1. e4', '1... e5'],
	});
	assert.equal(game.toFEN(), '4k3/8/8/8/3Q4/8/8/4K3 b - - 9 2');
});

test('Game.loadFEN initializes parsed state and leaves the game unchanged on parse failure', () => {
	const game = Object.create(Game.prototype);
	game.clock = null;
	game.clockPreset = null;
	game.pieces = [{ name: 'sentinel', rank: 'king', color: 'white', position: 15 }];
	game.turn = 'white';
	game.restoreSavedGame = save => {
		game.restoredSave = save;
		game.pieces = save.state.pieces;
		game.turn = save.state.turn;
		game.enPassantTarget = save.state.enPassantTarget;
		game.enPassantPawn = game.pieces.find(piece => piece.name === save.state.enPassantPawn) || null;
		game.halfmoveClock = save.state.halfmoveClock;
		game.fullmoveNumber = save.state.fullmoveNumber;
		game.moveHistory = save.state.moveHistory;
		return true;
	};
	game.recordPosition = () => { game.positionRecorded = true; };
	game.updateClockDisplay = () => {};
	game.updateClockControls = () => {};
	game.updateHistoryControls = () => {};
	game.updateCheckStatus = () => {};
	game.persistCurrentGame = () => {};
	assert.equal(game.loadFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 42'), true);
	assert.equal(game.turn, 'black');
	assert.equal(game.fullmoveNumber, 42);
	assert.equal(game.enPassantPawn.name, 'whitePawn5');
	assert.equal(game.restoredSave.state.moveHistory.length, 0);
	assert.equal(game.positionRecorded, true);

	const loadedPieces = game.pieces;
	assert.equal(game.loadFEN('not a FEN'), false);
	assert.equal(game.pieces, loadedPieces, 'failed parsing does not replace the current board');
});
