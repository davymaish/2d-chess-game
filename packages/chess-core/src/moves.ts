import { createPosition, pieceAt } from "./position.js";
import { formatSquare, parseSquare } from "./square.js";
import type {
  CastlingRight,
  ChessPiece,
  Color,
  File,
  MoveIntent,
  MoveRecord,
  MoveResult,
  PieceOnSquare,
  PieceKind,
  Position,
  PromotionPieceKind,
  Rank,
  Square,
} from "./types.js";

const FILES: readonly File[] = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PROMOTION_KINDS: readonly PromotionPieceKind[] = ["queen", "rook", "bishop", "knight"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSquare(value: unknown): value is Square {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    /^[a-h]$/.test(value.file) &&
    typeof value.rank === "number" &&
    Number.isInteger(value.rank) &&
    value.rank >= 1 &&
    value.rank <= 8
  );
}

function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}

function sameSquare(left: Square, right: Square): boolean {
  return left.file === right.file && left.rank === right.rank;
}

function squareAt(fileIndex: number, rank: number): Square {
  return { file: FILES[fileIndex]!, rank: rank as Rank };
}

function isPathClear(position: Position, from: Square, to: Square, fileDelta: number, rankDelta: number): boolean {
  const fromFile = FILES.indexOf(from.file);
  const toFile = FILES.indexOf(to.file);
  let fileIndex = fromFile + Math.sign(fileDelta);
  let rank = from.rank + Math.sign(rankDelta);

  while (fileIndex !== toFile || rank !== to.rank) {
    if (pieceAt(position, squareAt(fileIndex, rank))) return false;
    fileIndex += Math.sign(fileDelta);
    rank += Math.sign(rankDelta);
  }
  return true;
}

function isPseudoLegalGeometry(
  position: Position,
  piece: ChessPiece,
  from: Square,
  to: Square,
  target: ChessPiece | null,
): boolean {
  const fileDelta = FILES.indexOf(to.file) - FILES.indexOf(from.file);
  const rankDelta = to.rank - from.rank;
  const absFileDelta = Math.abs(fileDelta);
  const absRankDelta = Math.abs(rankDelta);

  if (fileDelta === 0 && rankDelta === 0) return false;

  switch (piece.kind) {
    case "king":
      return absFileDelta <= 1 && absRankDelta <= 1;
    case "knight":
      return (absFileDelta === 1 && absRankDelta === 2) || (absFileDelta === 2 && absRankDelta === 1);
    case "rook":
      return (fileDelta === 0 || rankDelta === 0) &&
        isPathClear(position, from, to, fileDelta, rankDelta);
    case "bishop":
      return absFileDelta === absRankDelta &&
        isPathClear(position, from, to, fileDelta, rankDelta);
    case "queen":
      return (fileDelta === 0 || rankDelta === 0 || absFileDelta === absRankDelta) &&
        isPathClear(position, from, to, fileDelta, rankDelta);
    case "pawn": {
      const direction = piece.color === "white" ? 1 : -1;
      const startingRank = piece.color === "white" ? 2 : 7;
      if (fileDelta === 0 && !target && rankDelta === direction) return true;
      if (fileDelta === 0 && !target && from.rank === startingRank && rankDelta === 2 * direction) {
        const intermediate = squareAt(FILES.indexOf(from.file), from.rank + direction);
        return pieceAt(position, intermediate) === null;
      }
      return absFileDelta === 1 && rankDelta === direction && target !== null && target.color !== piece.color;
    }
  }
}

function castlingRightForCorner(color: Color, square: Square): CastlingRight | null {
  if (square.rank === 1 && color === "white" && square.file === "a") return "white-queen-side";
  if (square.rank === 1 && color === "white" && square.file === "h") return "white-king-side";
  if (square.rank === 8 && color === "black" && square.file === "a") return "black-queen-side";
  if (square.rank === 8 && color === "black" && square.file === "h") return "black-king-side";
  return null;
}

function updatedCastlingRights(
  rights: readonly CastlingRight[],
  movingPiece: ChessPiece,
  from: Square,
  capturedPiece: ChessPiece | null,
  to: Square,
): readonly CastlingRight[] {
  const removed = new Set<CastlingRight>();
  if (movingPiece.kind === "king") {
    removed.add(movingPiece.color === "white" ? "white-king-side" : "black-king-side");
    removed.add(movingPiece.color === "white" ? "white-queen-side" : "black-queen-side");
  }
  if (movingPiece.kind === "rook") {
    const right = castlingRightForCorner(movingPiece.color, from);
    if (right) removed.add(right);
  }
  if (capturedPiece?.kind === "rook") {
    const right = castlingRightForCorner(capturedPiece.color, to);
    if (right) removed.add(right);
  }
  return rights.filter((right) => !removed.has(right));
}

