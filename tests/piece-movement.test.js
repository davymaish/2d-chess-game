const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({
  console: { log() {} },
  document: { getElementById: (id) => ({ id }) },
  setInterval: () => 1,
  clearInterval: () => {},
  exports: {},
});

for (const file of [
  'src/Piece.js',
  'src/pieces/Bishop.js',
  'src/pieces/King.js',
  'src/pieces/Knight.js',
  'src/pieces/Pawn.js',
  'src/pieces/Queen.js',
  'src/pieces/Rook.js',
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
    filename: file,
  });
}

const gameSource = fs.readFileSync(path.join(root, 'src/Game.js'), 'utf8').split('\nconst pieces = [')[0];
vm.runInContext(gameSource, context, { filename: 'src/Game.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'src/board-orientation.js'), 'utf8'), context, { filename: 'src/board-orientation.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'src/chess-clock.js'), 'utf8'), context, { filename: 'src/chess-clock.js' });

function pieceClass(name) {
  return vm.runInContext(name, context);
}

function createGame(pieces, clickedPiece) {
  const Game = vm.runInContext('Game', context);
  const game = Object.create(Game.prototype);
  game.pieces = pieces;
  game.clickedPiece = clickedPiece;
  return game;
}

function onBoard(position) {
  const rank = Math.floor(position / 10);
  const file = position % 10;
  return rank >= 1 && rank <= 8 && file >= 1 && file <= 8;
}

function validPositions(groups) {
  return [...groups.flat().filter(onBoard)].sort((a, b) => a - b);
}

test('chess clock tracks elapsed time and switches, pauses, and resumes the active side', () => {
	let now = 0;
	let intervalCallback;
	let nextTimerId = 1;
	const clearedTimers = [];
	const updates = [];
	const clock = new (pieceClass('ChessClock'))({
		whiteSeconds: 30,
		blackSeconds: 45,
		onTick: state => updates.push(state),
		now: () => now,
		setTimer: callback => { intervalCallback = callback; return nextTimerId++; },
		clearTimer: id => clearedTimers.push(id),
	});

	assert.equal(clock.start(), true);
	assert.equal(clock.start(), false, 'a running clock cannot start twice');
	now = 2300;
	assert.equal(clock.tick(), true);
	assert.equal(clock.getRemainingMilliseconds('white'), 27700);
	assert.equal(clock.getRemainingSeconds('white'), 28);
	assert.equal(clock.switchActiveSide(), true);
	assert.equal(clock.activeColor, 'black');
	now = 4800;
	assert.equal(clock.pause(), true);
	assert.equal(clock.running, false);
	assert.equal(clock.getRemainingMilliseconds('black'), 42500);
	assert.ok(clearedTimers.length > 0);
	now = 9000;
	assert.equal(clock.resume(), true);
	now = 10000;
	assert.equal(clock.pause(), true);
	assert.equal(clock.getRemainingMilliseconds('black'), 41500);
	assert.equal(clock.running, false);
	assert.equal(updates.at(-1).activeColor, 'black');
	assert.equal(updates.at(-1).running, false);
	assert.equal(typeof intervalCallback, 'function');
});

test('clock lifecycle handles interval callbacks, duplicate transitions, clock rollback, and stop', () => {
	let now = 0;
	let intervalCallback;
	let nextTimerId = 1;
	const cleared = [];
	const clock = new (pieceClass('ChessClock'))({
		whiteSeconds: 4,
		blackSeconds: 3,
		incrementSeconds: 1,
		now: () => now,
		setTimer: callback => { intervalCallback = callback; return nextTimerId++; },
		clearTimer: id => cleared.push(id),
	});

	assert.equal(clock.start(), true);
	assert.equal(clock.start(), false);
	const firstTimer = clock.timer;
	now = 1000;
	intervalCallback();
	assert.equal(clock.getRemainingMilliseconds('white'), 3000);
	assert.equal(clock.switchActiveSide('black'), true);
	assert.equal(clock.getRemainingMilliseconds('white'), 4000, 'the completed move receives its increment');
	assert.equal(clock.switchActiveSide('black'), false, 'switching to the current side is a no-op');
	assert.equal(clock.getRemainingMilliseconds('white'), 4000, 'a no-op side switch does not add another increment');

	now = 2000;
	assert.equal(clock.pause(), true);
	assert.equal(clock.getRemainingMilliseconds('black'), 2000);
	assert.equal(clock.pause(), false);
	assert.ok(cleared.includes(firstTimer));
	assert.equal(clock.resume(), true);
	const secondTimer = clock.timer;
	assert.notEqual(secondTimer, firstTimer);
	now = 1500;
	intervalCallback();
	assert.equal(clock.getRemainingMilliseconds('black'), 2000, 'a backward-moving wall clock cannot add time');
	now = 2500;
	intervalCallback();
	assert.equal(clock.getRemainingMilliseconds('black'), 1000);
	clock.stop();
	assert.equal(clock.running, false);
	assert.equal(clock.timer, null);
	assert.ok(cleared.includes(secondTimer));
	assert.equal(clock.tick(), false, 'a stopped clock cannot be ticked');
	assert.equal(clock.start(), true, 'a stopped, unflagged clock may be started again');
	assert.equal(clock.running, true);
	clock.stop();
});

test('completed moves charge only the moving side, award one increment, and flag on pause at zero', () => {
	let now = 0;
	const flags = [];
	const clock = new (pieceClass('ChessClock'))({
		whiteSeconds: 10,
		blackSeconds: 10,
		incrementSeconds: 2,
		now: () => now,
		setTimer: () => 1,
		clearTimer() {},
	});
	const game = createGame([], null);
	game.turn = 'white';
	game.turnSign = { innerHTML: '' };
	game.clock = clock;
	game.isCastlingRookMove = false;
	game.recordPosition = () => {};
	game.getGameOutcome = () => 'ongoing';
	game.updateCheckStatus = () => {};
	assert.equal(game.attachClock(clock), true);
	now = 3000;
	game.finishMove('white');
	assert.equal(game.turn, 'black');
	assert.equal(clock.activeColor, 'black');
	assert.equal(clock.getRemainingSeconds('white'), 9, 'white spent three seconds and received one two-second increment');
	assert.equal(clock.getRemainingSeconds('black'), 10);

	const nearZero = new (pieceClass('ChessClock'))({
		whiteSeconds: 1,
		blackSeconds: 5,
		onFlag: result => flags.push(result),
		now: () => now,
		setTimer: () => 2,
		clearTimer() {},
	});
	assert.equal(nearZero.start(), true);
	now += 1000;
	assert.equal(nearZero.pause(), false, 'pause processes elapsed time before stopping');
	assert.equal(nearZero.flaggedColor, 'white');
	assert.deepEqual(flags.map(result => ({ ...result })), [{ flaggedColor: 'white', winner: 'black' }]);
	assert.equal(nearZero.resume(), false, 'a flagged clock cannot restart');
});

test('chess clock flags exactly once at zero and rejects invalid colors or time values', () => {
	let now = 0;
	const flags = [];
	const clock = new (pieceClass('ChessClock'))({
		whiteSeconds: 1,
		blackSeconds: 5,
		onFlag: result => flags.push(result),
		now: () => now,
		setTimer: () => 1,
		clearTimer() {},
	});
	const stubTimers = { setTimer: () => 1, clearTimer() {} };
	assert.throws(() => new (pieceClass('ChessClock'))({ ...stubTimers, whiteSeconds: -1 }), /nonnegative/);
	assert.throws(() => new (pieceClass('ChessClock'))({ ...stubTimers, activeColor: 'red' }), /Invalid chess clock color/);
	assert.throws(() => clock.getRemainingSeconds('red'), /Invalid chess clock color/);
	clock.start();
	now = 1200;
	assert.equal(clock.tick(), false);
	assert.deepEqual(flags.map(result => ({ ...result })), [{ flaggedColor: 'white', winner: 'black' }]);
	assert.equal(clock.start(), false);
	assert.equal(clock.pause(), false);
	assert.equal(clock.tick(), false);
	assert.equal(flags.length, 1);
});

test('chess clock presets and increments add time to the side that just completed a move', () => {
	assert.deepEqual({ ...context.getChessClockPreset('bullet-1-0') }, { label: 'Bullet 1+0', baseSeconds: 60, incrementSeconds: 0 });
	assert.deepEqual({ ...context.getChessClockPreset('blitz-3-2') }, { label: 'Blitz 3+2', baseSeconds: 180, incrementSeconds: 2 });
	assert.deepEqual({ ...context.getChessClockPreset('rapid-15-10') }, { label: 'Rapid 15+10', baseSeconds: 900, incrementSeconds: 10 });
	assert.equal(context.getChessClockPreset('unknown'), null);

	let now = 0;
	const clock = new (pieceClass('ChessClock'))({
		whiteSeconds: 5,
		blackSeconds: 5,
		incrementSeconds: 2,
		now: () => now,
		setTimer: () => 1,
		clearTimer() {},
	});
	clock.start();
	now = 1000;
	assert.equal(clock.switchActiveSide(), true);
	assert.equal(clock.getRemainingSeconds('white'), 6, 'white receives the configured increment before black starts');
	assert.equal(clock.getRemainingSeconds('black'), 5);
	now = 2000;
	assert.equal(clock.switchActiveSide(), true);
	assert.equal(clock.getRemainingSeconds('black'), 6, 'black receives the same increment after its move');
	assert.throws(() => new (pieceClass('ChessClock'))({ incrementSeconds: -1, setTimer: () => 1, clearTimer() {} }), /nonnegative/);
});

test('clock controls start a selected preset, pause and resume, and update accessible readouts', () => {
	const makeButton = () => ({ disabled: false, textContent: '', listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } });
	const makeSide = () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
	const game = createGame([], null);
	game.turn = 'black';
	game.gameOver = false;
	game.clockPreset = { value: 'blitz-3-2', disabled: false };
	game.clockStartButton = makeButton();
	game.clockPauseButton = makeButton();
	game.clockStatus = { textContent: '' };
	game.whiteClockDisplay = { textContent: '' };
	game.blackClockDisplay = { textContent: '' };
	game.whiteClockSide = makeSide();
	game.blackClockSide = makeSide();
	game.addClockControls();
	assert.equal(game.clockStartButton.disabled, false);
	assert.equal(game.clockPauseButton.disabled, true);
	game.clockStartButton.listeners.click();
	assert.equal(game.clock.activeColor, 'black');
	assert.equal(game.clock.getRemainingSeconds('white'), 180);
	assert.equal(game.clock.incrementMilliseconds, 2000);
	assert.equal(game.clockStatus.textContent, 'Blitz 3+2 clock started.');
	assert.equal(game.clockPreset.disabled, true);
	assert.equal(game.clockPauseButton.disabled, false);
	assert.equal(game.clockStartButton.textContent, 'Resume clock');
	game.clockPauseButton.listeners.click();
	assert.equal(game.clock.running, false);
	assert.equal(game.clockStatus.textContent, 'Clock paused.');
	assert.equal(game.clockPreset.disabled, true, 'a paused clock keeps the original preset until a new game');
	assert.equal(game.clockPauseButton.disabled, true);
	game.clockStartButton.listeners.click();
	assert.equal(game.clock.running, true);
	assert.equal(game.clockStatus.textContent, 'Clock resumed.');
	game.updateClockDisplay({ whiteSeconds: 65, blackSeconds: 600, activeColor: 'white' });
	assert.equal(game.whiteClockDisplay.textContent, '1:05');
	assert.equal(game.blackClockDisplay.textContent, '10:00');
	assert.equal(game.whiteClockSide.attributes['aria-current'], 'true');
	assert.equal(game.blackClockSide.attributes['aria-current'], 'false');
	assert.equal(game.formatClockTime(-1), '0:00');
});

