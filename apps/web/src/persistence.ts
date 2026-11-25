import { createPosition, parseSquare, serializeFEN } from "@2d-chess/chess-core";
import type { Color, MoveRecord, Position, PromotionPieceKind } from "@2d-chess/chess-core";
import { CHESS_CLOCK_PRESETS, tickClock } from "./clock.js";
import type { ChessClockState, ClockPresetId } from "./clock.js";
import { closeReplay, createGameSession, getSessionStatus, playSessionMove } from "./session.js";
import type { GameSession } from "./session.js";

export const GAME_SAVE_SCHEMA = "2d-chess-game-v2";
export const GAME_SAVE_VERSION = 1;
export const GAME_SAVE_STORAGE_KEY = "2d-chess-game:v2";
export const LEGACY_V1_SAVE_STORAGE_KEY = "2d-chess-game:save:v1";
export const GAME_SAVE_MAX_BYTES = 256 * 1024;

export interface PersistedClock {
  readonly whiteMilliseconds: number;
  readonly blackMilliseconds: number;
  readonly incrementMilliseconds: number;
  readonly activeColor: Color;
  readonly started: boolean;
}

export interface GameSaveSnapshot {
  readonly schema: typeof GAME_SAVE_SCHEMA;
  readonly version: typeof GAME_SAVE_VERSION;
  readonly savedAt: string;
  readonly state: {
    readonly initialPosition: Position;
    readonly moveHistory: readonly MoveRecord[];
    readonly clockPreset: ClockPresetId;
    readonly clock: PersistedClock;
  };
}

export interface RestoredGameSave {
  readonly session: GameSession;
  readonly clockPreset: ClockPresetId;
  readonly clock: ChessClockState;
  readonly savedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveInspection =
  | { readonly status: "available"; readonly save: RestoredGameSave }
  | { readonly status: "missing" }
  | { readonly status: "legacy"; readonly message: string }
  | { readonly status: "invalid" | "outdated" | "unavailable"; readonly message: string };

export type SaveWriteResult =
  | { readonly status: "saved" }
  | { readonly status: "cleared" }
  | { readonly status: "preserved"; readonly message: string }
  | { readonly status: "unavailable"; readonly message: string };

class TerminalSaveError extends TypeError {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new TypeError(message);
}

function getStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage; }
  catch { return null; }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isClockPreset(value: unknown): value is ClockPresetId {
  return typeof value === "string" && Object.hasOwn(CHESS_CLOCK_PRESETS, value);
}

function validateSavedAt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  try { return new Date(timestamp).toISOString() === value; }
  catch { return false; }
}

function normalizePosition(value: unknown): Position {
  const validated = createPosition(value as Parameters<typeof createPosition>[0]);
  if (!validated.ok) fail(`Invalid saved position: ${validated.errors.map(({ message }) => message).join("; ")}`);
  try { return JSON.parse(JSON.stringify(validated.position)) as Position; }
  catch { fail("Saved position is not JSON-safe."); }
}

function normalizeMoveIntent(value: unknown): { readonly from: NonNullable<ReturnType<typeof parseSquare>>; readonly to: NonNullable<ReturnType<typeof parseSquare>>; readonly promotion?: PromotionPieceKind } {
  if (!isRecord(value) || !isRecord(value.from) || !isRecord(value.to)) fail("Saved move record must contain from and to squares.");
  const from = parseSquare(`${String(value.from.file)}${String(value.from.rank)}`);
  const to = parseSquare(`${String(value.to.file)}${String(value.to.rank)}`);
  if (!from || !to) fail("Saved move contains an invalid square.");
  if (value.promotion !== undefined && !["queen", "rook", "bishop", "knight"].includes(String(value.promotion))) fail("Saved move contains an invalid promotion.");
  return value.promotion === undefined ? { from, to } : { from, to, promotion: value.promotion as PromotionPieceKind };
}

function replaySavedMoves(initialPosition: Position, value: unknown): GameSession {
  if (!Array.isArray(value)) fail("Saved move history must be an array.");
  let session = createGameSession(initialPosition);
  for (const [index, rawMove] of value.entries()) {
    const intent = normalizeMoveIntent(rawMove);
    const result = playSessionMove(session, intent);
    if (result.kind !== "accepted") fail(`Saved move ${index + 1} cannot be replayed: ${result.reason}.`);
    const actual = result.session.snapshots[result.session.cursor]!.move!;
    if (!isRecord(rawMove) || !isRecord(rawMove.piece)) fail(`Saved move ${index + 1} has no piece record.`);
    const sameCaptured = rawMove.capturedPiece === undefined
      ? actual.capturedPiece === undefined
      : isRecord(rawMove.capturedPiece) && rawMove.capturedPiece.color === actual.capturedPiece?.color && rawMove.capturedPiece.kind === actual.capturedPiece?.kind;
    if (rawMove.piece.color !== actual.piece.color || rawMove.piece.kind !== actual.piece.kind || !sameCaptured || rawMove.promotion !== actual.promotion) {
      fail(`Saved move ${index + 1} does not match the legal transition.`);
    }
    session = result.session;
  }
  return session;
}

