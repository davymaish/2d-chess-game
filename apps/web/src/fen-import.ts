import { createInitialPosition, parseFEN, serializeFEN } from "@2d-chess/chess-core";
import type { Position } from "@2d-chess/chess-core";
import { getSessionPosition } from "./session.js";
import type { GameSession } from "./session.js";

export const INITIAL_POSITION_FEN = serializeFEN(createInitialPosition());
export const FEN_REPLACEMENT_CONFIRMATION = "Load this FEN and replace the current position, move history, and clock state?";

export type FENImportDecision =
  | { readonly kind: "ready"; readonly position: Position }
  | { readonly kind: "cancelled" }
  | { readonly kind: "invalid"; readonly message: string };

export function hasFenReplacementProgress(
  session: GameSession,
  clockStarted: boolean,
  pendingPromotion: boolean,
): boolean {
  return session.snapshots.length > 1
    || clockStarted
    || pendingPromotion
    || serializeFEN(getSessionPosition(session)) !== INITIAL_POSITION_FEN;
}

export function prepareFenImport(
  fen: string,
  requiresConfirmation: boolean,
  confirmReplacement: () => boolean,
): FENImportDecision {
  let position: Position;
  try {
    position = parseFEN(fen);
  } catch (error) {
    return { kind: "invalid", message: error instanceof Error ? error.message : "Could not load this FEN position." };
  }
  if (position.halfmoveClock >= 100) {
    return { kind: "invalid", message: "This position has reached the fifty-move draw threshold; load an earlier position to continue play." };
  }
  if (requiresConfirmation && !confirmReplacement()) return { kind: "cancelled" };
  return { kind: "ready", position };
}