test('move sounds default off, persist the user preference, and distinguish captures', () => {
	const previousStorage = context.localStorage;
	const previousWindow = context.window;
	const values = new Map([['chess-move-sounds', 'on']]);
	const frequencies = [];
	class MockAudioContext {
		constructor() { this.currentTime = 0; this.destination = {}; }
		createOscillator() {
			const oscillator = { frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
			frequencies.push(oscillator.frequency);
			return oscillator;
		}
		createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
	}
	context.localStorage = {
		getItem: key => values.has(key) ? values.get(key) : null,
		setItem: (key, value) => values.set(key, value),
	};
	context.window = { AudioContext: MockAudioContext };
	try {
		values.clear();
		const defaultGame = createGame([], null);
		defaultGame.moveSoundsToggle = { checked: true, addEventListener() {} };
		defaultGame.soundStatus = { textContent: '' };
		defaultGame.addSoundControls();
		assert.equal(defaultGame.moveSoundsToggle.checked, false, 'sound is disabled for first-time users');
		assert.equal(defaultGame.soundStatus.textContent, 'Move sounds are off.');
		values.set('chess-move-sounds', 'on');
		const game = createGame([], null);
		game.moveSoundsToggle = { checked: false, listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } };
		game.soundStatus = { textContent: '' };
		game.addSoundControls();
		assert.equal(game.moveSoundsToggle.checked, true, 'saved preference is restored on load');
		assert.equal(game.soundStatus.textContent, 'Move sounds are on.');
		assert.equal(game.playMoveSound(false), true);
		assert.equal(frequencies[0].value, 620, 'ordinary moves use the higher, quiet tone');
		assert.equal(game.playMoveSound(true), true);
		assert.equal(frequencies[1].value, 300, 'captures use a lower, distinct quiet tone');
		assert.equal(game.playStatusSound('check'), true);
		assert.equal(frequencies[2].value, 820, 'check uses its own short cue');
		assert.equal(game.playStatusSound('game-end'), true);
		assert.equal(frequencies[3].value, 440, 'terminal results use a distinct low cue');
		assert.equal(game.playStatusSound('unknown'), false);
		game.moveSoundsToggle.checked = false;
		game.moveSoundsToggle.listeners.change();
		assert.equal(values.get('chess-move-sounds'), 'off');
		assert.equal(game.soundStatus.textContent, 'Move sounds are off.');
		assert.equal(game.playMoveSound(false), false, 'muted moves do not initialize or play sound');

		const unavailableGame = createGame([], null);
		unavailableGame.moveSoundsToggle = { checked: true };
		context.window = {};
		assert.equal(unavailableGame.playMoveSound(false), false, 'browsers without Web Audio fail gracefully');
	}
	finally {
		if (previousStorage === undefined) delete context.localStorage;
		else context.localStorage = previousStorage;
		if (previousWindow === undefined) delete context.window;
		else context.window = previousWindow;
	}
});

test('completed move history dispatches quiet-move and capture cues exactly once', () => {
	const game = createGame([], null);
	game.turn = 'white';
	game.turnSign = { innerHTML: '' };
	game.isCastlingRookMove = false;
	game.recordPosition = () => {};
	let outcome = 'ongoing';
	game.getGameOutcome = () => outcome;
	game.updateCheckStatus = () => {};
	game.commitPendingUndoMove = () => {};
	game.recordMoveHistory = () => {};
	const soundKinds = [];
	const statusCues = [];
	game.playMoveSound = isCapture => soundKinds.push(Boolean(isCapture));
	game.playStatusSound = kind => statusCues.push(kind);
	game.pendingHistoryMove = { isCapture: false };
	game.finishMove('white');
	assert.equal(game.pendingHistoryMove, null);
	game.turn = 'black';
	outcome = 'check';
	game.pendingHistoryMove = { isCapture: true };
	game.finishMove('black');
	assert.deepEqual(soundKinds, [false, true]);
	assert.deepEqual(statusCues, ['check']);
});

test('game-end cue plays once through the shared terminal-result path', () => {
	const result = { textContent: '' };
	const classes = new Set();
	const endScene = {
		getElementsByClassName: () => [result],
		classList: { add: value => classes.add(value) },
	};
	const originalGetElementById = context.document.getElementById;
	context.document.getElementById = id => id === 'endscene' ? endScene : null;
	try {
		const game = createGame([], null);
		game.gameStatus = { textContent: '', classList: { remove() {} } };
		game.updateClockControls = () => {};
		game.updateHistoryControls = () => {};
		const cues = [];
		game.playStatusSound = kind => cues.push(kind);
		assert.equal(game.finishGame('Checkmate. White wins.'), true);
		assert.equal(game.finishGame('duplicate result'), false);
		assert.equal(result.textContent, 'Checkmate. White wins.');
		assert.equal(classes.has('show'), true);
		assert.deepEqual(cues, ['game-end']);
	}
	finally {
		context.document.getElementById = originalGetElementById;
	}
});

test('last-move highlight marks every origin and destination and replaces the prior move', () => {
	const makeClassList = () => {
		const values = new Set();
		return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
	};
	const squares = new Map([11, 12, 13, 14, 15, 16, 17, 18].map(id => [String(id), { classList: makeClassList() }]));
	const game = createGame([], null);
	game.board = { querySelectorAll: selector => selector === '.last-move' ? [...squares.values()].filter(square => square.classList.contains('last-move')) : [] };
	const originalGetElementById = context.document.getElementById;
	context.document.getElementById = id => squares.get(String(id)) || null;
	try {
		game.setLastMoveHighlight([{ from: 11, to: 13 }, { from: 18, to: 16 }]);
		assert.deepEqual([...game.lastMove], [11, 13, 18, 16]);
		assert.equal(squares.get('11').classList.contains('last-move'), true);
		assert.equal(squares.get('13').classList.contains('last-move'), true);
		assert.equal(squares.get('18').classList.contains('last-move'), true);
		assert.equal(squares.get('16').classList.contains('last-move'), true);
		game.setLastMoveHighlight([{ from: 14, to: 15 }]);
		assert.equal(squares.get('11').classList.contains('last-move'), false);
		assert.equal(squares.get('13').classList.contains('last-move'), false);
		assert.equal(squares.get('14').classList.contains('last-move'), true);
		assert.equal(squares.get('15').classList.contains('last-move'), true);
	}
	finally {
		context.document.getElementById = originalGetElementById;
	}
});

test('undo and redo snapshots preserve last-move squares', () => {
	const game = createGame([], null);
	game.lastMove = [11, 13, 18, 16];
	const snapshot = game.captureMoveState();
	game.lastMove = [14, 15];
	game.board = { querySelectorAll: () => [] };
	game.turn = 'white';
	game.renderMoveHistory = () => {};
	game.updateHistoryControls = () => {};
	game.clearSquares = () => {};
	game.refreshOutcomeDisplay = () => {};
	game.setLastMoveHighlight = moves => { game.lastMove = moves.flatMap(move => [move.from, move.to]); };
	game.restoreMoveState(snapshot);
	assert.deepEqual([...game.lastMove], [11, 13, 18, 16]);
	assert.deepEqual([...snapshot.lastMove], [11, 13, 18, 16]);
});

