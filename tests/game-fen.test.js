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
const fenAPI = vm.runInContext('({ parseGameFEN, serializeGameToFEN })', context);

test('FEN parser and serializer round-trip special rights, en-passant, promotions, and move counters', () => {
	const positions = [
		'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 42',
		'4k3/8/8/8/8/8/8/Q3K3 w - - 99 35',
	];
	for (const fen of positions) {
		assert.equal(fenAPI.serializeGameToFEN(fenAPI.parseGameFEN(fen)), fen);
	}
});

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
	game.gameStatus = { textContent: 'White to move.', classList: { remove() {} } };
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
	assert.match(game.gameStatus.textContent, /FEN was not loaded/i);
	assert.equal(game.loadFEN('4k3/8/8/8/8/8/8/8 w - - 0 1'), false);
	assert.equal(game.pieces, loadedPieces, 'an illegal position does not replace the current board');
	assert.match(game.gameStatus.textContent, /exactly one king/i);
	assert.equal(game.loadFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 100 1'), false);
	assert.equal(game.pieces, loadedPieces, 'a terminal fifty-move position does not replace the current game');
	assert.match(game.gameStatus.textContent, /fifty-move draw threshold/i);
});

test('FEN control asks before replacing progress and leaves the position intact when cancelled', () => {
	const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
	const currentFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
	const game = Object.create(Game.prototype);
	game.fenInput = { value: initialFen };
	game.moveHistory = ['1. e4'];
	game.undoStack = [{ move: 'e4' }];
	game.toFEN = () => currentFen;
	game.loadFEN = fen => { game.loadedFEN = fen; return true; };
	let confirmation = '';
	context.window = { confirm(message) { confirmation = message; return false; } };
	assert.equal(game.loadFENFromControl(), false);
	assert.match(confirmation, /replace the current position, move history, and clock state/i);
	assert.equal(game.loadedFEN, undefined);
	context.window.confirm = () => true;
	assert.equal(game.loadFENFromControl(), true);
	assert.equal(game.loadedFEN, initialFen);
});
