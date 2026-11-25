import { allSquares, applyLegalMove, pieceAt } from "@2d-chess/chess-core";
import type { MoveIntent, Position, PromotionPieceKind, Square } from "@2d-chess/chess-core";

const PROMOTIONS: readonly PromotionPieceKind[] = ["queen", "rook", "bishop", "knight"];

/** Return destinations the active side can legally reach from a selected square. */
export function legalIntentsFrom(position: Position, from: Square): readonly MoveIntent[] {
  const piece = pieceAt(position, from);
  if (!piece || piece.color !== position.activeColor) return [];

  const intents: MoveIntent[] = [];
  for (const to of allSquares()) {
    const promotes = piece.kind === "pawn" &&
      ((piece.color === "white" && to.rank === 8) || (piece.color === "black" && to.rank === 1));
    const choices: readonly (PromotionPieceKind | undefined)[] = promotes ? PROMOTIONS : [undefined];
    for (const promotion of choices) {
      const intent: MoveIntent = { from, to, ...(promotion ? { promotion } : {}) };
      if (applyLegalMove(position, intent).kind === "accepted") intents.push(intent);
    }
  }
  return intents;
}