test('last-move styling layers over square themes and preserves a distinct checked-king ring', () => {
	const stylesheet = fs.readFileSync(path.join(root, 'assets/chess.css'), 'utf8');
	assert.match(stylesheet, /#board\s+\.last-move\s*\{[^}]*background-image\s*:/s);
	assert.match(stylesheet, /#board\s+\.in-check\.last-move\s*\{[^}]*box-shadow\s*:[^}]*#b71c1c/is);
});

test('board flip toggles orientation without replacing squares or pieces and keeps pieces upright', () => {
	const makeClassList = () => {
		const values = new Set();
		return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
	};
	const pieceA = { classList: makeClassList() };
	const pieceB = { classList: makeClassList() };
	const originalPieces = [pieceA, pieceB];
	const originalSquares = [{ id: '11' }, { id: '88' }];
	const boardClasses = makeClassList();
	const board = {
		classList: boardClasses,
		dataset: { orientation: 'white' },
		offsetWidth: 600,
		querySelectorAll: selector => selector === '.piece' ? originalPieces : selector === '.square' ? originalSquares : [],
	};
	const button = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
	const originalGetElementById = context.document.getElementById;
	context.document.getElementById = id => id === 'board' ? board : id === 'flip-board' ? button : null;
	try {
		assert.equal(context.boardAnimate(), 'black');
		assert.equal(board.dataset.orientation, 'black');
		assert.equal(boardClasses.contains('animate'), true);
		assert.equal(pieceA.classList.contains('forward'), true);
		assert.equal(pieceA.classList.contains('backward'), false);
		assert.equal(button.attributes['aria-pressed'], 'true');
		assert.strictEqual(board.querySelectorAll('.piece')[0], pieceA);
		assert.strictEqual(board.querySelectorAll('.piece')[1], pieceB);
		assert.strictEqual(board.querySelectorAll('.square')[0], originalSquares[0]);
		assert.strictEqual(board.querySelectorAll('.square')[1], originalSquares[1]);

		assert.equal(context.boardAnimate(), 'white');
		assert.equal(board.dataset.orientation, 'white');
		assert.equal(boardClasses.contains('animate-backward'), true);
		assert.equal(pieceA.classList.contains('backward'), true);
		assert.equal(pieceA.classList.contains('forward'), false);
		assert.equal(button.attributes['aria-pressed'], 'false');
		assert.strictEqual(board.querySelectorAll('.piece')[0], pieceA);
		assert.strictEqual(board.querySelectorAll('.square')[0], originalSquares[0]);
	}
	finally {
		context.document.getElementById = originalGetElementById;
	}
});

test('board coordinates and accessible square names stay tied to square identity in both orientations', () => {
	const makeClassList = (...initial) => {
		const values = new Set(initial);
		return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
	};
	const makeSquare = (id, coordinate, ...classes) => {
		const attributes = { 'data-square': coordinate };
		return {
			id,
			classList: makeClassList(...classes),
			dataset: {},
			getAttribute: name => attributes[name] || null,
			setAttribute(name, value) { attributes[name] = value; },
			attribute: name => attributes[name],
		};
		};
		const a1 = makeSquare('11', '1-a', 'selected-square');
		const h8 = makeSquare('88', '8-h', 'allowed-capture', 'last-move');
		const kingImageAttributes = {};
		const kingImage = { id: 'blackKing', setAttribute(name, value) { kingImageAttributes[name] = value; } };
		h8.querySelector = selector => selector === 'img' ? kingImage : null;
		const squares = [a1, h8];
	const rowClasses = makeClassList('odd');
	const row = { classList: rowClasses, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
	const board = {
		children: [row],
		attributes: {},
		dataset: { orientation: 'white' },
		classList: makeClassList(),
		offsetWidth: 600,
		setAttribute(name, value) { this.attributes[name] = value; },
		querySelectorAll: selector => selector === '.square' ? squares : [],
	};
	assert.equal(context.initializeBoardCoordinates(board), true);
	assert.equal(board.attributes.role, 'grid');
	assert.equal(board.attributes['aria-label'], 'Chess board');
	assert.equal(row.attributes.role, 'row');
	assert.equal(a1.dataset.rank, '1');
	assert.equal(a1.dataset.file, 'a');
	assert.equal(a1.attribute('role'), 'gridcell');
	assert.equal(a1.attribute('aria-label'), 'a1');
	assert.equal(a1.attribute('tabindex'), '0', 'one square provides a predictable Tab entry point');
		assert.equal(h8.dataset.rank, '8');
		assert.equal(h8.dataset.file, 'h');
		assert.equal(h8.attribute('aria-label'), 'h8, black king');
		assert.equal(kingImageAttributes.alt, 'black king');
	assert.equal(h8.attribute('tabindex'), '-1', 'other squares use roving tabindex');

	const originalGetElementById = context.document.getElementById;
	context.document.getElementById = id => id === 'board' ? board : id === 'flip-board' ? { setAttribute() {} } : null;
	try {
		assert.equal(context.boardAnimate(), 'black');
		assert.equal(a1.attribute('aria-label'), 'a1');
		assert.equal(h8.attribute('aria-label'), 'h8, black king');
		assert.equal(a1.classList.contains('selected-square'), true);
		assert.equal(h8.classList.contains('allowed-capture'), true);
		assert.equal(h8.classList.contains('last-move'), true);
		assert.equal(context.boardAnimate(), 'white');
		assert.equal(a1.attribute('aria-label'), 'a1');
		assert.equal(h8.attribute('aria-label'), 'h8, black king');
	}
	finally {
		context.document.getElementById = originalGetElementById;
	}

	const stylesheet = fs.readFileSync(path.join(root, 'assets/chess.css'), 'utf8');
	assert.match(stylesheet, /\.square\[data-file="a"\]::before\s*\{[^}]*content:\s*attr\(data-rank\)/s);
	assert.match(stylesheet, /\.square\[data-rank="1"\]::after\s*\{[^}]*content:\s*attr\(data-file\)/s);
	assert.match(stylesheet, /\[data-orientation="black"\].*?transform:\s*rotate\(180deg\)/s);
	assert.match(stylesheet, /#board \.square:focus-visible\s*\{[^}]*outline:/s);
});

test('keyboard board navigation follows the visible orientation and activates selection, moves, and cancellation', () => {
	const squares = [11, 12, 21, 22].map(id => ({
		id: String(id),
		dataset: { rank: String(Math.floor(id / 10)), file: String.fromCharCode(96 + id % 10) },
		attributes: {},
		setAttribute(name, value) { this.attributes[name] = value; },
		focus() { this.focused = true; },
	}));
	const board = { dataset: { orientation: 'white' }, listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } };
	const game = createGame([], null);
	game.board = board;
	game.squares = squares;
	game.turn = 'white';
	game.addKeyboardControls();
	assert.equal(typeof board.listeners.keydown, 'function');
	const dispatch = (key, square) => {
		let prevented = false;
		game.handleBoardKeydown({ key, target: square, preventDefault() { prevented = true; } });
		return prevented;
	};
	assert.equal(dispatch('ArrowRight', squares[0]), true);
	assert.equal(squares[1].focused, true);
	assert.equal(squares[1].attributes.tabindex, '0');
	assert.equal(squares[0].attributes.tabindex, '-1');
	assert.equal(dispatch('ArrowUp', squares[1]), true);
	assert.equal(squares[3].focused, true);
	board.dataset.orientation = 'black';
	assert.equal(dispatch('ArrowRight', squares[3]), true);
	assert.equal(squares[2].focused, true, 'horizontal navigation reverses with the flipped board');

	const piece = { color: 'white', img: { id: 'whiteKnight1' } };
	game.getPieceByPos = position => position === 21 ? piece : null;
	let selected;
	game.pieceMove = event => { selected = event.target; };
	assert.equal(dispatch('Enter', squares[2]), true);
	assert.strictEqual(selected, piece.img);
	game.clickedPiece = piece;
	game.allowedMoves = [22];
	game.movePiece = (_event, destination) => destination;
	assert.strictEqual(game.handleBoardKeydown({ key: ' ', target: squares[3], preventDefault() {} }), squares[3]);
	let cleared = false;
	game.clearSquares = () => { cleared = true; };
	assert.equal(dispatch('Escape', squares[3]), true);
	assert.equal(game.clickedPiece, null);
	assert.equal(game.allowedMoves, null);
	assert.equal(cleared, true);
});

test('board accessible names follow the occupying piece after a move', () => {
	const makeSquare = id => ({ id: String(id), attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } });
	const origin = makeSquare(11);
	const destination = makeSquare(12);
	const imageAttributes = {};
	const piece = {
		position: 11,
		color: 'white',
		rank: 'knight',
		img: { setAttribute(name, value) { imageAttributes[name] = value; } },
	};
	const game = createGame([piece], null);
	game.squares = [origin, destination];
	assert.equal(game.updateBoardAccessibleNames(), true);
	assert.equal(origin.attributes['aria-label'], 'a1, white knight');
	assert.equal(destination.attributes['aria-label'], 'b1');
	assert.equal(imageAttributes.alt, 'white knight');
	piece.position = 12;
	assert.equal(game.updateBoardAccessibleNames(), true);
	assert.equal(origin.attributes['aria-label'], 'a1');
	assert.equal(destination.attributes['aria-label'], 'b1, white knight');
});

test('page controls and live game elements expose accessible names and semantic roles', () => {
	const markup = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
	const buttons = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
	assert.ok(buttons.length >= 10, 'the page controls are covered by the audit');
	for (const [, attributes, body] of buttons) {
		assert.match(attributes, /\btype="button"/i, 'buttons must not submit a form unexpectedly');
		const visibleName = body.replace(/<[^>]*>/g, '').trim();
		assert.ok(visibleName || /\baria-label=/i.test(attributes), `button has an accessible name: ${attributes}`);
	}
	for (const id of ['game-status', 'selection-status', 'clock-status', 'sound-status']) {
		assert.match(markup, new RegExp(`<[^>]+id="${id}"[^>]*role="status"`));
	}
	assert.match(markup, /class="winning-sign"[^>]*role="alert"/);
	assert.match(markup, /id="white-clock" role="timer"/);
	assert.match(markup, /id="black-clock" role="timer"/);
	assert.match(markup, /id="move-list" class="move-list" role="log"/);
	assert.match(markup, /<label class="sound-setting"><input id="move-sounds"/);
	assert.match(markup, /<label for="clock-preset">/);
});

test('mobile layout uses a fluid square grid and keeps captured pieces and controls within the viewport', () => {
	const markup = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
	const stylesheet = fs.readFileSync(path.join(root, 'assets/chess.css'), 'utf8');
	assert.match(markup, /<div class="game-container">/);
	assert.match(markup, /<div class="game-controls">/);
	assert.match(stylesheet, /\.game-container\s*\{[^}]*width:\s*min\(100%,\s*600px\)/s);
	assert.match(stylesheet, /#board\s*\{[^}]*width:\s*100%[^}]*aspect-ratio:\s*1/s);
	assert.match(stylesheet, /#board > div\s*\{[^}]*grid-template-columns:\s*repeat\(8,/s);
	assert.match(stylesheet, /#board > div > \.square\s*\{[^}]*aspect-ratio:\s*1/s);
	assert.match(stylesheet, /@media\s*\(max-width:\s*640px\)[\s\S]*?#sematary[\s\S]*?position:\s*static/);
	assert.match(stylesheet, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.game-controls\s*\{[^}]*flex-wrap:\s*wrap/s);
});

test('keyboard boundary, finished-game, and unavailable sound-storage states fail safely', () => {
	const square = {
		id: '11',
		dataset: { rank: '1', file: 'a' },
		setAttribute() {},
		focus() { this.focused = true; },
	};
	const game = createGame([], null);
	game.squares = [square];
	game.board = { dataset: { orientation: 'white' } };
	let prevented = false;
	assert.equal(game.handleBoardKeydown({ key: 'ArrowLeft', target: square, preventDefault() { prevented = true; } }), true);
	assert.equal(prevented, true, 'the grid consumes boundary arrows without moving focus off-board');
	assert.equal(square.focused, undefined);
	game.gameOver = true;
	assert.equal(game.handleBoardKeydown({ key: 'Enter', target: square, preventDefault() { throw new Error('finished games must not intercept input'); } }), false);

	const previousStorage = context.localStorage;
	context.localStorage = { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); } };
	try {
		const soundGame = createGame([], null);
		soundGame.moveSoundsToggle = { checked: true, listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } };
		soundGame.soundStatus = { textContent: '' };
		soundGame.addSoundControls();
		assert.equal(soundGame.moveSoundsToggle.checked, false);
		soundGame.moveSoundsToggle.checked = true;
		assert.doesNotThrow(() => soundGame.moveSoundsToggle.listeners.change());
		assert.equal(soundGame.soundStatus.textContent, 'Move sounds are on.');
	}
	finally {
		if (previousStorage === undefined) delete context.localStorage;
		else context.localStorage = previousStorage;
	}
});

test('system motion and contrast preferences retain usable chess-state indicators', () => {
	const stylesheet = fs.readFileSync(path.join(root, 'assets/chess.css'), 'utf8');
	assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:\s*0\.01ms/);
	assert.match(stylesheet, /@media\s*\(prefers-contrast:\s*more\)[\s\S]*?#board \.selected-square[\s\S]*?outline:/);
	assert.match(stylesheet, /@media\s*\(forced-colors:\s*active\)[\s\S]*?outline:\s*3px solid Highlight/);
});

test('rook generates horizontal and vertical moves from a central square', () => {
  const Rook = pieceClass('Rook');
  const rook = new Rook(44, 'whiteRook1');

  assert.deepEqual(validPositions(rook.getAllowedMoves()), [14, 24, 34, 41, 42, 43, 45, 46, 47, 48, 54, 64, 74, 84]);
});

test('bishop generates four diagonal rays from a central square', () => {
  const Bishop = pieceClass('Bishop');
  const bishop = new Bishop(44, 'whiteBishop1');

  assert.deepEqual(validPositions(bishop.getAllowedMoves()), [11, 17, 22, 26, 33, 35, 53, 55, 62, 66, 71, 77, 88]);
});

test('queen combines rook-like and bishop-like movement', () => {
  const Queen = pieceClass('Queen');
  const queen = new Queen(44, 'whiteQueen');

  assert.deepEqual(validPositions(queen.getAllowedMoves()), [11, 14, 17, 22, 24, 26, 33, 34, 35, 41, 42, 43, 45, 46, 47, 48, 53, 54, 55, 62, 64, 66, 71, 74, 77, 84, 88]);
});

test('knight generates all eight moves from a central square', () => {
  const Knight = pieceClass('Knight');
  const knight = new Knight(44, 'whiteKnight1');

  assert.deepEqual(validPositions(knight.getAllowedMoves()), [23, 25, 32, 36, 52, 56, 63, 65]);
});

test('knight movement stays on the board from a corner', () => {
  const Knight = pieceClass('Knight');
  const knight = new Knight(11, 'whiteKnight1');

  assert.deepEqual(validPositions(knight.getAllowedMoves()), [23, 32]);
});

test('king movement from a corner is limited to adjacent board squares', () => {
  const King = pieceClass('King');
  const king = new King(11, 'whiteKing');

  assert.deepEqual(validPositions(king.getAllowedMoves()), [12, 21, 22]);
});

test('white pawn has one- and two-square advances on its starting rank', () => {
  const Pawn = pieceClass('Pawn');
  const pawn = new Pawn(24, 'whitePawn4');
  const [attacks, advances] = pawn.getAllowedMoves();

  assert.deepEqual([...attacks], [33, 35]);
  assert.deepEqual([...advances], [34, 44]);
});

test('black pawn has one- and two-square advances on its starting rank', () => {
  const Pawn = pieceClass('Pawn');
  const pawn = new Pawn(75, 'blackPawn5');
  const [attacks, advances] = pawn.getAllowedMoves();

  assert.deepEqual([...attacks], [66, 64]);
  assert.deepEqual([...advances], [65, 55]);
});

test('pawns do not receive a two-square advance after leaving their starting rank', () => {
  const Pawn = pieceClass('Pawn');
  const whitePawn = new Pawn(34, 'whitePawn4');
  const blackPawn = new Pawn(65, 'blackPawn5');

  assert.deepEqual([...whitePawn.getAllowedMoves()[1]], [44]);
  assert.deepEqual([...blackPawn.getAllowedMoves()[1]], [55]);
});

test('sliding-piece rays stop at the board edges', () => {
  const Rook = pieceClass('Rook');
  const Bishop = pieceClass('Bishop');
  const rook = new Rook(11, 'whiteRook1');
  const bishop = new Bishop(11, 'whiteBishop1');

  assert.deepEqual(validPositions(rook.getAllowedMoves()), [12, 13, 14, 15, 16, 17, 18, 21, 31, 41, 51, 61, 71, 81]);
  assert.deepEqual(validPositions(bishop.getAllowedMoves()), [22, 33, 44, 55, 66, 77, 88]);
});

test('king legal moves from the h-file never include off-board file 9 squares', () => {
  const King = pieceClass('King');
  const king = new King(18, 'whiteKing');
  const game = createGame([king], king);

  assert.deepEqual([...game.unblockedPositions(king.getAllowedMoves(), king.position, 'white', true)].sort((a, b) => a - b), [17, 27, 28]);
});

test('a pinned rook may move along its pin but not expose its king', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const whiteRook = new Rook(25, 'whiteRook1');
  const blackKing = new King(88, 'blackKing');
  const blackRook = new Rook(85, 'blackRook1');
  const game = createGame([whiteKing, whiteRook, blackKing, blackRook], whiteRook);

  assert.deepEqual([...game.unblockedPositions(whiteRook.getAllowedMoves(), whiteRook.position, 'white', true)], [35, 45, 55, 65, 75, 85]);
});

test('king cannot move onto a square attacked by an enemy rook', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const blackKing = new King(88, 'blackKing');
  const blackRook = new Rook(85, 'blackRook1');
  const game = createGame([whiteKing, blackKing, blackRook], whiteKing);

  assert.deepEqual([...game.unblockedPositions(whiteKing.getAllowedMoves(), whiteKing.position, 'white', true)].sort((a, b) => a - b), [14, 16, 24, 26]);
});

test('check feedback announces the checked side, highlights its king, and clears after check ends', () => {
  const King = pieceClass('King');
  const whiteKing = new King(15, 'whiteKing');
  const blackKing = new King(85, 'blackKing');
  const game = createGame([whiteKing, blackKing], null);
  const makeClassList = () => {
    const values = new Set();
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value),
    };
  };
  const squares = [
    { id: '15', classList: makeClassList() },
    { id: '85', classList: makeClassList() },
  ];
  const statusClassList = makeClassList();
  game.turn = 'black';
  game.squares = squares;
  game.board = {
    querySelectorAll: (selector) => selector === '.in-check'
      ? squares.filter((square) => square.classList.contains('in-check'))
      : [],
  };
  game.gameStatus = { textContent: '', classList: statusClassList };
  game.king_checked = (color) => color === 'black';

  game.updateCheckStatus();

  assert.equal(game.gameStatus.textContent, 'Black is in check.');
  assert.equal(squares[1].classList.contains('in-check'), true);
  assert.equal(game.gameStatus.classList.contains('is-check'), true);

  game.turn = 'white';
  game.king_checked = () => false;
  game.updateCheckStatus();

  assert.equal(game.gameStatus.textContent, 'White to move.');
  assert.equal(squares[1].classList.contains('in-check'), false);
  assert.equal(game.gameStatus.classList.contains('is-check'), false);
});

