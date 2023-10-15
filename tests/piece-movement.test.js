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
