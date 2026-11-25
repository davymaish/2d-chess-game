import { createInitialPosition, formatSAN, serializeFEN, serializePGN } from "@2d-chess/chess-core";
import type { PGNResult } from "@2d-chess/chess-core";
import type { GameSession } from "./session.js";

/** Export the active session cursor as PGN; undone redo branches are not included. */
export function serializeSessionPGN(session: GameSession, result: PGNResult = "*"): string {
  const moveHistory: string[] = [];
  for (let index = 1; index <= session.cursor; index += 1) {
    const previous = session.snapshots[index - 1]!;
    const current = session.snapshots[index]!;
    const move = current.move;
    if (!move) throw new TypeError("Cannot export a session snapshot without a move record.");
    const prefix = move.piece.color === "white"
      ? `${previous.position.fullmoveNumber}.`
      : `${previous.position.fullmoveNumber}...`;
    moveHistory.push(`${prefix} ${formatSAN(previous.position, move)}`);
  }
  const initialFen = serializeFEN(session.snapshots[0]!.position);
  const standardInitialFen = serializeFEN(createInitialPosition());
  const headers = initialFen === standardInitialFen ? {} : { SetUp: "1", FEN: initialFen };
  return serializePGN({ moveHistory, resultToken: result }, headers);
}
