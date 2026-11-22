const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const endScene = {
	classList: { add() {}, remove() {} },
	getElementsByClassName: () => [{ textContent: '' }],
};
const context = vm.createContext({
	console: { log() {} },
	document: { getElementById: id => id === 'endscene' ? endScene : null },
	window: { confirm: () => true },
	clearGameSaveFromStorage() {},
});
vm.runInContext(fs.readFileSync(path.join(root, 'src/pgn.js'), 'utf8'), context, { filename: 'src/pgn.js' });
const pgnAPI = vm.runInContext('({ serializeGameToPGN, parseGamePGN })', context);
const gameSource = fs.readFileSync(path.join(root, 'src/Game.js'), 'utf8').split('\nconst pieces = [')[0];
vm.runInContext(gameSource, context, { filename: 'src/Game.js' });
const Game = vm.runInContext('Game', context);

const expectedHeaders = [
	'[Event "Casual Game"]',
	'[Site "Local"]',
	'[Date "????.??.??"]',
	'[Round "-"]',
	'[White "White"]',
	'[Black "Black"]',
];

function pgnGame(moveHistory = [], resultToken = '*') {
	return { moveHistory, resultToken };
}

function gameForEndState() {
	const game = Object.create(Game.prototype);
	Object.assign(game, {
		gameOver: false,
		resultToken: '*',
		turn: 'white',
		pendingPromotion: null,
		clearSavedGameButton: null,
		saveStatus: null,
		clock: null,
		resignButton: null,
		gameStatus: { textContent: '', classList: { remove() {} } },
		playStatusSound() {},
		updateClockControls() {},
		updateHistoryControls() {},
	});
	return game;
}

test('PGN parser reads escaped tag pairs and a sequential numbered SAN main line', () => {
	const parsed = JSON.parse(JSON.stringify(pgnAPI.parseGamePGN(
		'[Event "Club"]\n[White "Ada \\\"Ace\\\""]\n[Result "1-0"]\n\n1.e4 e5 2.Nf3 Nc6 1-0'
	)));
	assert.deepEqual(parsed, {
		headers: { Event: 'Club', White: 'Ada "Ace"', Result: '1-0' },
		moves: ['1. e4', '1... e5', '2. Nf3', '2... Nc6'],
		result: '1-0',
	});
});

test('PGN parser starts from a black-to-move FEN fullmove number', () => {
	const parsed = pgnAPI.parseGamePGN('[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 42"]\n\n42...e5 43.Nf3 *');
	assert.deepEqual(JSON.parse(JSON.stringify(parsed.moves)), ['42... e5', '43. Nf3']);
});

test('PGN parser rejects malformed tags, invalid SAN, inconsistent numbering, and unsupported annotations', () => {
	assert.throws(() => pgnAPI.parseGamePGN('[Event Bad]\n\n1. e4 *'), /Invalid PGN tag pair/i);
	assert.throws(() => pgnAPI.parseGamePGN('1. e2e4 *'), /Invalid SAN token/i);
	assert.throws(() => pgnAPI.parseGamePGN('1. e4 2... e5 *'), /do not follow/i);
	assert.throws(() => pgnAPI.parseGamePGN('[Result "1-0"]\n\n1. e4 0-1'), /does not match/i);
	assert.throws(() => pgnAPI.parseGamePGN('1. e4 {comment} *'), /not supported/i);
});

test('PGN export emits the standard tag roster and unfinished result marker', () => {
	const pgn = pgnAPI.serializeGameToPGN(pgnGame());
	assert.equal(pgn, [...expectedHeaders, '[Result "*"]', '', '*'].join('\n'));
});

test('PGN export combines SAN moves into numbered movetext and appends the final result', () => {
	const game = pgnGame(['1. e4', '1... e5', '2. Nf3', '2... Nc6'], '1-0');
	const output = pgnAPI.serializeGameToPGN(game, { White: 'Ada', Black: 'Turing', Event: 'Open' });
	assert.match(output, /^\[Event "Open"\]\n\[Site "Local"\]\n\[Date "\?\?\?\?\.\?\?\.\?\?"\]\n\[Round "-"\]\n\[White "Ada"\]\n\[Black "Turing"\]\n\[Result "1-0"\]/);
	assert.ok(output.endsWith('\n\n1. e4 e5 2. Nf3 Nc6 1-0'));
});