function freezeMoveRecord(
  from: Square,
  to: Square,
  piece: ChessPiece,
  capturedPiece: ChessPiece | null,
  promotion?: PromotionPieceKind,
): MoveRecord {
  return Object.freeze({
    from: Object.freeze({ ...from }),
    to: Object.freeze({ ...to }),
    piece: Object.freeze({ ...piece }),
    ...(capturedPiece ? { capturedPiece: Object.freeze({ ...capturedPiece }) } : {}),
    ...(promotion ? { promotion } : {}),
  });
}

function isKingAttacked(position: Position, color: Color): boolean {
  const king = position.pieces.find((entry) => entry.piece.color === color && entry.piece.kind === "king");
  if (!king) return false;

  return position.pieces.some((entry) =>
    entry.piece.color !== color &&
    isPseudoLegalGeometry(position, entry.piece, entry.square, king.square, king.piece)
  );
}

/** Applies a pseudo-legal move; king safety, castling, and en-passant capture are not evaluated here. */
export function applyPseudoLegalMove(position: Position, intent: MoveIntent): MoveResult {
  const validatedPosition = createPosition(position);
  if (!validatedPosition.ok) return { kind: "rejected", reason: "invalid-position" };
  const current = validatedPosition.position;

  if (!isRecord(intent) || !isSquare(intent.from) || !isSquare(intent.to)) {
    return { kind: "rejected", reason: "invalid-position" };
  }
  const from = parseSquare(formatSquare(intent.from));
  const to = parseSquare(formatSquare(intent.to));
  if (!from || !to) return { kind: "rejected", reason: "invalid-position" };

  const movingPiece = pieceAt(current, from);
  if (!movingPiece) return { kind: "rejected", reason: "empty-origin" };
  if (movingPiece.color !== current.activeColor) return { kind: "rejected", reason: "wrong-turn" };

  const capturedPiece = pieceAt(current, to);
  if (capturedPiece?.color === movingPiece.color || capturedPiece?.kind === "king") {
    return { kind: "rejected", reason: "illegal-move" };
  }
  if (!isPseudoLegalGeometry(current, movingPiece, from, to, capturedPiece)) {
    return { kind: "rejected", reason: "illegal-move" };
  }

  const rawPromotion = (intent as MoveIntent).promotion as unknown;
  const isPromotionSquare = movingPiece.kind === "pawn" &&
    ((movingPiece.color === "white" && to.rank === 8) || (movingPiece.color === "black" && to.rank === 1));
  if (rawPromotion !== undefined && !PROMOTION_KINDS.includes(rawPromotion as PromotionPieceKind)) {
    return { kind: "rejected", reason: "invalid-promotion" };
  }
  if (isPromotionSquare && rawPromotion === undefined) {
    return { kind: "rejected", reason: "promotion-required" };
  }
  if (!isPromotionSquare && rawPromotion !== undefined) {
    return { kind: "rejected", reason: "invalid-promotion" };
  }
  const promotion = rawPromotion as PromotionPieceKind | undefined;

  const resultingPiece: ChessPiece = promotion
    ? { color: movingPiece.color, kind: promotion as PieceKind }
    : movingPiece;
  const nextPieces: PieceOnSquare[] = current.pieces
    .filter((entry) => !sameSquare(entry.square, from) && !sameSquare(entry.square, to))
    .map((entry) => ({ square: entry.square, piece: entry.piece }));
  nextPieces.push({ square: to, piece: resultingPiece });

  const fileDelta = FILES.indexOf(to.file) - FILES.indexOf(from.file);
  const rankDelta = to.rank - from.rank;
  const enPassantTarget = movingPiece.kind === "pawn" && fileDelta === 0 && Math.abs(rankDelta) === 2
    ? parseSquare(`${from.file}${from.rank + Math.sign(rankDelta)}`)
    : null;
  const nextPosition = createPosition({
    pieces: nextPieces,
    activeColor: opposite(current.activeColor),
    castlingRights: updatedCastlingRights(current.castlingRights, movingPiece, from, capturedPiece, to),
    enPassantTarget,
    halfmoveClock: movingPiece.kind === "pawn" || capturedPiece ? 0 : current.halfmoveClock + 1,
    fullmoveNumber: current.fullmoveNumber + (movingPiece.color === "black" ? 1 : 0),
  });
  if (!nextPosition.ok) return { kind: "rejected", reason: "invalid-position" };

  return {
    kind: "accepted",
    position: nextPosition.position,
    move: freezeMoveRecord(from, to, movingPiece, capturedPiece, promotion),
  };
}

/** Applies a currently supported move only when the result leaves the mover's king safe; castling and en passant remain unsupported. */
export function applyLegalMove(position: Position, intent: MoveIntent): MoveResult {
  const result = applyPseudoLegalMove(position, intent);
  if (result.kind !== "accepted") return result;
  if (isKingAttacked(result.position, result.move.piece.color)) {
    return { kind: "rejected", reason: "illegal-move" };
  }
  return result;
}
