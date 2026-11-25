import { parseFEN } from "./fen.js";
import type { Position } from "./types.js";

export type PGNResult = "1-0" | "0-1" | "1/2-1/2" | "*";
export type PGNHeaders = Readonly<Record<string, string>>;
export interface PGNExportInput {
  readonly moveHistory: readonly string[];
  readonly resultToken?: PGNResult;
}
export interface ParsedPGN {
  readonly headers: PGNHeaders;
  /** Numbered SAN main line. Comments, NAGs, and side variations are intentionally omitted. */
  readonly moves: readonly string[];
  readonly result: PGNResult;
  readonly startingPosition: Position;
}

const STANDARD_HEADERS = ["Event", "Site", "Date", "Round", "White", "Black", "Result"] as const;
const VALID_RESULTS: readonly PGNResult[] = ["1-0", "0-1", "1/2-1/2", "*"];
const SAN_TOKEN = /^(?:O-O(?:-O)?|[KQRBN](?:(?:[a-h][1-8]?)|[1-8])?x?[a-h][1-8]|(?:[a-h]x[a-h][1-8]|[a-h][1-8])(?:=[QRBN])?)(?:[+#])?$/;
const DEFAULT_HEADERS: Record<string, string> = {
  Event: "Casual Game", Site: "Local", Date: "????.??.??", Round: "-", White: "White", Black: "Black",
};

function fail(message: string): never {
  throw new TypeError(message);
}

function isResult(value: string): value is PGNResult {
  return VALID_RESULTS.includes(value as PGNResult);
}

interface HistoryMove { readonly number: number; readonly color: "white" | "black"; readonly san: string; }

function parseHistoryMove(notation: unknown, index: number): HistoryMove {
  if (typeof notation !== "string") fail(`PGN move ${index + 1} must be a numbered SAN string.`);
  const match = /^(\d+)\.(\.\.)?\s+([^\s]+)$/.exec(notation.trim());
  if (!match) fail(`PGN move ${index + 1} must use numbered SAN notation.`);
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number < 1) fail(`PGN move ${index + 1} has an invalid move number.`);
  if (!SAN_TOKEN.test(match[3]!)) fail(`PGN move ${index + 1} contains an invalid SAN token.`);
  return { number, color: match[2] ? "black" : "white", san: match[3]! };
}

function historyTokens(moveHistory: readonly string[]): string[] {
  const moves = moveHistory.map(parseHistoryMove);
  const tokens: string[] = [];
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index]!;
    const previous = moves[index - 1];
    if (previous) {
      const nextBlack = previous.color === "white" && move.color === "black" && move.number === previous.number;
      const nextWhite = previous.color === "black" && move.color === "white" && move.number === previous.number + 1;
      if (!nextBlack && !nextWhite) fail(`PGN move ${index + 1} does not follow the previous move number and color.`);
    }
    if (move.color === "white") tokens.push(`${move.number}.`, move.san);
    else {
      if (!previous || previous.color !== "white" || previous.number !== move.number) tokens.push(`${move.number}...`);
      tokens.push(move.san);
    }
  }
  return tokens;
}

function wrapMovetext(tokens: readonly string[], maxLineLength = 80): string {
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const candidate = line ? `${line} ${token}` : token;
    if (line && candidate.length > maxLineLength) { lines.push(line); line = token; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function escapeHeader(value: unknown, tag: string): string {
  if (typeof value !== "string") fail(`PGN header ${tag} must be a string.`);
  return value.replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

/** Export a V1-compatible numbered SAN history as seven-tag-roster PGN. */
export function serializePGN(game: PGNExportInput, headers: PGNHeaders = {}): string {
  if (!game || typeof game !== "object") fail("PGN export requires a game object.");
  if (!Array.isArray(game.moveHistory)) fail("PGN export requires a move history array.");
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) fail("PGN headers must be an object.");
  const result = game.resultToken ?? "*";
  if (!isResult(result)) fail("PGN result must be 1-0, 0-1, 1/2-1/2, or *.");
  const values: Record<string, unknown> = { ...DEFAULT_HEADERS, ...headers, Result: result };
  const extras = Object.entries(headers).filter(([tag]) => !STANDARD_HEADERS.includes(tag as typeof STANDARD_HEADERS[number]));
  const pairs: [string, unknown][] = [
    ...STANDARD_HEADERS.map((tag) => [tag, values[tag]] as [string, unknown]),
    ...extras,
  ];
  const tags = pairs.map(([tag, value]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tag)) fail(`Invalid PGN header name: ${tag}`);
    return `[${tag} "${escapeHeader(value, tag)}"]`;
  });
  const tokens = historyTokens(game.moveHistory);
  tokens.push(result);
  return `${tags.join("\n")}\n\n${wrapMovetext(tokens)}`;
}

