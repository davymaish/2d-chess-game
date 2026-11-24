import type { File, Rank, Square } from "./types.js";

const FILES: readonly File[] = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function parseSquare(value: string): Square | null {
  if (!/^[a-h][1-8]$/.test(value)) return null;
  return { file: value[0] as File, rank: Number(value[1]) as Rank };
}

export function formatSquare(square: Square): string {
  return `${square.file}${square.rank}`;
}

export function allSquares(): readonly Square[] {
  return FILES.flatMap((file) =>
    Array.from({ length: 8 }, (_, index) => ({ file, rank: (index + 1) as Rank })),
  );
}