test('checkmate announces the result as an accessible alert', () => {
  const makeClassList = () => {
    const values = new Set();
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value),
    };
  };
  const message = { textContent: '', innerHTML: '' };
  const endScene = {
    classList: makeClassList(),
    getElementsByClassName: () => [message],
  };
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = (id) => id === 'endscene' ? endScene : null;

  try {
    const game = createGame([], null);
    game.gameStatus = { textContent: '', classList: makeClassList() };
    game.checkmate('white');

    assert.equal(message.textContent, 'Checkmate. White wins.');
    assert.equal(game.gameStatus.textContent, 'Checkmate. White wins.');
    assert.equal(endScene.classList.contains('show'), true);
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }
});

test('terminal outcomes distinguish checkmate, stalemate, check, and an active position', () => {
  const game = createGame([], null);
  let checked = false;
  let noLegalMoves = false;
  game.king_checked = () => checked;
  game.king_dead = () => noLegalMoves;

  assert.equal(game.getGameOutcome('black'), 'ongoing');
  checked = true;
  assert.equal(game.getGameOutcome('black'), 'check');
  noLegalMoves = true;
  assert.equal(game.getGameOutcome('black'), 'checkmate');
  checked = false;
  assert.equal(game.getGameOutcome('black'), 'stalemate');
});

test('stalemate announces a draw and clears check styling', () => {
  const makeClassList = () => {
    const values = new Set();
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value),
    };
  };
  const message = { textContent: '' };
  const endScene = {
    classList: makeClassList(),
    getElementsByClassName: () => [message],
  };
  const statusClassList = makeClassList();
  statusClassList.add('is-check');
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = (id) => id === 'endscene' ? endScene : null;

  try {
    const game = createGame([], null);
    game.gameStatus = { textContent: '', classList: statusClassList };
    game.stalemate();

    assert.equal(message.textContent, 'Draw by stalemate.');
    assert.equal(game.gameStatus.textContent, 'Draw by stalemate.');
    assert.equal(statusClassList.contains('is-check'), false);
    assert.equal(endScene.classList.contains('show'), true);
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }
});

test('black king has no legal moves but is not in check in a known stalemate position', () => {
  const King = pieceClass('King');
  const Queen = pieceClass('Queen');
  const blackKing = new King(88, 'blackKing');
  const whiteKing = new King(76, 'whiteKing');
  const whiteQueen = new Queen(67, 'whiteQueen');
  const game = createGame([blackKing, whiteKing, whiteQueen], blackKing);

  assert.equal(game.getGameOutcome('black'), 'stalemate');
});

test('king may castle on either side when the path is clear and safe', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const game = createGame([
    whiteKing,
    new Rook(11, 'whiteRook1'),
    new Rook(18, 'whiteRook2'),
    new King(88, 'blackKing'),
  ], whiteKing);
  game.turn = 'white';

  const candidateMoves = game.getCastlingSquares(whiteKing.getAllowedMoves());
  const legalMoves = [...game.unblockedPositions(candidateMoves, whiteKing.position, 'white', true)];

  assert.ok(legalMoves.includes(13), 'queenside castling should be available');
  assert.ok(legalMoves.includes(17), 'kingside castling should be available');
});

test('king cannot castle out of check or through an attacked transit square', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const checkedGame = createGame([
    whiteKing,
    new Rook(11, 'whiteRook1'),
    new Rook(18, 'whiteRook2'),
    new King(88, 'blackKing'),
    new Rook(85, 'blackRook1'),
  ], whiteKing);
  checkedGame.turn = 'white';
  const checkedCandidates = checkedGame.getCastlingSquares(whiteKing.getAllowedMoves());
  const checkedMoves = [...checkedGame.unblockedPositions(checkedCandidates, whiteKing.position, 'white', true)];

  assert.equal(checkedMoves.includes(13), false);
  assert.equal(checkedMoves.includes(17), false);

  const transitKing = new King(15, 'whiteKing');
  const transitGame = createGame([
    transitKing,
    new Rook(11, 'whiteRook1'),
    new Rook(18, 'whiteRook2'),
    new King(88, 'blackKing'),
    new Rook(86, 'blackRook1'),
  ], transitKing);
  transitGame.turn = 'white';
  const transitCandidates = transitGame.getCastlingSquares(transitKing.getAllowedMoves());
  const transitMoves = [...transitGame.unblockedPositions(transitCandidates, transitKing.position, 'white', true)];

  assert.equal(transitMoves.includes(17), false, 'kingside castling crosses attacked f1');
  assert.ok(transitMoves.includes(13), 'queenside castling remains legal');
});

test('king and rook permanently lose castling rights after moving and returning', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const king = new King(15, 'whiteKing');
  const rook = new Rook(18, 'whiteRook2');

  king.changePosition(16, true);
  king.changePosition(15, true);
  rook.changePosition(28);
  rook.changePosition(18);

  assert.equal(king.ableToCastle, false);
  assert.equal(rook.ableToCastle, false);
});

function legalPawnMoves(game, pawn) {
  game.clickedPiece = pawn;
  return [...game.unblockedPositions(pawn.getAllowedMoves(), pawn.position, pawn.color, true)];
}

test('a pawn two-square advance creates an en passant target that expires after the next move', () => {
  const Pawn = pieceClass('Pawn');
  const Knight = pieceClass('Knight');
  const blackPawn = new Pawn(56, 'blackPawn6');
  const game = createGame([blackPawn], blackPawn);

  game.recordEnPassantOpportunity(blackPawn, 76, 56);
  assert.equal(game.enPassantTarget, 66);
  assert.equal(game.enPassantPawn, blackPawn);

  game.recordEnPassantOpportunity(new Knight(12, 'whiteKnight1'), 12, 33);
  assert.equal(game.enPassantTarget, null);
  assert.equal(game.enPassantPawn, null);
});

test('white pawn may capture a black pawn en passant on the immediately following move', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const whiteKing = new King(15, 'whiteKing');
  const whitePawn = new Pawn(55, 'whitePawn5');
  const blackPawn = new Pawn(56, 'blackPawn6');
  const game = createGame([whiteKing, whitePawn, blackPawn, new King(88, 'blackKing')], whitePawn);
  game.recordEnPassantOpportunity(blackPawn, 76, 56);

  const moves = legalPawnMoves(game, whitePawn);

  assert.ok(moves.includes(66));
  assert.equal(game.getPieceByPos(66), undefined, 'the capture target square is empty before the move');
});

test('black pawn may capture a white pawn en passant after its two-square advance', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const whitePawn = new Pawn(45, 'whitePawn5');
  const blackPawn = new Pawn(44, 'blackPawn4');
  const game = createGame([new King(11, 'whiteKing'), whitePawn, blackPawn, new King(88, 'blackKing')], blackPawn);
  game.recordEnPassantOpportunity(whitePawn, 25, 45);

  const moves = legalPawnMoves(game, blackPawn);

  assert.ok(moves.includes(35));
});

test('en passant is illegal when removing both pawns exposes the moving king to a rook', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(51, 'whiteKing');
  const whitePawn = new Pawn(55, 'whitePawn5');
  const blackPawn = new Pawn(56, 'blackPawn6');
  const game = createGame([
    whiteKing,
    whitePawn,
    blackPawn,
    new Rook(58, 'blackRook1'),
    new King(88, 'blackKing'),
  ], whitePawn);
  game.recordEnPassantOpportunity(blackPawn, 76, 56);

  assert.equal(legalPawnMoves(game, whitePawn).includes(66), false);
});

test('en passant removes the adjacent pawn, moves the capturing pawn, and ends the opportunity', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const whiteKing = new King(15, 'whiteKing');
  const whitePawn = new Pawn(55, 'whitePawn5');
  const blackPawn = new Pawn(56, 'blackPawn6');
  const game = createGame([whiteKing, whitePawn, blackPawn, new King(88, 'blackKing')], whitePawn);
  const capturedSlot = { append: (image) => { image.parentNode = capturedSlot; } };
  const blackGraveyard = { querySelector: () => capturedSlot };
  const originalSquare = { removeChild: (image) => { image.parentNode = null; } };
  const targetSquare = {
    id: '66',
    classList: { contains: (name) => name === 'allowed' },
    getAttribute: (name) => name === 'id' ? '66' : null,
    append: (image) => { image.parentNode = targetSquare; },
  };
  const originalGetElementsByClassName = context.document.getElementsByClassName;
  game.turn = 'white';
  game.board = { querySelectorAll: () => [] };
  game.squares = [];
  game.turnSign = { innerHTML: '' };
  game.gameStatus = { textContent: '', classList: { add() {}, remove() {} } };
  game.whiteSematary = { querySelector: () => ({ append() {} }) };
  game.blackSematary = blackGraveyard;
  blackPawn.img.parentNode = originalSquare;
  game.recordEnPassantOpportunity(blackPawn, 76, 56);
  context.document.getElementsByClassName = () => [];

  try {
    game.movePiece(null, targetSquare);
  }
  finally {
    context.document.getElementsByClassName = originalGetElementsByClassName;
  }

  assert.equal(whitePawn.position, 66);
  assert.equal(game.getPieceByPos(56), undefined);
  assert.equal(game.pieces.includes(blackPawn), false);
  assert.equal(blackPawn.img.parentNode, capturedSlot);
  assert.equal(game.turn, 'black');
  assert.equal(game.enPassantTarget, null);
});

test('a pawn reaching the last rank waits for a promotion choice before ending the turn', () => {
  const Pawn = pieceClass('Pawn');
  const pawn = new Pawn(78, 'whitePawn8');
  pawn.img.src = './assets/img/whitePawn.png';
  const game = createGame([pawn], pawn);
  let finishedMoves = 0;
  game.turn = 'white';
  game.promotionDialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
    querySelector() { return { focus() {} }; },
  };
  game.board = { querySelectorAll: () => [] };
  game.finishMove = () => { finishedMoves += 1; };
  const targetSquare = {
    classList: { contains: (name) => name === 'allowed' },
    getAttribute: (name) => name === 'id' ? '88' : null,
    append: (image) => { image.parentNode = targetSquare; },
  };
  const originalGame = context.game;
  const originalGetElementsByClassName = context.document.getElementsByClassName;
  context.game = game;
  context.document.getElementsByClassName = () => [];

  try {
    game.movePiece(null, targetSquare);
  }
  finally {
    if (originalGame === undefined) delete context.game;
    else context.game = originalGame;
    context.document.getElementsByClassName = originalGetElementsByClassName;
  }

  assert.equal(pawn.position, 88);
  assert.equal(game.pendingPromotion, pawn);
  assert.equal(game.promotionDialog.open, true);
  assert.equal(game.turn, 'white');
  assert.equal(finishedMoves, 0);
});

