import { createPosition } from "./position.js";
import { formatSquare, parseSquare } from "./square.js";
import { getGameStatus } from "./moves.js";
import type { CastlingRight, Color, PieceKind, PieceOnSquare, Position, Square } from "./types.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const MAX_FEN_LENGTH = 128;
const FEN_TO_KIND: Readonly<Record<string, PieceKind>> = {
  k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn",
};
const KIND_TO_FEN: Readonly<Record<PieceKind, string>> = {
  king: "k", queen: "q", rook: "r", bishop: "b", knight: "n", pawn: "p",
};
const RIGHT_TO_FEN: Readonly<Record<CastlingRight, string>> = {
  "white-king-side": "K", "white-queen-side": "Q", "black-king-side": "k", "black-queen-side": "q",
};
const FEN_TO_RIGHT = new Map(Object.entries(RIGHT_TO_FEN).map(([right, symbol]) => [symbol, right as CastlingRight]));

function fail(message: string): never {
  throw new TypeError(`Invalid FEN: ${message}`);
}

function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}

function squareAt(file: string, rank: number): Square {
  return parseSquare(`${file}${rank}`)!;
}

function getPiece(position: Position, square: string): PieceOnSquare["piece"] | null {
  return position.pieces.find((entry) => formatSquare(entry.square) === square)?.piece ?? null;
}

function requirePiece(position: Position, square: string, color: Color, kind: PieceKind): void {
  const piece = getPiece(position, square);
  if (!piece || piece.color !== color || piece.kind !== kind) fail(`inconsistent castling right for ${square}`);
}

function validateMetadata(position: Position): void {
  for (const right of position.castlingRights) {
    if (right === "white-king-side") {
      requirePiece(position, "e1", "white", "king"); requirePiece(position, "h1", "white", "rook");
    } else if (right === "white-queen-side") {
      requirePiece(position, "e1", "white", "king"); requirePiece(position, "a1", "white", "rook");
    } else if (right === "black-king-side") {
      requirePiece(position, "e8", "black", "king"); requirePiece(position, "h8", "black", "rook");
    } else {
      requirePiece(position, "e8", "black", "king"); requirePiece(position, "a8", "black", "rook");
    }
  }
  const target = position.enPassantTarget;
  if (target) {
    const expectedRank = position.activeColor === "white" ? 6 : 3;
    if (target.rank !== expectedRank) fail("en-passant target rank conflicts with active color");
    const targetName = formatSquare(target);
    if (getPiece(position, targetName)) fail("en-passant target must be empty");
    const pawnRank = position.activeColor === "white" ? 5 : 4;
    const originRank = position.activeColor === "white" ? 7 : 2;
    const movedColor = opposite(position.activeColor);
    const movedPawn = getPiece(position, `${target.file}${pawnRank}`);
    if (!movedPawn || movedPawn.color !== movedColor || movedPawn.kind !== "pawn") fail("en-passant target has no corresponding double-moved pawn");
    if (getPiece(position, `${target.file}${originRank}`)) fail("en-passant pawn's origin square must be empty");
  }
}

