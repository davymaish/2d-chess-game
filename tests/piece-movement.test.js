const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({
  console: { log() {} },
  document: { getElementById: (id) => ({ id }) },
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
    game.checkmate('white');

    assert.equal(message.textContent, 'Checkmate. White wins.');
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