test('promotion offers queen, rook, bishop, and knight with unique identities and matching sprites', () => {
  const Pawn = pieceClass('Pawn');
  const choices = ['queen', 'rook', 'bishop', 'knight'];
  const pawns = choices.map((choice, index) => {
    const pawn = new Pawn(81 + index, `whitePawn${index + 1}`);
    pawn.img.src = './assets/img/whitePawn.png';
    pawn.img.className = 'piece pawn';
    return pawn;
  });
  const game = createGame([...pawns], null);
  const finishedColors = [];
  game.promotionCounter = 0;
  game.promotionDialog = { open: false, close() { this.open = false; } };
  game.finishMove = (color) => { finishedColors.push(color); };
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = (id) => pawns.find((pawn) => pawn.img.id === id)?.img || { id };

  try {
    game.pendingPromotion = pawns[0];
    game.promotionDialog.open = true;
    assert.equal(game.promote(pawns[0], 'king'), null, 'only the four legal promotion pieces are accepted');
    assert.equal(game.pendingPromotion, pawns[0]);
    assert.equal(game.pieces.includes(pawns[0]), true);

    for (let index = 0; index < choices.length; index += 1) {
      const pawn = pawns[index];
      const choice = choices[index];
      game.pendingPromotion = pawn;
      game.promotionDialog.open = true;
      game.selectPromotion({
        currentTarget: { getAttribute: (name) => name === 'data-promotion' ? choice : null },
      });

      const promotedPiece = game.pieces.find((piece) => piece.img === pawn.img);
      const capitalizedChoice = choice[0].toUpperCase() + choice.slice(1);
      assert.equal(promotedPiece.rank, choice);
      assert.equal(promotedPiece.position, pawn.position);
      assert.equal(promotedPiece.img.className, `piece ${choice}`);
      assert.equal(promotedPiece.img.src, `./assets/img/white${capitalizedChoice}.png`);
      assert.match(promotedPiece.name, new RegExp(`^white${capitalizedChoice}Promoted\\d+$`));
      assert.equal(promotedPiece.img.id, promotedPiece.name);
      assert.equal(game.pendingPromotion, null);
      assert.equal(game.promotionDialog.open, false);
    }
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }

  const promotedNames = game.pieces.map((piece) => piece.name).filter((name) => name.includes('Promoted'));
  assert.equal(new Set(promotedNames).size, 4);
  assert.deepEqual(finishedColors, ['white', 'white', 'white', 'white']);
});

test('kings alone and a single bishop or knight are insufficient mating material', () => {
  const King = pieceClass('King');
  const Bishop = pieceClass('Bishop');
  const Knight = pieceClass('Knight');
  const examples = [
    [new King(15, 'whiteKing'), new King(85, 'blackKing')],
    [new King(15, 'whiteKing'), new King(85, 'blackKing'), new Bishop(23, 'whiteBishop1')],
    [new King(15, 'whiteKing'), new King(85, 'blackKing'), new Knight(23, 'blackKnight1')],
  ];

  for (const pieces of examples) {
    const game = createGame(pieces, null);
    assert.equal(game.hasInsufficientMaterial(), true);
  }
});

test('bishop-only positions draw only when all bishops occupy the same square color', () => {
  const King = pieceClass('King');
  const Bishop = pieceClass('Bishop');
  const sameColorGame = createGame([
    new King(15, 'whiteKing'),
    new King(85, 'blackKing'),
    new Bishop(23, 'whiteBishop1'),
    new Bishop(45, 'blackBishop1'),
  ], null);
  const oppositeColorGame = createGame([
    new King(15, 'whiteKing'),
    new King(85, 'blackKing'),
    new Bishop(23, 'whiteBishop1'),
    new Bishop(44, 'blackBishop1'),
  ], null);

  assert.equal(sameColorGame.hasInsufficientMaterial(), true);
  assert.equal(oppositeColorGame.hasInsufficientMaterial(), false);
});

test('pawns, rooks, queens, and multiple knights prevent an insufficient-material draw', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const Rook = pieceClass('Rook');
  const Queen = pieceClass('Queen');
  const Knight = pieceClass('Knight');
  const examples = [
    new Pawn(23, 'whitePawn1'),
    new Rook(23, 'whiteRook1'),
    new Queen(23, 'whiteQueen'),
  ];

  for (const extraPiece of examples) {
    const game = createGame([
      new King(15, 'whiteKing'),
      new King(85, 'blackKing'),
      extraPiece,
    ], null);
    assert.equal(game.hasInsufficientMaterial(), false, `${extraPiece.rank} at ${extraPiece.position}`);
  }

  const twoKnightsGame = createGame([
    new King(15, 'whiteKing'),
    new King(85, 'blackKing'),
    new Knight(23, 'whiteKnight1'),
    new Knight(24, 'whiteKnight2'),
  ], null);
  assert.equal(twoKnightsGame.hasInsufficientMaterial(), false);
});

test('insufficient material is reported as a draw only after checkmate and stalemate are ruled out', () => {
  const King = pieceClass('King');
  const game = createGame([
    new King(15, 'whiteKing'),
    new King(85, 'blackKing'),
  ], null);
  let checked = false;
  let noLegalMoves = false;
  game.king_checked = () => checked;
  game.king_dead = () => noLegalMoves;

  assert.equal(game.getGameOutcome('white'), 'insufficient-material');
  noLegalMoves = true;
  assert.equal(game.getGameOutcome('white'), 'stalemate');
  checked = true;
  assert.equal(game.getGameOutcome('white'), 'checkmate');
});

test('insufficient material announces an accessible draw and clears check styling', () => {
  const makeClassList = () => {
    const values = new Set();
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value),
    };
  };
  const message = { textContent: '' };
  const endScene = {
    classList: makeClassList(),
    getElementsByClassName: () => [message],
  };
  const statusClassList = makeClassList();
  statusClassList.add('is-check');
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = (id) => id === 'endscene' ? endScene : null;

  try {
    const game = createGame([], null);
    game.gameStatus = { textContent: '', classList: statusClassList };
    game.drawByInsufficientMaterial();

    assert.equal(message.textContent, 'Draw by insufficient material.');
    assert.equal(game.gameStatus.textContent, 'Draw by insufficient material.');
    assert.equal(statusClassList.contains('is-check'), false);
    assert.equal(endScene.classList.contains('show'), true);
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }
});

test('finishMove presents an insufficient-material outcome as a draw', () => {
  const game = createGame([], null);
  let drawAnnounced = false;
  game.changeTurn = () => {};
  game.getGameOutcome = () => 'insufficient-material';
  game.updateCheckStatus = () => {};
  game.drawByInsufficientMaterial = () => { drawAnnounced = true; };

  game.finishMove('white');

  assert.equal(drawAnnounced, true);
});

test('half-move clock resets for pawn moves and captures, and advances for quiet piece moves', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const Rook = pieceClass('Rook');
  const game = createGame([], null);
  game.halfmoveClock = 0;

  game.recordHalfmove(new Rook(11, 'whiteRook1'), false);
  game.recordHalfmove(new King(15, 'whiteKing'), false);
  assert.equal(game.halfmoveClock, 2);

  game.recordHalfmove(new Pawn(21, 'whitePawn1'), false);
  assert.equal(game.halfmoveClock, 0);

  game.halfmoveClock = 37;
  game.recordHalfmove(new Rook(11, 'whiteRook1'), true);
  assert.equal(game.halfmoveClock, 0);
});

test('castling rook movement does not count as an additional half-move', () => {
  const Rook = pieceClass('Rook');
  const rook = new Rook(11, 'whiteRook1');
  const game = createGame([rook], rook);
  const targetSquare = {
    classList: {
      contains: (name) => name === 'allowed',
      add() {},
    },
    getAttribute: (name) => name === 'id' ? '14' : null,
    append() {},
  };
  const originalGetElementById = context.document.getElementById;
  game.halfmoveClock = 12;
  game.getPieceByName = () => rook;
  game.clearSquares = () => {};
  game.finishMove = () => {};
  game.changeTurn = () => {};
  context.document.getElementById = () => targetSquare;

  try {
    game.castleRook('whiteRook1');
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }

  assert.equal(game.halfmoveClock, 12);
  assert.equal(game.isCastlingRookMove, false);
  assert.deepEqual({ ...game.pendingCastleRookMove }, { from: 11, to: 14 });
});

test('the fifty-move draw is reached at 100 half-moves unless checkmate or stalemate takes precedence', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const game = createGame([whiteKing, new King(85, 'blackKing'), new Rook(11, 'whiteRook1')], whiteKing);
  game.halfmoveClock = 99;
  game.king_checked = () => false;
  game.king_dead = () => false;

  game.recordHalfmove(whiteKing, false);
  assert.equal(game.halfmoveClock, 100);
  assert.equal(game.getGameOutcome('black'), 'fifty-move-draw');

  game.king_dead = () => true;
  assert.equal(game.getGameOutcome('black'), 'stalemate');
  game.king_checked = () => true;
  assert.equal(game.getGameOutcome('black'), 'checkmate');
});

test('finishMove announces the fifty-move draw in the end scene and live status', () => {
  const makeClassList = () => {
    const values = new Set();
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value),
    };
  };
  const message = { textContent: '' };
  const endScene = {
    classList: makeClassList(),
    getElementsByClassName: () => [message],
  };
  const statusClassList = makeClassList();
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = (id) => id === 'endscene' ? endScene : null;

  try {
    const game = createGame([], null);
    game.gameStatus = { textContent: '', classList: statusClassList };
    game.changeTurn = () => {};
    game.getGameOutcome = () => 'fifty-move-draw';
    game.updateCheckStatus = () => {};

    game.finishMove('white');

    assert.equal(message.textContent, 'Draw by the fifty-move rule.');
    assert.equal(game.gameStatus.textContent, 'Draw by the fifty-move rule.');
    assert.equal(endScene.classList.contains('show'), true);
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }
});

test('threefold repetition is counted only when the same position occurs three times', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const blackKing = new King(85, 'blackKing');
  const rook = new Rook(11, 'whiteRook1');
  const game = createGame([whiteKing, blackKing, rook], whiteKing);
  game.turn = 'white';
  game.positionCounts = new Map();

  game.recordPosition();
  assert.equal(game.hasThreefoldRepetition(), false);
  game.recordPosition();
  assert.equal(game.hasThreefoldRepetition(), false);
  game.recordPosition();
  assert.equal(game.hasThreefoldRepetition(), true);
});

test('repetition identity includes side to move and castling rights', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const blackKing = new King(85, 'blackKing');
  const rook = new Rook(11, 'whiteRook1');
  const game = createGame([whiteKing, blackKing, rook], whiteKing);
  game.turn = 'white';
  game.enPassantTarget = null;
  game.enPassantPawn = null;
  const initialPosition = game.getPositionKey();

  game.turn = 'black';
  assert.notEqual(game.getPositionKey(), initialPosition);
  game.turn = 'white';
  whiteKing.ableToCastle = false;
  assert.notEqual(game.getPositionKey(), initialPosition);
});

test('en passant affects repetition identity only when a legal capture is available', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const blackKing = new King(88, 'blackKing');
  const whitePawn = new Pawn(55, 'whitePawn5');
  const blackPawn = new Pawn(56, 'blackPawn6');
  const game = createGame([whiteKing, blackKing, whitePawn, blackPawn], whitePawn);
  game.turn = 'white';
  game.enPassantTarget = null;
  game.enPassantPawn = null;
  const withoutOpportunity = game.getPositionKey();

  game.recordEnPassantOpportunity(blackPawn, 76, 56);
  assert.notEqual(game.getPositionKey(), withoutOpportunity);

  const noAdjacentPawn = createGame([whiteKing, blackKing, blackPawn], null);
  noAdjacentPawn.turn = 'white';
  const noAdjacentPawnWithoutOpportunity = noAdjacentPawn.getPositionKey();
  noAdjacentPawn.recordEnPassantOpportunity(blackPawn, 76, 56);
  assert.equal(noAdjacentPawn.getPositionKey(), noAdjacentPawnWithoutOpportunity);

  const pinnedKing = new King(51, 'whiteKing');
  const pinnedWhitePawn = new Pawn(55, 'whitePawn5');
  const pinnedBlackPawn = new Pawn(56, 'blackPawn6');
  const pinnedRook = new Rook(58, 'blackRook1');
  const pinnedGame = createGame([
    pinnedKing,
    new King(88, 'blackKing'),
    pinnedWhitePawn,
    pinnedBlackPawn,
    pinnedRook,
  ], null);
  pinnedGame.turn = 'white';
  const pinnedPositionWithoutOpportunity = pinnedGame.getPositionKey();
  pinnedGame.recordEnPassantOpportunity(pinnedBlackPawn, 76, 56);
  assert.equal(pinnedGame.getPositionKey(), pinnedPositionWithoutOpportunity);
});

test('threefold repetition is classified after checkmate, stalemate, and other draw rules', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const game = createGame([whiteKing, new King(85, 'blackKing'), new Rook(11, 'whiteRook1')], whiteKing);
  game.king_checked = () => false;
  game.king_dead = () => false;
  game.hasInsufficientMaterial = () => false;
  game.halfmoveClock = 0;
  game.hasThreefoldRepetition = () => true;

  assert.equal(game.getGameOutcome('black'), 'threefold-repetition');
  game.king_dead = () => true;
  assert.equal(game.getGameOutcome('black'), 'stalemate');
  game.king_checked = () => true;
  assert.equal(game.getGameOutcome('black'), 'checkmate');
});

