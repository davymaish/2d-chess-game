const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({
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

function pieceClass(name) {
  return vm.runInContext(name, context);
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
