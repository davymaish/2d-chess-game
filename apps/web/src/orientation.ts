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

/** Returns the visually adjacent square for a board arrow key, or null at an edge. */
export function arrowKeySquare(square: Square, key: string, orientation: BoardOrientation): Square | null {
  const squares = orientedBoardSquares(orientation);
  const index = squares.findIndex((candidate) => candidate.file === square.file && candidate.rank === square.rank);
  if (index < 0) return null;
  const row = Math.floor(index / 8);
  const column = index % 8;
  const destination = key === "ArrowLeft" && column > 0 ? index - 1
    : key === "ArrowRight" && column < 7 ? index + 1
      : key === "ArrowUp" && row > 0 ? index - 8
        : key === "ArrowDown" && row < 7 ? index + 8 : -1;
  return destination < 0 ? null : squares[destination]!;
}