test('finishMove records repeated positions and announces the third occurrence', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const game = createGame([
    new King(15, 'whiteKing'),
    new King(85, 'blackKing'),
    new Rook(11, 'whiteRook1'),
  ], null);
  const makeClassList = () => {
    const values = new Set();
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value),
    };
  };
  const message = { textContent: '' };
  const endScene = {
    classList: makeClassList(),
    getElementsByClassName: () => [message],
  };
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = (id) => id === 'endscene' ? endScene : null;
  game.turn = 'white';
  game.positionCounts = new Map();
  game.recordPosition();
  game.changeTurn = () => { game.turn = game.turn === 'white' ? 'black' : 'white'; };
  game.king_checked = () => false;
  game.king_dead = () => false;
  game.hasInsufficientMaterial = () => false;
  game.halfmoveClock = 0;
  game.gameStatus = { textContent: '', classList: makeClassList() };
  game.updateCheckStatus = () => {};

  try {
    for (let index = 0; index < 4; index += 1) game.finishMove('black');
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }

  assert.equal(message.textContent, 'Draw by threefold repetition.');
  assert.equal(game.gameStatus.textContent, 'Draw by threefold repetition.');
  assert.equal(endScene.classList.contains('show'), true);
});


test('move history formats SAN for quiet moves, captures, castling, promotion, and check', () => {
  const game = createGame([], null);
  assert.equal(game.formatMove({ rank: 'pawn', from: 25, to: 45, isCapture: false }), 'e4');
  assert.equal(game.formatMove({ rank: 'pawn', from: 55, to: 66, isCapture: true }), 'exf6');
  assert.equal(game.formatMove({ rank: 'knight', from: 17, to: 36, isCapture: false }), 'Nf3');
  assert.equal(game.formatMove({ rank: 'king', from: 15, to: 17, isCapture: false }), 'O-O');
  assert.equal(game.formatMove({ rank: 'king', from: 15, to: 13, isCapture: false }), 'O-O-O');
  assert.equal(game.formatMove({ rank: 'pawn', from: 78, to: 88, isCapture: false, promotion: 'queen' }), 'h8=Q');
  assert.equal(game.formatMove({ rank: 'knight', from: 22, to: 43, isCapture: false, disambiguation: 'b' }), 'Nbc4');
  assert.equal(game.formatMove({ rank: 'queen', from: 15, to: 55, isCapture: false, checkSuffix: '+' }), 'Qe5+');
  assert.equal(game.formatMove({ rank: 'queen', from: 15, to: 55, isCapture: true, checkSuffix: '#' }), 'Qxe5#');
});

test('SAN disambiguation considers legal same-color pieces and chooses file, rank, or full origin', () => {
  const King = pieceClass('King');
  const Knight = pieceClass('Knight');

  const fileGame = createGame([
    new King(11, 'whiteKing'), new King(88, 'blackKing'),
    new Knight(22, 'whiteKnight1'), new Knight(24, 'whiteKnight2'),
  ], null);
  assert.equal(fileGame.getMoveDisambiguation(fileGame.pieces[2], 43), 'b');

  const rankGame = createGame([
    new King(11, 'whiteKing'), new King(88, 'blackKing'),
    new Knight(22, 'whiteKnight1'), new Knight(62, 'whiteKnight2'),
  ], null);
  assert.equal(rankGame.getMoveDisambiguation(rankGame.pieces[2], 43), '2');

  const fullSquareGame = createGame([
    new King(11, 'whiteKing'), new King(88, 'blackKing'),
    new Knight(23, 'whiteKnight1'), new Knight(63, 'whiteKnight2'), new Knight(25, 'whiteKnight3'),
  ], null);
  assert.equal(fullSquareGame.getMoveDisambiguation(fullSquareGame.pieces[2], 44), 'c2');
});

test('SAN disambiguation ignores a same-type piece pinned to its king', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteRook = new Rook(21, 'whiteRook1');
  const game = createGame([
    new King(15, 'whiteKing'), new King(88, 'blackKing'),
    whiteRook, new Rook(25, 'whiteRook2'), new Rook(85, 'blackRook1'),
  ], whiteRook);

  assert.equal(game.getMoveDisambiguation(whiteRook, 24), '');
});

test('undo and redo restore ordinary-move board, turn, history, clock, and repetition state', () => {
  const King = pieceClass('King');
  const Knight = pieceClass('Knight');
  const whiteKnight = new Knight(17, 'whiteKnight1');
  const game = createGame([
    new King(15, 'whiteKing'), new King(85, 'blackKing'), whiteKnight,
  ], whiteKnight);
  game.turn = 'white';
  game.turnSign = { innerHTML: '' };
  game.moveList = null;
  game.emptyMoveHistory = { hidden: false };
  game.moveHistory = [];
  game.halfmoveClock = 0;
  game.positionCounts = new Map([['before', 1]]);
  game.undoStack = [];
  game.redoStack = [];
  game.updateCheckStatus = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.clearSquares = () => {};

  const before = game.captureMoveState();
  whiteKnight.position = 36;
  game.turn = 'black';
  game.halfmoveClock = 1;
  game.moveHistory = ['1. Nf3'];
  game.positionCounts.set('after', 1);
  game.pendingUndoEntry = { before, piece: whiteKnight, from: 17, to: 36, supported: true };
  game.commitPendingUndoMove();

  assert.equal(game.undoMove(), true);
  assert.equal(whiteKnight.position, 17);
  assert.equal(game.turn, 'white');
  assert.equal(game.halfmoveClock, 0);
  assert.equal(game.moveHistory.length, 0);
  assert.equal(game.positionCounts.get('before'), 1);
  assert.equal(game.positionCounts.has('after'), false);
  assert.equal(game.emptyMoveHistory.hidden, false);

  assert.equal(game.redoMove(), true);
  assert.equal(whiteKnight.position, 36);
  assert.equal(game.turn, 'black');
  assert.equal(game.halfmoveClock, 1);
  assert.equal(game.moveHistory.length, 1);
  assert.equal(game.moveHistory[0], '1. Nf3');
  assert.equal(game.positionCounts.get('after'), 1);
});

test('a new ordinary move clears redo history and unsupported moves block undo', () => {
  const game = createGame([], null);
  game.undoStack = [{ supported: true, before: {}, after: {} }];
  game.redoStack = [];
  game.restoreMoveState = () => {};
  assert.equal(game.undoMove(), true);
  assert.equal(game.redoStack.length, 1);
  game.pendingUndoEntry = {
    before: { pieces: [], turn: 'white', halfmoveClock: 0, enPassantTarget: null, enPassantPawn: null, positionCounts: new Map(), moveHistory: [] },
    supported: true,
  };
  game.captureMoveState = () => ({ pieces: [], turn: 'black', halfmoveClock: 1, enPassantTarget: null, enPassantPawn: null, positionCounts: new Map(), moveHistory: [] });
  game.commitPendingUndoMove();
  assert.equal(game.redoStack.length, 0);

  game.undoStack.push({ supported: false });
  assert.equal(game.undoMove(), false);
  assert.equal(game.undoStack.length, 2);
});

test('history buttons and keyboard shortcuts drive undo and redo with accurate disabled states', () => {
  const game = createGame([], null);
  const listeners = { undo: {}, redo: {} };
  const undoButton = {
    disabled: false,
    addEventListener(type, callback) { listeners.undo[type] = callback; },
  };
  const redoButton = {
    disabled: false,
    addEventListener(type, callback) { listeners.redo[type] = callback; },
  };
  let keydown;
  const originalGetElementById = context.document.getElementById;
  const originalAddEventListener = context.document.addEventListener;
  context.document.getElementById = id => ({ 'undo-move': undoButton, 'redo-move': redoButton }[id] || { id });
  context.document.addEventListener = (type, callback) => { if (type === 'keydown') keydown = callback; };
  const entry = { supported: true, before: {}, after: {} };
  game.undoStack = [entry];
  game.redoStack = [];
  game.restoreMoveState = () => game.updateHistoryControls();

  try {
    game.addHistoryControls();
    assert.equal(undoButton.disabled, false);
    assert.equal(redoButton.disabled, true);
    listeners.undo.click();
    assert.equal(game.undoStack.length, 0);
    assert.equal(game.redoStack.length, 1);
    assert.equal(undoButton.disabled, true);
    assert.equal(redoButton.disabled, false);
    listeners.redo.click();
    assert.equal(game.undoStack.length, 1);
    assert.equal(game.redoStack.length, 0);

    let prevented = 0;
    keydown({ key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, preventDefault() { prevented += 1; } });
    assert.equal(game.undoStack.length, 0, 'Ctrl+Z undoes');
    keydown({ key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, preventDefault() { prevented += 1; } });
    assert.equal(game.undoStack.length, 1, 'Ctrl+Shift+Z redoes');
    keydown({ key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, preventDefault() { prevented += 1; } });
    keydown({ key: 'y', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, preventDefault() { prevented += 1; } });
    assert.equal(game.undoStack.length, 1, 'Command+Y redoes on macOS');
    assert.equal(prevented, 4);
    assert.equal(undoButton.disabled, false);
    assert.equal(redoButton.disabled, true);
  }
  finally {
    context.document.getElementById = originalGetElementById;
    if (originalAddEventListener === undefined) delete context.document.addEventListener;
    else context.document.addEventListener = originalAddEventListener;
  }
});

test('undo restores king castling rights after an ordinary king move', () => {
  const King = pieceClass('King');
  const king = new King(15, 'whiteKing');
  const game = createGame([king, new King(85, 'blackKing')], king);
  game.turn = 'white';
  game.turnSign = { innerHTML: '' };
  game.moveList = null;
  game.emptyMoveHistory = { hidden: true };
  game.moveHistory = [];
  game.positionCounts = new Map();
  game.undoStack = [];
  game.redoStack = [];
  game.updateCheckStatus = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.clearSquares = () => {};

  const before = game.captureMoveState();
  king.changePosition(16, true);
  game.turn = 'black';
  game.pendingUndoEntry = { before, piece: king, from: 15, to: 16, supported: true };
  game.commitPendingUndoMove();

  assert.equal(king.ableToCastle, false);
  assert.equal(game.undoMove(), true);
  assert.equal(king.position, 15);
  assert.equal(king.ableToCastle, true);
});

test('undo and redo restore a captured piece identity, board square, and graveyard slot', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const Pawn = pieceClass('Pawn');
  const whiteRook = new Rook(21, 'whiteRook1');
  const capturedPawn = new Pawn(24, 'blackPawn4');
  const whiteKing = new King(15, 'whiteKing');
  const blackKing = new King(85, 'blackKing');
  const game = createGame([whiteKing, whiteRook, capturedPawn, blackKing], whiteRook);
  const makeSlot = () => ({ append(image) { image.parentNode = this; } });
  const capturedSlot = makeSlot();
  const blackSematary = { querySelector: () => capturedSlot };
  const whiteSematary = { querySelector: () => makeSlot() };
  const squares = new Map();
  for (const position of [15, 21, 24, 85]) {
    squares.set(position, {
      id: String(position),
      classList: { contains: name => name === 'allowed' },
      getAttribute: name => name === 'id' ? String(position) : null,
      append(image) { image.parentNode = this; },
    });
  }
  const capturedSquare = squares.get(24);
  const originalSquare = { removeChild(image) { image.parentNode = null; } };
  capturedPawn.img.parentNode = originalSquare;
  capturedPawn.img.className = 'piece pawn';
  whiteRook.img.parentNode = squares.get(21);

  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = id => squares.get(Number(id)) || { id };
  game.turn = 'white';
  game.turnSign = { innerHTML: '' };
  game.moveList = null;
  game.emptyMoveHistory = { hidden: false };
  game.moveHistory = [];
  game.halfmoveClock = 0;
  game.positionCounts = new Map([['before-capture', 1]]);
  game.undoStack = [];
  game.redoStack = [];
  game.pendingUndoEntry = null;
  game.pendingCaptureState = null;
  game.whiteSematary = whiteSematary;
  game.blackSematary = blackSematary;
  game.getMoveDisambiguation = () => '';
  game.recordPosition = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.updateCheckStatus = () => {};
  game.clearSquares = () => {};

  try {
    game.kill(capturedPawn);
    assert.equal(game.pieces.includes(capturedPawn), false);
    assert.equal(whiteRook.position, 24);
    assert.equal(game.undoStack.at(-1).supported, true);
    assert.equal(capturedPawn.img.parentNode, capturedSlot);

    assert.equal(game.undoMove(), true);
    assert.equal(game.pieces.includes(capturedPawn), true);
    assert.equal(capturedPawn.position, 24);
    assert.equal(capturedPawn.img.parentNode, capturedSquare);
    assert.equal(capturedPawn.img.className, 'piece pawn');
    assert.equal(whiteRook.position, 21);
    assert.equal(game.turn, 'white');

    assert.equal(game.redoMove(), true);
    assert.equal(game.pieces.includes(capturedPawn), false);
    assert.equal(capturedPawn.position, 24);
    assert.equal(capturedPawn.img.parentNode, capturedSlot);
    assert.equal(whiteRook.position, 24);
    assert.equal(game.turn, 'black');
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }
});