test('PGN export preserves a black-to-move FEN fullmove number and wraps long movetext cleanly', () => {
	const output = pgnAPI.serializeGameToPGN(pgnGame(['42... e5', '43. Nf3', '43... Nc6'], '0-1'));
	assert.ok(output.endsWith('\n\n42... e5 43. Nf3 Nc6 0-1'));
	const longHistory = Array.from({ length: 80 }, (_, index) => {
		const number = Math.floor(index / 2) + 1;
		return index % 2 === 0 ? `${number}. Nf3` : `${number}... Nc6`;
	});
	const longMovetext = pgnAPI.serializeGameToPGN(pgnGame(longHistory)).split('\n\n')[1];
	assert.ok(longMovetext.split('\n').every(line => line.length <= 80));
	assert.ok(longMovetext.endsWith(' *'));
});

test('PGN movetext preserves formatted SAN for captures, disambiguation, castling, promotion, check, and mate', () => {
	const game = Object.create(Game.prototype);
	const moves = [
		{ color: 'white', move: { rank: 'pawn', from: 55, to: 64, isCapture: true } },
		{ color: 'black', move: { rank: 'knight', from: 22, to: 43, isCapture: false, disambiguation: 'b' } },
		{ color: 'white', move: { rank: 'king', from: 15, to: 17, isCapture: false } },
		{ color: 'black', move: { rank: 'king', from: 85, to: 83, isCapture: false } },
		{ color: 'white', move: { rank: 'pawn', from: 77, to: 88, isCapture: true, promotion: 'queen', checkSuffix: '+' } },
		{ color: 'black', move: { rank: 'queen', from: 84, to: 48, isCapture: false, checkSuffix: '#' } },
	];
	game.moveHistory = moves.map((entry, index) => {
		const moveNumber = Math.floor(index / 2) + 1;
		const turn = entry.color === 'black' ? `${moveNumber}...` : `${moveNumber}.`;
		return `${turn} ${game.formatMove(entry.move)}`;
	});
	game.resultToken = '0-1';
	assert.ok(game.toPGN().endsWith('\n\n1. exd6 Nbc4 2. O-O O-O-O 3. gxh8=Q+ Qh4# 0-1'));
});

test('PGN header values are escaped and extra tag pairs follow the standard roster', () => {
	const output = pgnAPI.serializeGameToPGN(pgnGame(), {
		White: 'Ada "Ace" \\ Player',
		Annotator: 'A\nReviewer',
	});
	assert.ok(output.includes('[White "Ada \\"Ace\\" \\\\ Player"]'));
	assert.ok(output.includes('[Annotator "A Reviewer"]'));
	assert.ok(output.indexOf('[Result "*"]') < output.indexOf('[Annotator "A Reviewer"]'));
});

test('PGN export rejects malformed move history, result tokens, and header values', () => {
	assert.throws(() => pgnAPI.serializeGameToPGN(pgnGame(['e4'])), /numbered SAN notation/i);
	assert.throws(() => pgnAPI.serializeGameToPGN(pgnGame(['1. e2e4'])), /invalid SAN token/i);
	assert.throws(() => pgnAPI.serializeGameToPGN(pgnGame(['1. e4', '2... e5'])), /does not follow/i);
	assert.throws(() => pgnAPI.serializeGameToPGN(pgnGame([], 'win')), /PGN result/i);
	assert.throws(() => pgnAPI.serializeGameToPGN(pgnGame(), { Site: 3 }), /must be a string/i);
	assert.throws(() => pgnAPI.serializeGameToPGN(pgnGame(), { 'Bad Tag': 'x' }), /Invalid PGN header name/i);
});

test('Game.toPGN delegates current SAN history and result to the serializer', () => {
	const game = Object.create(Game.prototype);
	Object.assign(game, { moveHistory: ['1. e4', '1... c5'], resultToken: '0-1' });
	assert.ok(game.toPGN().endsWith('\n\n1. e4 c5 0-1'));
});

test('terminal game outcomes record standard PGN win and draw markers', () => {
	const resignation = gameForEndState();
	assert.equal(resignation.requestResignation(), true);
	assert.equal(resignation.resultToken, '0-1', 'white resignation awards black the result');

	const mate = gameForEndState();
	mate.checkmate('white');
	assert.equal(mate.resultToken, '1-0');

	const draw = gameForEndState();
	draw.drawByThreefoldRepetition();
	assert.equal(draw.resultToken, '1/2-1/2');

	const timeoutWin = gameForEndState();
	timeoutWin.hasMatingMaterial = () => true;
	timeoutWin.handleTimeout('white');
	assert.equal(timeoutWin.resultToken, '0-1');

	const timeoutDraw = gameForEndState();
	timeoutDraw.hasMatingMaterial = () => false;
	timeoutDraw.handleTimeout('white');
	assert.equal(timeoutDraw.resultToken, '1/2-1/2');
});