/** Parse the six-field FEN notation into an immutable, validated position. */
export function parseFEN(fen: string): Position {
  if (typeof fen !== "string") fail("input must be a string");
  if (fen.length > MAX_FEN_LENGTH) fail(`input must be ${MAX_FEN_LENGTH} characters or fewer`);
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6 || fields.some((field) => field.length === 0)) fail("expected six fields");
  const [placement, activeField, castlingField, enPassantField, halfmoveField, fullmoveField] = fields as [string, string, string, string, string, string];
  const ranks = placement.split("/");
  if (ranks.length !== 8) fail("piece placement must contain eight ranks");
  const pieces: PieceOnSquare[] = [];
  const counts = { white: { all: 0, pawns: 0 }, black: { all: 0, pawns: 0 } };
  for (let row = 0; row < 8; row += 1) {
    if (/[1-8]{2}/.test(ranks[row]!)) fail(`rank ${8 - row} contains adjacent empty-square counts`);
    let fileIndex = 0;
    for (const token of ranks[row]!) {
      if (/^[1-8]$/.test(token)) {
        fileIndex += Number(token);
        continue;
      }
      const kind = FEN_TO_KIND[token.toLowerCase()];
      if (!kind || fileIndex >= 8) fail(`invalid piece placement on rank ${8 - row}`);
      const color: Color = token === token.toUpperCase() ? "white" : "black";
      const file = FILES[fileIndex];
      if (!file) fail(`rank ${8 - row} contains more than eight squares`);
      pieces.push({ square: squareAt(file, 8 - row), piece: { color, kind } });
      counts[color].all += 1;
      if (kind === "pawn") counts[color].pawns += 1;
      fileIndex += 1;
    }
    if (fileIndex !== 8) fail(`rank ${8 - row} does not contain exactly eight squares`);
  }
  if (activeField !== "w" && activeField !== "b") fail("active color must be 'w' or 'b'");
  const activeColor: Color = activeField === "w" ? "white" : "black";
  const castlingRights: CastlingRight[] = [];
  if (castlingField !== "-") {
    for (const symbol of castlingField) {
      const right = FEN_TO_RIGHT.get(symbol);
      if (!right || castlingRights.includes(right)) fail("castling rights must be unique KQkq symbols or '-'");
      castlingRights.push(right);
    }
  }
  let enPassantTarget: Square | null = null;
  if (enPassantField !== "-") {
    enPassantTarget = parseSquare(enPassantField);
    if (!enPassantTarget) fail("en-passant target must be '-' or a valid square");
  }
  if (!/^(0|[1-9]\d*)$/.test(halfmoveField) || !Number.isSafeInteger(Number(halfmoveField))) fail("halfmove clock must be a nonnegative safe integer without leading zeroes");
  if (!/^[1-9]\d*$/.test(fullmoveField) || !Number.isSafeInteger(Number(fullmoveField))) fail("fullmove number must be a positive safe integer");
  for (const color of ["white", "black"] as const) {
    if (counts[color].all > 16 || counts[color].pawns > 8) fail(`too many ${color} pieces or pawns`);
  }
  const validated = createPosition({
    pieces, activeColor, castlingRights, enPassantTarget,
    halfmoveClock: Number(halfmoveField), fullmoveNumber: Number(fullmoveField),
  });
  if (!validated.ok) fail(validated.errors.map((error) => error.message).join("; "));
  const position = validated.position;
  validateMetadata(position);
  const lastMoverStatus = getGameStatus({ ...position, activeColor: opposite(activeColor) });
  if (lastMoverStatus.kind === "check" || lastMoverStatus.kind === "checkmate") fail("the side that just moved cannot have left its king in check");
  return position;
}

/** Serialize a validated position to standard six-field FEN. */
export function serializeFEN(input: Position): string {
  const validated = createPosition(input);
  if (!validated.ok) fail(validated.errors.map((error) => error.message).join("; "));
  const position = validated.position;
  validateMetadata(position);
  const lastMoverStatus = getGameStatus({ ...position, activeColor: opposite(position.activeColor) });
  if (lastMoverStatus.kind === "check" || lastMoverStatus.kind === "checkmate") fail("the side that just moved cannot have left its king in check");
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let text = "";
    let empty = 0;
    for (const file of FILES) {
      const piece = getPiece(position, `${file}${rank}`);
      if (!piece) { empty += 1; continue; }
      if (empty) { text += String(empty); empty = 0; }
      const symbol = KIND_TO_FEN[piece.kind];
      text += piece.color === "white" ? symbol.toUpperCase() : symbol;
    }
    if (empty) text += String(empty);
    ranks.push(text);
  }
  const castling = (["white-king-side", "white-queen-side", "black-king-side", "black-queen-side"] as const)
    .filter((right) => position.castlingRights.includes(right))
    .map((right) => RIGHT_TO_FEN[right]).join("") || "-";
  return `${ranks.join("/")} ${position.activeColor === "white" ? "w" : "b"} ${castling} ${position.enPassantTarget ? formatSquare(position.enPassantTarget) : "-"} ${position.halfmoveClock} ${position.fullmoveNumber}`;
}