function validateClock(value: unknown, preset: ClockPresetId, sideToMove: Color): PersistedClock {
  if (!isRecord(value)) fail("Saved clock state must be an object.");
  const times = [value.whiteMilliseconds, value.blackMilliseconds];
  if (times.some((field) => !Number.isSafeInteger(field) || (field as number) <= 0)) fail("Saved remaining clock values must be positive safe integers.");
  if (!Number.isSafeInteger(value.incrementMilliseconds) || (value.incrementMilliseconds as number) < 0) fail("Saved clock increment must be a nonnegative safe integer.");
  const presetIncrement = CHESS_CLOCK_PRESETS[preset].incrementSeconds * 1000;
  if (value.incrementMilliseconds !== presetIncrement) fail("Saved clock increment does not match its time control.");
  if (value.activeColor !== "white" && value.activeColor !== "black") fail("Saved clock active color is invalid.");
  if (value.activeColor !== sideToMove) fail("Saved clock side does not match the current position.");
  if (typeof value.started !== "boolean") fail("Saved clock started state must be boolean.");
  return {
    whiteMilliseconds: value.whiteMilliseconds as number,
    blackMilliseconds: value.blackMilliseconds as number,
    incrementMilliseconds: value.incrementMilliseconds as number,
    activeColor: value.activeColor,
    started: value.started,
  };
}

function restoredClock(clock: PersistedClock): ChessClockState {
  return Object.freeze({ ...clock, running: false, lastTickAt: null, flaggedColor: null });
}

function assertInProgress(session: GameSession, clock: PersistedClock): void {
  const status = getSessionStatus(closeReplay(session));
  if (["checkmate", "stalemate", "draw", "invalid-position"].includes(status.kind)) {
    throw new TerminalSaveError("Completed games are not saved.");
  }
  if (clock.whiteMilliseconds <= 0 || clock.blackMilliseconds <= 0) throw new TerminalSaveError("Flagged games are not saved.");
}

/** Create a stable, JSON-safe save snapshot; replay-only UI state is omitted. */
export function createGameSaveSnapshot(
  session: GameSession,
  clockPreset: ClockPresetId,
  clock: ChessClockState,
  savedAt = new Date().toISOString(),
): GameSaveSnapshot {
  if (!isClockPreset(clockPreset)) fail("Save time control is unsupported.");
  if (!validateSavedAt(savedAt)) fail("Save timestamp must be a canonical ISO timestamp.");
  const active = closeReplay(session);
  const initialPosition = normalizePosition(active.snapshots[0]?.position);
  serializeFEN(initialPosition);
  const moveHistory = active.snapshots.slice(1, active.cursor + 1).map((snapshot) => snapshot.move);
  if (moveHistory.some((move) => move === null || move === undefined)) fail("Saved move history contains a missing transition.");
  const replayed = replaySavedMoves(initialPosition, moveHistory);
  const finalPosition = replayed.snapshots[replayed.cursor]!.position;
  if (typeof clock.running !== "boolean" || typeof clock.started !== "boolean") fail("Clock runtime state is invalid.");
  if (clock.running && !Number.isSafeInteger(clock.lastTickAt)) fail("Running clock must have a valid last-tick timestamp.");
  if (!clock.running && clock.lastTickAt !== null) fail("Paused clock must not retain a last-tick timestamp.");
  if (clock.flaggedColor !== null && clock.flaggedColor !== "white" && clock.flaggedColor !== "black") fail("Clock flag state is invalid.");
  const checkpoint = clock.running ? tickClock(clock, Date.parse(savedAt)) : clock;
  const persistedClock: PersistedClock = {
    whiteMilliseconds: checkpoint.whiteMilliseconds,
    blackMilliseconds: checkpoint.blackMilliseconds,
    incrementMilliseconds: checkpoint.incrementMilliseconds,
    activeColor: checkpoint.activeColor,
    started: checkpoint.started,
  };
  if (checkpoint.flaggedColor !== null || checkpoint.whiteMilliseconds <= 0 || checkpoint.blackMilliseconds <= 0) {
    throw new TerminalSaveError("Flagged games are not saved.");
  }
  const validatedClock = validateClock(persistedClock, clockPreset, finalPosition.activeColor);
  assertInProgress(replayed, validatedClock);
  return {
    schema: GAME_SAVE_SCHEMA,
    version: GAME_SAVE_VERSION,
    savedAt,
    state: { initialPosition, moveHistory: moveHistory as MoveRecord[], clockPreset, clock: validatedClock },
  };
}

