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
  game.isCastlingRookMove = false;
  game.pendingHistoryMove = { color: 'white', rank: 'pawn', from: 25, to: 45, isCapture: false };
  game.recordMoveHistory = (move) => recorded.push(move);
  game.changeTurn = () => {};
  game.recordPosition = () => {};
  game.getGameOutcome = () => 'ongoing';
  game.updateCheckStatus = () => {};

  game.finishMove('white');
  assert.equal(recorded.length, 1);
  assert.equal(game.pendingHistoryMove, null);

  game.pendingHistoryMove = { color: 'white', rank: 'pawn', from: 78, to: 88, isCapture: false };
  game.isCastlingRookMove = true;
  game.finishMove('white');
  assert.equal(recorded.length, 1, 'nested castling completion must not add an extra history entry');
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
