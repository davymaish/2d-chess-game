import { applyLegalMove, getGameStatus } from "./moves.js";
import { formatSquare, allSquares } from "./square.js";
import type { MoveRecord, Position, Square } from "./types.js";

const SAN_PIECE: Readonly<Record<string, string>> = {
  king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N", pawn: "",
};

function squareEqual(left: Square, right: Square): boolean {
  return left.file === right.file && left.rank === right.rank;
}

/** Format a legal move as SAN, including disambiguation, promotion, check, and mate suffixes. */
export function formatSAN(position: Position, move: MoveRecord): string {
  const intent = move.promotion
    ? { from: move.from, to: move.to, promotion: move.promotion }
    : { from: move.from, to: move.to };
  const applied = applyLegalMove(position, intent);
  if (applied.kind !== "accepted") throw new TypeError(`Cannot format an illegal move as SAN: ${applied.reason}`);
  if (!squareEqual(applied.move.from, move.from) || !squareEqual(applied.move.to, move.to) || applied.move.piece.kind !== move.piece.kind) {
    throw new TypeError("Cannot format a move record that does not match its legal transition.");
  }
  const actualMove = applied.move;
  const piece = actualMove.piece;
  let san: string;
  if (piece.kind === "king" && Math.abs(actualMove.to.file.charCodeAt(0) - actualMove.from.file.charCodeAt(0)) === 2) {
    san = actualMove.to.file > actualMove.from.file ? "O-O" : "O-O-O";
  } else {
    let disambiguation = "";
    if (piece.kind !== "pawn") {
      const competingOrigins: Square[] = [];
      for (const origin of allSquares()) {
        if (squareEqual(origin, actualMove.from)) continue;
        const candidatePiece = position.pieces.find((entry) => squareEqual(entry.square, origin))?.piece;
        if (!candidatePiece || candidatePiece.color !== piece.color || candidatePiece.kind !== piece.kind) continue;
        const candidate = applyLegalMove(position, { from: origin, to: actualMove.to });
        if (candidate.kind === "accepted") competingOrigins.push(origin);
      }
      if (competingOrigins.length > 0) {
        const sharesFile = competingOrigins.some((origin) => origin.file === actualMove.from.file);
        const sharesRank = competingOrigins.some((origin) => origin.rank === actualMove.from.rank);
        disambiguation = !sharesFile ? actualMove.from.file : !sharesRank ? String(actualMove.from.rank) : formatSquare(actualMove.from);
      }
    }
    const capture = actualMove.capturedPiece !== undefined;
    const pawnCaptureFile = piece.kind === "pawn" && capture ? actualMove.from.file : "";
    san = `${SAN_PIECE[piece.kind]}${disambiguation}${pawnCaptureFile}${capture ? "x" : ""}${formatSquare(actualMove.to)}${actualMove.promotion ? `=${SAN_PIECE[actualMove.promotion]}` : ""}`;
  }
  const status = getGameStatus(applied.position);
  if (status.kind === "checkmate") san += "#";
  else if (status.kind === "check") san += "+";
  return san;
}