test('undo and redo restore castling king-rook positions and rights', () => {
  const King = pieceClass('King');
  const Rook = pieceClass('Rook');
  const whiteKing = new King(15, 'whiteKing');
  const whiteRook = new Rook(18, 'whiteRook2');
  const game = createGame([whiteKing, whiteRook, new King(85, 'blackKing')], whiteKing);
  const squares = new Map();
  for (const position of [15, 16, 17, 18, 85]) {
    const allowed = new Set(position === 17 ? ['allowed'] : []);
    squares.set(position, {
      id: String(position),
      classList: { contains: name => allowed.has(name), add: name => allowed.add(name) },
      getAttribute: name => name === 'id' ? String(position) : null,
      append(image) { image.parentNode = this; },
    });
  }
  const originalGetElementById = context.document.getElementById;
  const originalGame = context.game;
  context.document.getElementById = id => squares.get(Number(id)) || { id };
  context.game = game;
  game.turn = 'white';
  game.turnSign = { innerHTML: '' };
  game.moveList = null;
  game.emptyMoveHistory = { hidden: false };
  game.moveHistory = [];
  game.halfmoveClock = 0;
  game.positionCounts = new Map();
  game.undoStack = [];
  game.redoStack = [];
  game.getMoveDisambiguation = () => '';
  game.recordPosition = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.updateCheckStatus = () => {};
  game.clearSquares = () => {};

  try {
    game.movePiece(null, squares.get(17));
    assert.equal(whiteKing.position, 17);
    assert.equal(whiteRook.position, 16);
    assert.equal(whiteKing.ableToCastle, false);
    assert.equal(whiteRook.ableToCastle, false);
    assert.equal(game.undoMove(), true);
    assert.equal(whiteKing.position, 15);
    assert.equal(whiteRook.position, 18);
    assert.equal(whiteKing.ableToCastle, true);
    assert.equal(whiteRook.ableToCastle, true);
    assert.equal(game.redoMove(), true);
    assert.equal(whiteKing.position, 17);
    assert.equal(whiteRook.position, 16);
    assert.equal(whiteKing.ableToCastle, false);
    assert.equal(whiteRook.ableToCastle, false);
  }
  finally {
    context.document.getElementById = originalGetElementById;
    if (originalGame === undefined) delete context.game;
    else context.game = originalGame;
  }
});

test('undo and redo restore en-passant victim, target, and pawn positions', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const whitePawn = new Pawn(55, 'whitePawn5');
  const blackPawn = new Pawn(56, 'blackPawn6');
  const game = createGame([new King(15, 'whiteKing'), whitePawn, blackPawn, new King(88, 'blackKing')], whitePawn);
  const makeSlot = () => ({ append(image) { image.parentNode = this; } });
  const capturedSlot = makeSlot();
  const squares = new Map();
  for (const position of [15, 55, 56, 66, 88]) {
    squares.set(position, {
      id: String(position),
      classList: { contains: name => name === 'allowed' },
      getAttribute: name => name === 'id' ? String(position) : null,
      append(image) { image.parentNode = this; },
    });
  }
  const originalGetElementById = context.document.getElementById;
  const originalGetElementsByClassName = context.document.getElementsByClassName;
  context.document.getElementById = id => squares.get(Number(id)) || { id };
  context.document.getElementsByClassName = () => [];
  whitePawn.img.parentNode = squares.get(55);
  whitePawn.img.className = 'piece pawn';
  blackPawn.img.parentNode = { removeChild(image) { image.parentNode = null; } };
  blackPawn.img.className = 'piece pawn';
  game.turn = 'white';
  game.turnSign = { innerHTML: '' };
  game.moveList = null;
  game.emptyMoveHistory = { hidden: false };
  game.moveHistory = [];
  game.halfmoveClock = 4;
  game.positionCounts = new Map([['before-en-passant', 1]]);
  game.undoStack = [];
  game.redoStack = [];
  game.whiteSematary = { querySelector: () => makeSlot() };
  game.blackSematary = { querySelector: () => capturedSlot };
  game.recordPosition = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.updateCheckStatus = () => {};
  game.clearSquares = () => {};
  game.getMoveDisambiguation = () => '';
  game.recordEnPassantOpportunity(blackPawn, 76, 56);

  try {
    game.movePiece(null, squares.get(66));
    assert.equal(game.undoStack.at(-1).supported, true);
    assert.equal(game.pieces.includes(blackPawn), false);
    assert.equal(whitePawn.position, 66);
    assert.equal(game.enPassantTarget, null);
    assert.equal(game.undoMove(), true);
    assert.equal(game.pieces.includes(blackPawn), true);
    assert.equal(whitePawn.position, 55);
    assert.equal(blackPawn.position, 56);
    assert.equal(game.enPassantTarget, 66);
    assert.equal(game.enPassantPawn, blackPawn);
    assert.equal(blackPawn.img.parentNode, squares.get(56));
    assert.equal(game.redoMove(), true);
    assert.equal(game.pieces.includes(blackPawn), false);
    assert.equal(whitePawn.position, 66);
    assert.equal(game.enPassantTarget, null);
    assert.equal(blackPawn.img.parentNode, capturedSlot);
  }
  finally {
    context.document.getElementById = originalGetElementById;
    context.document.getElementsByClassName = originalGetElementsByClassName;
  }
});

test('undo and redo restore promotion piece identity and shared image attributes', () => {
  const King = pieceClass('King');
  const Pawn = pieceClass('Pawn');
  const pawn = new Pawn(78, 'whitePawn8');
  pawn.img.src = './assets/img/whitePawn.png';
  pawn.img.className = 'piece pawn';
  const game = createGame([new King(15, 'whiteKing'), pawn, new King(85, 'blackKing')], pawn);
  const squares = new Map();
  for (const position of [15, 78, 88, 85]) {
    squares.set(position, {
      id: String(position),
      classList: { contains: name => name === 'allowed' },
      getAttribute: name => name === 'id' ? String(position) : null,
      append(image) { image.parentNode = this; },
    });
  }
  const originalGetElementById = context.document.getElementById;
  const originalGame = context.game;
  context.document.getElementById = id => squares.get(Number(id)) || { id };
  context.game = game;
  game.turn = 'white';
  game.turnSign = { innerHTML: '' };
  game.moveList = null;
  game.emptyMoveHistory = { hidden: false };
  game.moveHistory = [];
  game.halfmoveClock = 0;
  game.positionCounts = new Map();
  game.undoStack = [];
  game.redoStack = [];
  game.promotionCounter = 0;
  game.promotionDialog = { showModal() {}, close() {}, querySelector() { return { focus() {} }; } };
  game.getMoveDisambiguation = () => '';
  game.recordPosition = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.updateCheckStatus = () => {};
  game.clearSquares = () => {};

  try {
    game.movePiece(null, squares.get(88));
    assert.equal(game.pendingPromotion, pawn);
    const promotedPiece = game.promote(pawn, 'queen');
    const promotedId = promotedPiece.name;
    const promotedSrc = pawn.img.src;
    assert.equal(game.pieces.includes(promotedPiece), true);
    assert.equal(pawn.img.id, promotedId);
    assert.equal(game.undoMove(), true);
    assert.equal(game.pieces.includes(pawn), true);
    assert.equal(game.pieces.includes(promotedPiece), false);
    assert.equal(pawn.position, 78);
    assert.equal(pawn.img.id, 'whitePawn8');
    assert.equal(pawn.img.src, './assets/img/whitePawn.png');
    assert.equal(pawn.img.className, 'piece pawn');
    assert.equal(game.redoMove(), true);
    assert.equal(game.pieces.includes(promotedPiece), true);
    assert.equal(game.pieces.includes(pawn), false);
    assert.equal(promotedPiece.position, 88);
    assert.equal(pawn.img.id, promotedId);
    assert.equal(pawn.img.src, promotedSrc);
    assert.equal(pawn.img.className, 'piece queen');
  }
  finally {
    context.document.getElementById = originalGetElementById;
    if (originalGame === undefined) delete context.game;
    else context.game = originalGame;
  }
});

test('move history displays moves in chronological order with full-move numbers', () => {
  const game = createGame([], null);
  const items = [];
  game.moveHistory = [];
  game.moveList = {
    appendChild: (item) => items.push(item.textContent),
    scrollHeight: 24,
    scrollTop: 0,
  };
  game.emptyMoveHistory = { hidden: false };
  const originalCreateElement = context.document.createElement;
  context.document.createElement = (tag) => ({ tagName: tag, textContent: '' });

  try {
    game.recordMoveHistory({ color: 'white', rank: 'pawn', from: 25, to: 45, isCapture: false });
    game.recordMoveHistory({ color: 'black', rank: 'pawn', from: 75, to: 55, isCapture: false });
    game.recordMoveHistory({ color: 'white', rank: 'knight', from: 17, to: 36, isCapture: false });
  }
  finally {
    context.document.createElement = originalCreateElement;
  }

  assert.deepEqual(items, ['1. e4', '1... e5', '2. Nf3']);
  assert.equal(game.emptyMoveHistory.hidden, true);
  assert.equal(game.moveList.scrollTop, game.moveList.scrollHeight);
});

test('finishMove commits a completed move but skips a nested castling rook move', () => {
  const game = createGame([], null);
  const recorded = [];
  const clockChanges = [];
  let clockStarts = 0;
  game.isCastlingRookMove = false;
  game.pendingHistoryMove = { color: 'white', rank: 'pawn', from: 25, to: 45, isCapture: false };
  game.recordMoveHistory = (move) => recorded.push(move);
  game.turn = 'white';
  game.changeTurn = () => { game.turn = game.turn === 'white' ? 'black' : 'white'; };
  game.recordPosition = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.updateCheckStatus = () => {};
	const clock = {
		activeColor: 'white',
		running: false,
		start() { clockStarts += 1; this.running = true; return true; },
		switchActiveSide(color) { clockChanges.push(color); this.activeColor = color; return true; },
	};
	assert.equal(game.attachClock(clock), true);
	assert.equal(clockStarts, 1);

  game.finishMove('white');
  assert.equal(recorded.length, 1);
  assert.equal(game.pendingHistoryMove, null);
	assert.deepEqual(clockChanges, ['black']);
	assert.equal(clock.activeColor, 'black');

  game.pendingHistoryMove = { color: 'white', rank: 'pawn', from: 78, to: 88, isCapture: false };
  game.isCastlingRookMove = true;
  game.finishMove('white');
  assert.equal(recorded.length, 1, 'nested castling completion must not add an extra history entry');
	assert.deepEqual(clockChanges, ['black'], 'nested rook animation must not switch the clock again');
});

test('finishMove appends the checkmate marker to SAN history', () => {
  const game = createGame([], null);
  const recorded = [];
  game.isCastlingRookMove = false;
  game.pendingHistoryMove = { color: 'white', rank: 'queen', from: 15, to: 55, isCapture: false };
  game.recordMoveHistory = (move) => recorded.push(move.checkSuffix);
  game.changeTurn = () => { game.turn = 'black'; };
  game.turn = 'white';
  game.recordPosition = () => {};
  game.getGameOutcome = () => 'checkmate';
  game.updateCheckStatus = () => {};
  game.checkmate = () => {};
  game.finishMove('white');
  assert.deepEqual(recorded, ['#']);
  assert.equal(game.pendingHistoryMove, null);
});