function stripCommentsAndVariations(movetext: string): string {
  let output = "";
  let variationDepth = 0;
  for (let index = 0; index < movetext.length; index += 1) {
    const character = movetext[index]!;
    if (character === "{") {
      const end = movetext.indexOf("}", index + 1);
      if (end < 0) fail("PGN contains an unterminated brace comment.");
      if (movetext.slice(index + 1, end).includes("{")) fail("PGN brace comments cannot be nested.");
      index = end;
      output += " ";
    } else if (character === ";") {
      while (index < movetext.length && movetext[index] !== "\n" && movetext[index] !== "\r") index += 1;
      output += " ";
    } else if (character === "(") variationDepth += 1;
    else if (character === ")") {
      if (variationDepth === 0) fail("PGN contains an unmatched variation close.");
      variationDepth -= 1;
    } else if (variationDepth === 0) output += character;
  }
  if (variationDepth !== 0) fail("PGN contains an unterminated variation.");
  return output.replace(/\$\d+/g, " ").replace(/([^\s!?]+)[!?]+(?=\s|$)/g, "$1");
}

/** Parse tags and the sequential SAN main line for preview; does not apply moves to a game session. */
export function parsePGN(pgn: string): ParsedPGN {
  if (typeof pgn !== "string") fail("PGN input must be a string.");
  const lines = pgn.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headers: Record<string, string> = {};
  let lineIndex = 0;
  while (lineIndex < lines.length && lines[lineIndex]!.trim() === "") lineIndex += 1;
  while (lineIndex < lines.length && lines[lineIndex]!.trim().startsWith("[")) {
    const line = lines[lineIndex]!.trim();
    const match = /^\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:\\.|[^"\\])*)"\]$/.exec(line);
    if (!match) fail(`Invalid PGN tag pair on line ${lineIndex + 1}.`);
    const tag = match[1]!;
    const rawValue = match[2]!;
    if (Object.hasOwn(headers, tag)) fail(`Duplicate PGN header: ${tag}.`);
    if (/\\(?!["\\])/.test(rawValue)) fail(`Invalid escape in PGN header ${tag}.`);
    headers[tag] = rawValue.replace(/\\(["\\])/g, "$1");
    lineIndex += 1;
  }
  if (headers.Result !== undefined && !isResult(headers.Result)) fail("PGN Result header must be 1-0, 0-1, 1/2-1/2, or *.");
  const startingPosition = headers.FEN === undefined
    ? parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    : parseFEN(headers.FEN);
  let expectedNumber = startingPosition.fullmoveNumber;
  let expectedColor: "white" | "black" = startingPosition.activeColor;
  const movetext = stripCommentsAndVariations(lines.slice(lineIndex).join("\n"))
    .replace(/(\d+\.(?:\.\.)?)(?=\S)/g, "$1 ").trim();
  const tokens = movetext ? movetext.split(/\s+/) : [];
  const moves: string[] = [];
  let marker: { number: number; color: "white" | "black" } | null = null;
  let result: PGNResult | null = null;
  for (const token of tokens) {
    if (result !== null) fail("PGN movetext cannot contain tokens after the result marker.");
    const markerMatch = /^(\d+)\.(\.\.)?$/.exec(token);
    if (markerMatch) {
      if (marker) fail("PGN contains a move number without a SAN move.");
      const number = Number(markerMatch[1]);
      const color = markerMatch[2] ? "black" : "white";
      if (!Number.isSafeInteger(number) || number !== expectedNumber || color !== expectedColor) {
        fail("PGN move number and color do not follow the previous move.");
      }
      marker = { number, color };
      continue;
    }
    if (isResult(token)) { result = token; continue; }
    if (!SAN_TOKEN.test(token)) fail(`Invalid SAN token in PGN movetext: ${token}`);
    const move = marker ?? { number: expectedNumber, color: expectedColor };
    if (move.number !== expectedNumber || move.color !== expectedColor) fail("PGN move number and color do not follow the previous move.");
    moves.push(`${move.number}${move.color === "black" ? "..." : "."} ${token}`);
    marker = null;
    if (expectedColor === "white") expectedColor = "black";
    else { expectedColor = "white"; expectedNumber += 1; }
  }
  if (marker) fail("PGN ends with a move number but no SAN move.");
  if (headers.Result !== undefined && result !== null && headers.Result !== result) fail("PGN Result header does not match the movetext result.");
  return { headers: Object.freeze(headers), moves: Object.freeze(moves), result: result ?? headers.Result ?? "*", startingPosition };
}