/** Validate and reconstruct a save. Running clocks are intentionally restored paused. */
export function parseGameSave(serialized: string): RestoredGameSave {
  if (typeof serialized !== "string") fail("Save must be a JSON string.");
  if (byteLength(serialized) > GAME_SAVE_MAX_BYTES) fail("Save exceeds the 256 KiB limit.");
  let raw: unknown;
  try { raw = JSON.parse(serialized) as unknown; }
  catch { throw new SyntaxError("Save must contain valid JSON."); }
  if (!isRecord(raw)) fail("Save must be an object.");
  if (raw.schema !== GAME_SAVE_SCHEMA || raw.version !== GAME_SAVE_VERSION) fail("Save schema or version is unsupported.");
  if (!validateSavedAt(raw.savedAt)) fail("Save timestamp is invalid.");
  if (!isRecord(raw.state)) fail("Save state must be an object.");
  if (!isClockPreset(raw.state.clockPreset)) fail("Save time control is unsupported.");
  const initialPosition = normalizePosition(raw.state.initialPosition);
  // FEN validation also rejects inconsistent castling/en-passant metadata and impossible last-mover checks.
  const normalizedInitialPosition = JSON.parse(JSON.stringify(initialPosition)) as Position;
  serializeFEN(normalizedInitialPosition);
  const session = replaySavedMoves(normalizedInitialPosition, raw.state.moveHistory);
  const finalPosition = session.snapshots[session.cursor]!.position;
  const clock = validateClock(raw.state.clock, raw.state.clockPreset, finalPosition.activeColor);
  assertInProgress(session, clock);
  return {
    session,
    clockPreset: raw.state.clockPreset,
    clock: restoredClock(clock),
    savedAt: raw.savedAt,
  };
}

export function serializeGameSave(snapshot: GameSaveSnapshot): string {
  const serialized = JSON.stringify(snapshot);
  if (byteLength(serialized) > GAME_SAVE_MAX_BYTES) fail("Save exceeds the 256 KiB limit.");
  parseGameSave(serialized);
  return serialized;
}

function isValidExistingSave(value: string): boolean {
  try { parseGameSave(value); return true; }
  catch { return false; }
}

/** Inspect storage without deleting, migrating, or overwriting legacy/corrupt/unsupported data. */
export function inspectGameSaveStorage(storageInput?: StorageLike | null): SaveInspection {
  const storage = getStorage(storageInput);
  if (!storage) return { status: "unavailable", message: "Browser storage is unavailable." };
  let raw: string | null;
  try { raw = storage.getItem(GAME_SAVE_STORAGE_KEY); }
  catch { return { status: "unavailable", message: "Browser storage could not be read." }; }
  if (raw === null) {
    try {
      if (storage.getItem(LEGACY_V1_SAVE_STORAGE_KEY) !== null) {
        return { status: "legacy", message: "A V1 save was found and left untouched; automatic V1-save import is not supported." };
      }
    } catch { return { status: "unavailable", message: "Browser storage could not be read." }; }
    return { status: "missing" };
  }
  try { return { status: "available", save: parseGameSave(raw) }; }
  catch (error) {
    const message = error instanceof Error ? error.message : "Saved game could not be read.";
    return { status: /unsupported|schema|version/i.test(message) ? "outdated" : "invalid", message };
  }
}

/** Persist only validated V2 data; unsupported/corrupt values are preserved for recovery. */
export function saveGameToStorage(
  session: GameSession,
  clockPreset: ClockPresetId,
  clock: ChessClockState,
  storageInput?: StorageLike | null,
  now = Date.now(),
): SaveWriteResult {
  const storage = getStorage(storageInput);
  if (!storage) return { status: "unavailable", message: "Browser storage is unavailable." };
  let existing: string | null;
  try { existing = storage.getItem(GAME_SAVE_STORAGE_KEY); }
  catch { return { status: "unavailable", message: "Browser storage could not be read." }; }
  if (existing !== null && !isValidExistingSave(existing)) {
    return { status: "preserved", message: "An unsupported or invalid V2 save was left untouched." };
  }
  try {
    const snapshot = createGameSaveSnapshot(session, clockPreset, clock, new Date(now).toISOString());
    const serialized = serializeGameSave(snapshot);
    try { storage.setItem(GAME_SAVE_STORAGE_KEY, serialized); }
    catch { return { status: "unavailable", message: "Browser storage could not be written (it may be blocked or full)." }; }
    return { status: "saved" };
  } catch (error) {
    if (error instanceof TerminalSaveError && existing !== null) {
      try { storage.removeItem(GAME_SAVE_STORAGE_KEY); return { status: "cleared" }; }
      catch { return { status: "unavailable", message: "The completed-game save could not be cleared." }; }
    }
    if (error instanceof TerminalSaveError) return { status: "cleared" };
    return { status: "preserved", message: error instanceof Error ? error.message : "Save could not be validated." };
  }
}

export function clearGameSaveFromStorage(storageInput?: StorageLike | null): boolean {
  const storage = getStorage(storageInput);
  if (!storage) return false;
  try { storage.removeItem(GAME_SAVE_STORAGE_KEY); return true; }
  catch { return false; }
}
