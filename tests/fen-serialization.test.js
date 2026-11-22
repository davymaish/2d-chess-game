const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/fen.js'), 'utf8'), context, { filename: 'src/fen.js' });
const serialize = vm.runInContext('serializeGameToFEN', context);

function startingPieces() {
	const pieces = [];
	const backRank = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
	for (const color of ['black', 'white']) {
		const rank = color === 'black' ? 8 : 1;
		const pawnRank = color === 'black' ? 7 : 2;
		backRank.forEach((pieceRank, index) => {
			const file = index + 1;
			const suffix = pieceRank === 'king' || pieceRank === 'queen' ? '' : pieceRank === 'rook' ? (file === 1 ? '1' : '2') : String(file <= 4 ? 1 : 2);
			pieces.push({
				name: `${color}${pieceRank[0].toUpperCase()}${pieceRank.slice(1)}${suffix}`,
				rank: pieceRank,
				color,
				position: rank * 10 + file,
				...(pieceRank === 'king' || pieceRank === 'rook' ? { ableToCastle: true } : {}),
			});
			pieces.push({ name: `${color}Pawn${file}`, rank: 'pawn', color, position: pawnRank * 10 + file });
		});
	}
	return pieces;
}

function game(overrides = {}) {
	return {
		pieces: startingPieces(),
		turn: 'white',
		enPassantTarget: null,
		halfmoveClock: 0,
		moveHistory: [],
		...overrides,
	};
}

test('serializes the standard initial position to all six FEN fields', () => {
	assert.equal(serialize(game()), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('encodes active color and compresses empty squares across each rank', () => {
	const sparse = game({
		pieces: [
			{ name: 'whiteKing', rank: 'king', color: 'white', position: 15 },
			{ name: 'blackKing', rank: 'king', color: 'black', position: 85 },
			{ name: 'whiteKnight', rank: 'knight', color: 'white', position: 44 },
		],
		turn: 'black',
	});
	assert.equal(serialize(sparse), '4k3/8/8/8/3N4/8/8/4K3 b - - 0 1');
});

test('castling rights require the king and each eligible rook on their home squares', () => {
	const position = game();
	position.pieces.find(piece => piece.name === 'whiteRook1').ableToCastle = false;
	assert.equal(serialize(position).split(' ')[2], 'Kkq');
	position.pieces.find(piece => piece.name === 'blackKing').ableToCastle = false;
	assert.equal(serialize(position).split(' ')[2], 'K');
	position.pieces.find(piece => piece.name === 'whiteKing').position = 35;
	assert.equal(serialize(position).split(' ')[2], '-');
});

test('encodes en-passant target and both FEN counters from game state', () => {
	const position = game({
		turn: 'black',
		enPassantTarget: 35,
		halfmoveClock: 0,
		moveHistory: ['1. e4', '1... e5', '2. Nf3'],
	});
	position.pieces.find(piece => piece.name === 'whiteKnight1').position = 46;
	assert.equal(serialize(position), 'rnbqkbnr/pppppppp/8/8/5N2/8/PPPPPPPP/R1BQKBNR b KQkq e3 0 2');
	position.fullmoveNumber = 27;
	assert.equal(serialize(position).split(' ').at(-1), '27');
});

test('encodes promoted pieces and nonzero half-move counts', () => {
	const position = game({
		pieces: [
			{ name: 'whiteKing', rank: 'king', color: 'white', position: 15 },
			{ name: 'blackKing', rank: 'king', color: 'black', position: 85 },
			{ name: 'whitePromotedQueen1', rank: 'queen', color: 'white', position: 81 },
		],
		halfmoveClock: 37,
		moveHistory: Array.from({ length: 8 }, (_, index) => `${index + 1}. move`),
	});
	assert.equal(serialize(position), 'Q3k3/8/8/8/8/8/8/4K3 w - - 37 5');
});

test('rejects missing game state, invalid pieces, duplicate squares, and invalid counters', () => {
	assert.throws(() => serialize(null), /game with a pieces array/);
	assert.throws(() => serialize(game({ turn: 'green' })), /active color/);
	assert.throws(() => serialize(game({ pieces: [{ rank: 'dragon', color: 'white', position: 11 }] })), /recognized rank and color/);
	assert.throws(() => serialize(game({ pieces: [
		{ rank: 'king', color: 'white', position: 11 },
		{ rank: 'king', color: 'black', position: 11 },
	] })), /more than one piece/);
	assert.throws(() => serialize(game({ halfmoveClock: -1 })), /half-move clock/);
	assert.throws(() => serialize(game({ fullmoveNumber: 0 })), /full-move number/);
	assert.throws(() => serialize(game({ enPassantTarget: 99 })), /Invalid board square/);
	assert.throws(() => serialize(game({ turn: 'white', enPassantTarget: 35 })), /target rank does not match/);
});
