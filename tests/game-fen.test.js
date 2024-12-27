const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({ console: { log() {} } });
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
