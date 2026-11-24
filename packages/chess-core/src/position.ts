import { formatSquare, parseSquare } from "./square.js";
import type {
  CastlingRight,
  ChessPiece,
  Color,
  PieceKind,
  PieceOnSquare,
  Position,
  PositionInput,
  PositionValidationError,
  PositionValidationResult,
  Square,
} from "./types.js";

const COLORS: readonly Color[] = ["white", "black"];
const PIECE_KINDS: readonly PieceKind[] = ["king", "queen", "rook", "bishop", "knight", "pawn"];
const CASTLING_RIGHTS: readonly CastlingRight[] = [
  "white-king-side",
  "white-queen-side",
  "black-king-side",
  "black-queen-side",
];
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BACK_RANK: readonly PieceKind[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColor(value: unknown): value is Color {
  return COLORS.includes(value as Color);
}

function isPieceKind(value: unknown): value is PieceKind {
  return PIECE_KINDS.includes(value as PieceKind);
}

function isSquare(value: unknown): value is Square {
  if (!isRecord(value)) return false;
  return (
    typeof value.file === "string" &&
    /^[a-h]$/.test(value.file) &&
    typeof value.rank === "number" &&
    Number.isInteger(value.rank) &&
    value.rank >= 1 &&
    value.rank <= 8
  );
}

function isCastlingRight(value: unknown): value is CastlingRight {
  return CASTLING_RIGHTS.includes(value as CastlingRight);
}

function validationError(
  code: PositionValidationError["code"],
  message: string,
  details: { square?: string; color?: string } = {},
): PositionValidationError {
  return { code, message, ...details };
}

function immutablePieceOnSquare(entry: PieceOnSquare): PieceOnSquare {
  return Object.freeze({
    square: Object.freeze({ file: entry.square.file, rank: entry.square.rank }),
    piece: Object.freeze({ color: entry.piece.color, kind: entry.piece.kind }),
  });
}

export function createPosition(input: PositionInput): PositionValidationResult {
  if (!isRecord(input)) {
    return { ok: false, errors: [validationError("invalid-position", "Position input must be an object.")] };
  }

  const candidate = input as unknown as Record<string, unknown>;
  const errors: PositionValidationError[] = [];
  const rawPieces = candidate.pieces;
  const pieces: PieceOnSquare[] = [];
  const occupied = new Set<string>();
  const kingCount: Record<Color, number> = { white: 0, black: 0 };

  if (!Array.isArray(rawPieces)) {
    errors.push(validationError("invalid-position", "Position pieces must be an array."));
  } else {
    for (const rawEntry of rawPieces as readonly unknown[]) {
      if (!isRecord(rawEntry) || !isRecord(rawEntry.piece)) {
        errors.push(validationError("invalid-piece", "Each placement must contain a piece object and square."));
        continue;
      }

      const parsedSquare = isSquare(rawEntry.square)
        ? parseSquare(formatSquare(rawEntry.square))
        : null;
      if (!parsedSquare) {
        errors.push(validationError("invalid-square", "Piece square must be a valid board coordinate."));
        continue;
      }

      const squareName = formatSquare(parsedSquare);
      if (occupied.has(squareName)) {
        errors.push(validationError("duplicate-square", `More than one piece occupies ${squareName}.`, { square: squareName }));
        continue;
      }
      occupied.add(squareName);

      const rawColor = rawEntry.piece.color;
      const rawKind = rawEntry.piece.kind;
      if (!isColor(rawColor) || !isPieceKind(rawKind)) {
        errors.push(validationError("invalid-piece", "Piece color or kind is not recognized.", { square: squareName }));
        continue;
      }

      const piece: ChessPiece = { color: rawColor, kind: rawKind };
      if (piece.kind === "king") kingCount[piece.color] += 1;
      if (piece.kind === "pawn" && (parsedSquare.rank === 1 || parsedSquare.rank === 8)) {
        errors.push(validationError("pawn-on-back-rank", "Pawns cannot occupy the first or eighth rank.", { square: squareName }));
      }
      pieces.push({ square: parsedSquare, piece });
    }
  }

  for (const color of COLORS) {
    if (kingCount[color] !== 1) {
      errors.push(validationError("king-count", `Position must contain exactly one ${color} king.`, { color }));
    }
  }

  const activeColor = candidate.activeColor;
  if (!isColor(activeColor)) {
    errors.push(validationError("invalid-active-color", "Active color must be white or black."));
  }

  const rawRights = candidate.castlingRights ?? [];
  const castlingRights: CastlingRight[] = [];
  if (!Array.isArray(rawRights)) {
    errors.push(validationError("invalid-castling-right", "Castling rights must be an array."));
  } else {
    for (const right of rawRights as readonly unknown[]) {
      if (!isCastlingRight(right)) {
        errors.push(validationError("invalid-castling-right", "Castling right is not recognized."));
      } else if (!castlingRights.includes(right)) {
        castlingRights.push(right);
      }
    }
  }

  const rawEnPassantTarget = candidate.enPassantTarget ?? null;
  let enPassantTarget: Square | null = null;
  if (rawEnPassantTarget !== null) {
    if (isSquare(rawEnPassantTarget)) {
      enPassantTarget = parseSquare(formatSquare(rawEnPassantTarget));
    } else {
      errors.push(validationError("invalid-en-passant-target", "En-passant target must be null or a valid square."));
    }
  }

  const halfmoveClock = candidate.halfmoveClock ?? 0;
  if (!Number.isSafeInteger(halfmoveClock) || (halfmoveClock as number) < 0) {
    errors.push(validationError("invalid-halfmove-clock", "Halfmove clock must be a nonnegative safe integer."));
  }

  const fullmoveNumber = candidate.fullmoveNumber ?? 1;
  if (!Number.isSafeInteger(fullmoveNumber) || (fullmoveNumber as number) < 1) {
    errors.push(validationError("invalid-fullmove-number", "Fullmove number must be a positive safe integer."));
  }

  if (errors.length > 0) return { ok: false, errors };

  const position: Position = Object.freeze({
    pieces: Object.freeze(pieces.map(immutablePieceOnSquare)),
    activeColor: activeColor as Color,
    castlingRights: Object.freeze(castlingRights),
    enPassantTarget: enPassantTarget ? Object.freeze({ ...enPassantTarget }) : null,
    halfmoveClock: halfmoveClock as number,
    fullmoveNumber: fullmoveNumber as number,
  });
  return { ok: true, position };
}

export function createInitialPosition(): Position {
  const pieces: PieceOnSquare[] = [];
  for (const [index, file] of FILES.entries()) {
    const backRankKind = BACK_RANK[index]!;
    pieces.push(
      { square: parseSquare(`${file}1`)!, piece: { color: "white", kind: backRankKind } },
      { square: parseSquare(`${file}2`)!, piece: { color: "white", kind: "pawn" } },
      { square: parseSquare(`${file}7`)!, piece: { color: "black", kind: "pawn" } },
      { square: parseSquare(`${file}8`)!, piece: { color: "black", kind: backRankKind } },
    );
  }

  const result = createPosition({
    pieces,
    activeColor: "white",
    castlingRights: [...CASTLING_RIGHTS],
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  });
  if (!result.ok) throw new Error("Internal error: standard initial position is invalid.");
  return result.position;
}

export function pieceAt(position: Position, square: Square): ChessPiece | null {
  const name = formatSquare(square);
  const entry = position.pieces.find((placement) => formatSquare(placement.square) === name);
  return entry?.piece ?? null;
}

export function squaresWithPieces(position: Position): readonly Square[] {
  return position.pieces.map(({ square }) => square);
}
