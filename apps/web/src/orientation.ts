import { parseSquare } from "@2d-chess/chess-core";
import type { Square } from "@2d-chess/chess-core";

export type BoardOrientation = "white" | "black";
const FILES = "abcdefgh";

/** Squares in visual row-major order; coordinates and piece identity never change. */
export function orientedBoardSquares(orientation: BoardOrientation): readonly Square[] {
  const squares: Square[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const fileIndex = orientation === "white" ? column : 7 - column;
      const rank = orientation === "white" ? 8 - row : row + 1;
      squares.push(parseSquare(`${FILES[fileIndex]}${rank}`)!);
    }
  }
  return squares;
}
