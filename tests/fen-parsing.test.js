const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/fen.js'), 'utf8'), context, { filename: 'src/fen.js' });
const parse = vm.runInContext('parseGameFEN', context);

test('parses the standard initial FEN into named board pieces and state fields', () => {
	const parsed = parse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
	assert.equal(parsed.turn, 'white');
	assert.equal(parsed.castlingRights, 'KQkq');
	assert.equal(parsed.enPassantTarget, null);
	assert.equal(parsed.halfmoveClock, 0);
	assert.equal(parsed.fullmoveNumber, 1);
	assert.equal(parsed.pieces.length, 32);
	assert.deepEqual(Array.from(parsed.pieces).filter(piece => piece.rank === 'king').map(piece => piece.name).sort(), ['blackKing', 'whiteKing']);
	assert.deepEqual(Array.from(parsed.pieces).filter(piece => piece.rank === 'rook' && piece.color === 'white').map(piece => [piece.name, piece.ableToCastle]).sort(), [['whiteRook1', true], ['whiteRook2', true]]);
	assert.equal(parsed.pieces.find(piece => piece.name === 'whiteQueen').position, 14);
});

test('parses active color, sparse placement, en-passant target, and move counters', () => {
	const parsed = parse('4k3/8/8/8/3pP3/8/8/4K3 b - e3 7 42');
	assert.equal(parsed.turn, 'black');
	assert.equal(parsed.castlingRights, '-');
	assert.equal(parsed.enPassantTarget, 35);
	assert.equal(parsed.halfmoveClock, 7);
	assert.equal(parsed.fullmoveNumber, 42);
	assert.deepEqual(Array.from(parsed.pieces).map(piece => [piece.color, piece.rank, piece.position]), [
		['black', 'king', 85], ['black', 'pawn', 44], ['white', 'pawn', 45], ['white', 'king', 15],
	]);
});

test('assigns unique identities to promoted and repeated piece types', () => {
	const parsed = parse('4k3/QQ6/8/8/8/8/8/4K3 w - - 0 1');
	const queens = Array.from(parsed.pieces).filter(piece => piece.rank === 'queen');
	assert.equal(new Set(queens.map(piece => piece.name)).size, 2);
	assert.equal(queens[0].name, 'whiteQueen');
	assert.match(queens[1].name, /^whiteQueenPromoted\d+$/);
});

test('rejects malformed FEN field counts, placement rows, symbols, rights, targets, and counters', () => {
	for (const fen of [
		'',
		'8/8/8/8/8/8/8/8 w - - 0',
		'8/8/8/8/8/8/8 w - - 0 1',
		'9/8/8/8/8/8/8/8 w - - 0 1',
		'7X/8/8/8/8/8/8/8 w - - 0 1',
		'8/8/8/8/8/8/8/8 x - - 0 1',
		'8/8/8/8/8/8/8/8 w KK - 0 1',
		'8/8/8/8/8/8/8/8 w - e4 0 1',
		'8/8/8/8/8/8/8/8 w - e3 0 1',
		'8/8/8/8/8/8/8/8 w - - -1 1',
		'8/8/8/8/8/8/8/8 w - - 0 0',
		`${'8/'.repeat(65)}w - - 0 1`,
	]) assert.throws(() => parse(fen), error => error && error.name === 'TypeError', `Expected malformed FEN to be rejected: ${fen}`);
});

test('rejects structurally illegal positions and impossible special-move claims', () => {
	for (const fen of [
		'4k3/8/8/8/8/8/8/8 w - - 0 1',
		'4k3/8/8/8/8/8/8/P3K3 w - - 0 1',
		'4k3/8/8/8/8/8/8/4K3 w K - 0 1',
		'4k3/8/8/8/8/8/8/4K3 b - e3 0 1',
		'8/8/8/8/8/8/4k3/4K3 w - - 0 1',
		'4k3/8/8/8/8/8/4R3/K7 w - - 0 1',
		'4k3/8/8/8/8/P7/PPPPPPPP/4K3 w - - 0 1',
		'4k3/QQQQQQQQ/QQ6/8/8/8/8/4K3 w - - 0 1',
	]) assert.throws(() => parse(fen), error => error && error.name === 'TypeError', `Expected illegal FEN to be rejected: ${fen}`);
});

test('accepts a legal position where the active side is in check', () => {
	const parsed = parse('k3r3/8/8/8/8/8/8/4K3 w - - 0 1');
	assert.equal(parsed.turn, 'white');
	assert.equal(parsed.pieces.length, 3);
});