test('starting a new game asks before discarding recorded progress', () => {
  const game = createGame([], null);
  game.moveHistory = ['1. e4'];
  game.undoStack = [{}];
  const originalWindow = context.window;
  let prompt;
  let reloads = 0;
  context.window = {
    confirm: (message) => { prompt = message; return false; },
    location: { reload: () => { reloads += 1; } },
  };
  try {
    assert.equal(game.startNewGame(), false);
  }
  finally {
    if (originalWindow === undefined) delete context.window;
    else context.window = originalWindow;
  }
  assert.equal(prompt, 'Start a new game? The current game and move history will be discarded.');
  assert.equal(reloads, 0);
  assert.equal(game.moveHistory.length, 1);
});

test('confirming a new game reloads to the starting position', () => {
  const game = createGame([], null);
  game.moveHistory = ['1. e4'];
  const originalWindow = context.window;
  let reloads = 0;
  context.window = {
    confirm: () => true,
    location: { reload: () => { reloads += 1; } },
  };
  try {
    assert.equal(game.startNewGame(), true);
  }
  finally {
    if (originalWindow === undefined) delete context.window;
    else context.window = originalWindow;
  }
  assert.equal(reloads, 1);
});

test('a pristine new game restarts without an unnecessary discard prompt', () => {
  const game = createGame([], null);
  game.moveHistory = [];
  game.undoStack = [];
  const originalWindow = context.window;
  let prompts = 0;
  let reloads = 0;
  context.window = {
    confirm: () => { prompts += 1; return false; },
    location: { reload: () => { reloads += 1; } },
  };
  try {
    assert.equal(game.startNewGame(), true);
  }
  finally {
    if (originalWindow === undefined) delete context.window;
    else context.window = originalWindow;
  }
  assert.equal(prompts, 0);
  assert.equal(reloads, 1);
});

test('new-game control invokes the reset flow when activated', () => {
  const game = createGame([], null);
  let listener;
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = (id) => id === 'new-game'
    ? { addEventListener: (type, callback) => { assert.equal(type, 'click'); listener = callback; } }
    : null;
  let starts = 0;
  game.startNewGame = () => { starts += 1; };
  try {
    game.addGameControls();
    listener();
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }
  assert.equal(starts, 1);
});

test('canceling resignation leaves the game and current side unchanged', () => {
  const game = createGame([], null);
  game.turn = 'white';
  game.gameOver = false;
  const originalWindow = context.window;
  let prompts = 0;
  context.window = { confirm: () => { prompts += 1; return false; } };
  try {
    assert.equal(game.requestResignation(), false);
  }
  finally {
    if (originalWindow === undefined) delete context.window;
    else context.window = originalWindow;
  }
  assert.equal(prompts, 1);
  assert.equal(game.gameOver, false);
  assert.equal(game.turn, 'white');
});

test('confirming resignation announces the winner and ends the game', () => {
  const game = createGame([], null);
  game.turn = 'black';
  game.gameOver = false;
  const classes = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
  };
  const result = { textContent: '' };
  const endScene = { classList: classes(), getElementsByClassName: () => [result] };
  const statusClasses = classes();
  statusClasses.add('is-check');
  game.gameStatus = { textContent: '', classList: statusClasses };
  game.resignButton = { disabled: false };
  const originalWindow = context.window;
  const originalGetElementById = context.document.getElementById;
  context.window = { confirm: () => true };
  context.document.getElementById = id => id === 'endscene' ? endScene : null;
  try {
    assert.equal(game.requestResignation(), true);
  }
  finally {
    if (originalWindow === undefined) delete context.window;
    else context.window = originalWindow;
    context.document.getElementById = originalGetElementById;
  }
  assert.equal(result.textContent, 'Black resigns. White wins.');
  assert.equal(game.gameStatus.textContent, result.textContent);
  assert.equal(statusClasses.contains('is-check'), false);
  assert.equal(endScene.classList.contains('show'), true);
  assert.equal(game.gameOver, true);
  assert.equal(game.resignButton.disabled, true);
});

test('timeout material detection distinguishes possible mates from bare-king and same-color-bishop cases', () => {
	const King = pieceClass('King');
	const Bishop = pieceClass('Bishop');
	const Knight = pieceClass('Knight');
	const Rook = pieceClass('Rook');
	const Pawn = pieceClass('Pawn');
	const examples = [
		{ pieces: [new King(11, 'whiteKing'), new King(88, 'blackKing'), new Knight(23, 'blackKnight1')], expected: false },
		{ pieces: [new King(11, 'whiteKing'), new King(88, 'blackKing'), new Bishop(11, 'blackBishop1'), new Bishop(33, 'blackBishop2')], expected: false },
		{ pieces: [new King(11, 'whiteKing'), new King(88, 'blackKing'), new Bishop(11, 'blackBishop1'), new Bishop(32, 'blackBishop2')], expected: true },
		{ pieces: [new King(11, 'whiteKing'), new King(88, 'blackKing'), new Bishop(23, 'blackBishop1'), new Knight(24, 'blackKnight1')], expected: true },
		{ pieces: [new King(11, 'whiteKing'), new King(88, 'blackKing'), new Rook(23, 'blackRook1')], expected: true },
		{ pieces: [new King(11, 'whiteKing'), new King(88, 'blackKing'), new Pawn(23, 'blackPawn1')], expected: true },
	];
	for (const example of examples) {
		const game = createGame(example.pieces, null);
		assert.equal(game.hasMatingMaterial('black'), example.expected);
	}
});

test('clock flag falls produce a draw when the opponent has no mating material and stop the clock', () => {
	const King = pieceClass('King');
	const Rook = pieceClass('Rook');
	let now = 0;
	const messages = [];
	const classes = () => {
		const values = new Set();
		return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
	};
	const result = { textContent: '' };
	const endScene = { classList: classes(), getElementsByClassName: () => [result] };
	const originalGetElementById = context.document.getElementById;
	context.document.getElementById = id => id === 'endscene' ? endScene : null;
	try {
		const game = createGame([
			new King(15, 'whiteKing'), new King(85, 'blackKing'), new Rook(11, 'whiteRook1'),
		], null);
		game.turn = 'white';
		game.gameStatus = { textContent: '', classList: classes() };
		game.updateHistoryControls = () => {};
		const clock = new (pieceClass('ChessClock'))({
			whiteSeconds: 1,
			blackSeconds: 10,
			now: () => now,
			setTimer: () => 1,
			clearTimer() {},
			onFlag: value => messages.push(value),
		});
		assert.equal(game.attachClock(clock), true);
		now = 1200;
		assert.equal(clock.tick(), false);
		assert.equal(result.textContent, 'White ran out of time. Draw — Black cannot checkmate.');
		assert.equal(game.gameStatus.textContent, result.textContent);
		assert.equal(game.gameOver, true);
		assert.equal(clock.running, false);
		assert.deepEqual(messages.map(value => ({ ...value })), [{ flaggedColor: 'white', winner: 'black' }]);
	}
	finally {
		context.document.getElementById = originalGetElementById;
	}
});

test('finished games reject moves and undo/redo actions', () => {
  const game = createGame([], null);
  game.gameOver = true;
  game.undoStack = [{}];
  game.redoStack = [{}];
  let prevented = false;
  assert.equal(game.movePiece({ preventDefault: () => { prevented = true; } }), false);
  assert.equal(prevented, true);
  assert.equal(game.getPieceAllowedMoves({}, 'whiteKing'), 0);
  assert.equal(game.undoMove(), false);
  assert.equal(game.redoMove(), false);
});

test('restart after a result does not ask to discard an already-finished game', () => {
  const game = createGame([], null);
  game.gameOver = true;
  game.moveHistory = ['1. e4'];
  const originalWindow = context.window;
  let prompts = 0;
  let reloads = 0;
  context.window = {
    confirm: () => { prompts += 1; return false; },
    location: { reload: () => { reloads += 1; } },
  };
  try {
    assert.equal(game.startNewGame(), true);
  }
  finally {
    if (originalWindow === undefined) delete context.window;
    else context.window = originalWindow;
  }
  assert.equal(prompts, 0);
  assert.equal(reloads, 1);
});

test('resign and result-screen restart controls invoke their respective flows', () => {
  const game = createGame([], null);
  const listeners = {};
  const originalGetElementById = context.document.getElementById;
  context.document.getElementById = id => ['new-game', 'resign-game', 'restart-game'].includes(id)
    ? { addEventListener: (type, callback) => { listeners[id] = { type, callback }; } }
    : null;
  let resignations = 0;
  let restarts = 0;
  game.requestResignation = () => { resignations += 1; };
  game.startNewGame = () => { restarts += 1; };
  try {
    game.addGameControls();
    assert.equal(listeners['resign-game'].type, 'click');
    listeners['resign-game'].callback();
    assert.equal(listeners['restart-game'].type, 'click');
    listeners['restart-game'].callback();
  }
  finally {
    context.document.getElementById = originalGetElementById;
  }
  assert.equal(resignations, 1);
  assert.equal(restarts, 1);
});

test('piece selection visually distinguishes the selected square and announces legal destinations', () => {
  const piece = { name: 'whiteKnight1', color: 'white', rank: 'knight', position: 25 };
  const game = createGame([piece], null);
  const classes = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
  };
  const selectedSquare = { classList: classes() };
  const destinationSquares = new Map([[33, { classList: classes() }], [44, { classList: classes() }]]);
  const originalGetElementById = context.document.getElementById;
  const originalBody = context.document.body;
  context.document.getElementById = id => Number(id) === 25 ? selectedSquare : destinationSquares.get(Number(id));
  context.document.body = { contains: node => Boolean(node) };
  game.selectionStatus = { textContent: '' };
  game.getPieceAllowedMoves = () => [33, 44];
  try {
    game.pieceMove({ target: { getAttribute: () => 'whiteKnight1' } });
  }
  finally {
    context.document.getElementById = originalGetElementById;
    if (originalBody === undefined) delete context.document.body;
    else context.document.body = originalBody;
  }
  assert.equal(selectedSquare.classList.contains('selected-square'), true);
  assert.equal(selectedSquare.classList.contains('allowed'), false);
  assert.equal(destinationSquares.get(33).classList.contains('allowed'), true);
  assert.equal(destinationSquares.get(33).classList.contains('allowed-quiet'), true);
  assert.equal(destinationSquares.get(44).classList.contains('selected-square'), false);
  assert.equal(game.selectionStatus.textContent, 'white knight selected on e2. Legal destinations (2): c3 (quiet move), d4 (quiet move).');
});

test('clearing board highlights removes both selection and destination states and clears the announcement', () => {
  const game = createGame([], null);
  const classList = () => {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value) };
  };
  const selected = { classList: classList() };
  const destination = { classList: classList() };
  selected.classList.add('selected-square');
  destination.classList.add('allowed');
  destination.classList.add('allowed-capture');
  game.board = {
    querySelectorAll: selector => selector === '.allowed' ? [destination] : selector === '.selected-square' ? [selected] : [],
  };
  game.selectionStatus = { textContent: 'white knight selected on e2.' };
  game.allowedMoves = [33];
  game.clearSquares();
  assert.equal(selected.classList.contains('selected-square'), false);
  assert.equal(destination.classList.contains('allowed'), false);
  assert.equal(destination.classList.contains('allowed-capture'), false);
  assert.equal(game.selectionStatus.textContent, '');
  assert.equal(game.allowedMoves, null);
});

test('move-kind classification differentiates quiet moves, captures, en passant, and castling', () => {
  const Pawn = pieceClass('Pawn');
  const King = pieceClass('King');
  const whitePawn = new Pawn(35, 'whitePawn1');
  const blackPawn = new Pawn(34, 'blackPawn1');
  const game = createGame([whitePawn, blackPawn], whitePawn);
  game.enPassantTarget = null;
  game.enPassantPawn = null;
  assert.equal(game.getMoveKind(whitePawn, 45), 'quiet');
  assert.equal(game.getMoveKind(whitePawn, 34), 'capture');
  game.enPassantTarget = 44;
  game.enPassantPawn = blackPawn;
  assert.equal(game.getMoveKind(whitePawn, 44), 'en-passant');
  assert.equal(game.getMoveKind(new King(15, 'whiteKing'), 17), 'castling');
});

test('screen-reader destination feedback names captures and special move types', () => {
  const piece = { color: 'white', rank: 'king', position: 15 };
  const game = createGame([], null);
  game.selectionStatus = { textContent: '' };
  game.getMoveKind = (_piece, position) => ({ 16: 'quiet', 24: 'capture', 17: 'castling' })[position];
  game.announceSelection(piece, [16, 24, 17]);
  assert.equal(game.selectionStatus.textContent, 'white king selected on e1. Legal destinations (3): f1 (quiet move), d2 (capture), g1 (castling).');
});
