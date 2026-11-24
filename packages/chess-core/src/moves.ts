import { createPosition, pieceAt } from "./position.js";
import { formatSquare, parseSquare } from "./square.js";
import type {
  CastlingRight,
  ChessPiece,
  Color,
  File,
  GameStatus,
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

function applyEnPassantMove(position: Position, intent: MoveIntent): MoveResult | null {
  const validatedPosition = createPosition(position);
  if (!validatedPosition.ok) return { kind: "rejected", reason: "invalid-position" };
  const current = validatedPosition.position;
  if (!isRecord(intent) || !isSquare(intent.from) || !isSquare(intent.to) || intent.promotion !== undefined) {
    return null;
  }

  const from = parseSquare(formatSquare(intent.from));
  const to = parseSquare(formatSquare(intent.to));
  if (!from || !to || !current.enPassantTarget || !sameSquare(to, current.enPassantTarget)) return null;

  const movingPiece = pieceAt(current, from);
  const direction = current.activeColor === "white" ? 1 : -1;
  const startingRank = current.activeColor === "white" ? 5 : 4;
  const targetRank = current.activeColor === "white" ? 6 : 3;
  const fileDelta = FILES.indexOf(to.file) - FILES.indexOf(from.file);
  if (
    !movingPiece ||
    movingPiece.color !== current.activeColor ||
    movingPiece.kind !== "pawn" ||
    Math.abs(fileDelta) !== 1 ||
    from.rank !== startingRank ||
    to.rank !== targetRank ||
    to.rank - from.rank !== direction ||
    pieceAt(current, to) !== null
  ) {
    return null;
  }

  const capturedSquare = { file: to.file, rank: from.rank as Rank };
  const capturedPiece = pieceAt(current, capturedSquare);
  if (!capturedPiece || capturedPiece.color === movingPiece.color || capturedPiece.kind !== "pawn") return null;

  const nextPieces: PieceOnSquare[] = current.pieces
    .filter((entry) => !sameSquare(entry.square, from) && !sameSquare(entry.square, capturedSquare))
    .map((entry) => ({ square: entry.square, piece: entry.piece }));
  nextPieces.push({ square: to, piece: movingPiece });
  const nextPosition = createPosition({
    pieces: nextPieces,
    activeColor: opposite(current.activeColor),
    castlingRights: current.castlingRights,
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: current.fullmoveNumber + (movingPiece.color === "black" ? 1 : 0),
  });
  if (!nextPosition.ok) return { kind: "rejected", reason: "invalid-position" };

  return {
    kind: "accepted",
    position: nextPosition.position,
    move: freezeMoveRecord(from, to, movingPiece, capturedPiece),
  };
}

function applyCastleMove(position: Position, intent: MoveIntent): MoveResult | null {
  const validatedPosition = createPosition(position);
  if (!validatedPosition.ok) return { kind: "rejected", reason: "invalid-position" };
  const current = validatedPosition.position;
  if (!isRecord(intent) || !isSquare(intent.from) || !isSquare(intent.to) || intent.promotion !== undefined) {
    return null;
  }

  const from = parseSquare(formatSquare(intent.from));
  const to = parseSquare(formatSquare(intent.to));
  if (!from || !to) return null;
  const color = current.activeColor;
  const rank = color === "white" ? 1 : 8;
  const king = pieceAt(current, from);
  if (!king || king.color !== color || king.kind !== "king" || from.file !== "e" || from.rank !== rank || to.rank !== rank) {
    return null;
  }

  const kingSide = to.file === "g";
  const queenSide = to.file === "c";
  if (!kingSide && !queenSide) return null;

  const right: CastlingRight = color === "white"
    ? kingSide ? "white-king-side" : "white-queen-side"
    : kingSide ? "black-king-side" : "black-queen-side";
  if (!current.castlingRights.includes(right) || isKingAttacked(current, color)) return null;

  const rookFrom: Square = { file: kingSide ? "h" : "a", rank: rank as Rank };
  const rookTo: Square = { file: kingSide ? "f" : "d", rank: rank as Rank };
  const transit: Square = { file: kingSide ? "f" : "d", rank: rank as Rank };
  const rook = pieceAt(current, rookFrom);
  if (!rook || rook.color !== color || rook.kind !== "rook") return null;

  const emptyFiles = kingSide ? ["f", "g"] as const : ["b", "c", "d"] as const;
  if (emptyFiles.some((file) => pieceAt(current, { file, rank: rank as Rank }) !== null)) return null;

  const transitPieces = current.pieces
    .filter((entry) => !sameSquare(entry.square, from))
    .map((entry) => ({ square: entry.square, piece: entry.piece }));
  transitPieces.push({ square: transit, piece: king });
  const transitPosition = createPosition({
    pieces: transitPieces,
    activeColor: current.activeColor,
    castlingRights: current.castlingRights,
    enPassantTarget: current.enPassantTarget,
    halfmoveClock: current.halfmoveClock,
    fullmoveNumber: current.fullmoveNumber,
  });
  if (!transitPosition.ok || isKingAttacked(transitPosition.position, color)) return null;

  const nextPieces = current.pieces
    .filter((entry) => !sameSquare(entry.square, from) && !sameSquare(entry.square, rookFrom))
    .map((entry) => ({ square: entry.square, piece: entry.piece }));
  nextPieces.push({ square: to, piece: king }, { square: rookTo, piece: rook });
  const nextPosition = createPosition({
    pieces: nextPieces,
    activeColor: opposite(color),
    castlingRights: updatedCastlingRights(current.castlingRights, king, from, null, to),
    enPassantTarget: null,
    halfmoveClock: current.halfmoveClock + 1,
    fullmoveNumber: current.fullmoveNumber + (color === "black" ? 1 : 0),
  });
  if (!nextPosition.ok) return { kind: "rejected", reason: "invalid-position" };

  return {
    kind: "accepted",
    position: nextPosition.position,
    move: freezeMoveRecord(from, to, king, null),
  };
}

/** Applies a supported move only when the result leaves the mover's king safe. */
export function applyLegalMove(position: Position, intent: MoveIntent): MoveResult {
  const pseudoLegalResult = applyPseudoLegalMove(position, intent);
  const result = pseudoLegalResult.kind === "accepted"
    ? pseudoLegalResult
    : pseudoLegalResult.reason === "illegal-move"
      ? applyEnPassantMove(position, intent) ?? applyCastleMove(position, intent) ?? pseudoLegalResult
      : pseudoLegalResult;
  if (result.kind !== "accepted") return result;
  if (isKingAttacked(result.position, result.move.piece.color)) {
    return { kind: "rejected", reason: "illegal-move" };
  }
  return result;
}

function hasLegalEnPassantCapture(position: Position): boolean {
  const target = position.enPassantTarget;
  if (!target) return false;
  return position.pieces.some((entry) =>
    entry.piece.color === position.activeColor &&
    entry.piece.kind === "pawn" &&
    applyLegalMove(position, { from: entry.square, to: target }).kind === "accepted"
  );
}

function repetitionIdentity(position: Position): string {
  const pieces = position.pieces
    .map(({ square, piece }) => `${formatSquare(square)}:${piece.color}:${piece.kind}`)
    .sort();
  const castlingRights = [...position.castlingRights].sort();
  const enPassantTarget = hasLegalEnPassantCapture(position) && position.enPassantTarget
    ? formatSquare(position.enPassantTarget)
    : null;
  return JSON.stringify([pieces, position.activeColor, castlingRights, enPassantTarget]);
}

function hasInsufficientMaterial(position: Position): boolean {
  const material = position.pieces.filter((entry) => entry.piece.kind !== "king");
  if (material.length === 0) return true;
  if (material.some(({ piece }) => piece.kind !== "bishop" && piece.kind !== "knight")) return false;
  if (material.length === 1) return true;
  if (material.every(({ piece }) => piece.kind === "bishop")) {
    const colors = new Set(material.map(({ square }) => (FILES.indexOf(square.file) + square.rank) % 2));
    return colors.size === 1;
  }
  return false;
}

/** Classifies check, terminal outcomes, and supported draws; priorPositions excludes the current position. */
export function getGameStatus(position: Position, priorPositions: readonly Position[] = []): GameStatus {
  const validatedPosition = createPosition(position);
  if (!validatedPosition.ok) return { kind: "invalid-position", errors: validatedPosition.errors };
  if (!Array.isArray(priorPositions)) {
    return {
      kind: "invalid-position",
      errors: [{ code: "invalid-position", message: "Prior positions must be an array." }],
    };
  }
  const validatedHistory: Position[] = [];
  for (const previous of priorPositions) {
    const validatedPrevious = createPosition(previous);
    if (!validatedPrevious.ok) return { kind: "invalid-position", errors: validatedPrevious.errors };
    validatedHistory.push(validatedPrevious.position);
  }

  const current = validatedPosition.position;
  const inCheck = isKingAttacked(current, current.activeColor);
  const ranks: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8];
  let hasLegalMove = false;

  moveSearch: for (const entry of current.pieces) {
    if (entry.piece.color !== current.activeColor) continue;
    for (const file of FILES) {
      for (const rank of ranks) {
        const to = { file, rank };
        const reachesPromotionRank = entry.piece.kind === "pawn" &&
          ((entry.piece.color === "white" && rank === 8) || (entry.piece.color === "black" && rank === 1));
        const promotions: readonly (PromotionPieceKind | undefined)[] = reachesPromotionRank
          ? PROMOTION_KINDS
          : [undefined];
        for (const promotion of promotions) {
          const intent: MoveIntent = {
            from: entry.square,
            to,
            ...(promotion ? { promotion } : {}),
          };
          if (applyLegalMove(current, intent).kind === "accepted") {
            hasLegalMove = true;
            break moveSearch;
          }
        }
      }
    }
  }

  if (!hasLegalMove) {
    return inCheck
      ? { kind: "checkmate", winner: opposite(current.activeColor) }
      : { kind: "stalemate" };
  }
  if (hasInsufficientMaterial(current)) return { kind: "draw", reason: "insufficient-material" };
  if (current.halfmoveClock >= 100) return { kind: "draw", reason: "fifty-move" };

  const currentIdentity = repetitionIdentity(current);
  let matchingOccurrences = 1;
  for (const previous of validatedHistory) {
    if (repetitionIdentity(previous) === currentIdentity) matchingOccurrences += 1;
    if (matchingOccurrences >= 3) return { kind: "draw", reason: "threefold-repetition" };
  }
  return inCheck ? { kind: "check" } : { kind: "active" };
}
