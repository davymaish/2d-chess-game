import {
  applyLegalMove,
  createInitialPosition,
  getGameStatus,
} from "@2d-chess/chess-core";
import type {
  GameStatus,
  MoveIntent,
  MoveRecord,
  MoveRejectionReason,
  Position,
} from "@2d-chess/chess-core";

export interface SessionSnapshot {
  readonly position: Position;
  readonly move: MoveRecord | null;
}

/** Immutable timeline. `cursor` is the active game; `replayIndex` is a read-only view. */
export interface GameSession {
  readonly snapshots: readonly SessionSnapshot[];
  readonly cursor: number;
  /** V1-compatible move index: -1 is the initial position; null means live play. */
  readonly replayIndex: number | null;
}

export type SessionMoveResult =
  | { readonly kind: "accepted"; readonly session: GameSession }
  | { readonly kind: "rejected"; readonly reason: MoveRejectionReason | "game-over" | "replay-active" };

export interface ReplayState {
  readonly index: number;
  readonly totalMoves: number;
  readonly currentMove: MoveRecord | null;
  readonly atStart: boolean;
  readonly atEnd: boolean;
}

function makeSession(snapshots: readonly SessionSnapshot[], cursor: number, replayIndex: number | null): GameSession {
  const immutableSnapshots = Object.freeze(snapshots.map((snapshot) => Object.freeze({
    position: snapshot.position,
    move: snapshot.move,
  })));
  return Object.freeze({ snapshots: immutableSnapshots, cursor, replayIndex });
}

export function createGameSession(position: Position = createInitialPosition()): GameSession {
  return makeSession([{ position, move: null }], 0, null);
}

function activeSnapshotIndex(session: GameSession): number {
  return session.replayIndex === null ? session.cursor : session.replayIndex + 1;
}

export function getSessionPosition(session: GameSession): Position {
  return session.snapshots[activeSnapshotIndex(session)]!.position;
}

export function getMoveHistory(session: GameSession): readonly MoveRecord[] {
  return session.snapshots.slice(1, session.cursor + 1).map((snapshot) => snapshot.move!);
}

function priorPositionsAt(session: GameSession, snapshotIndex: number): readonly Position[] {
  return session.snapshots.slice(0, snapshotIndex).map((snapshot) => snapshot.position);
}

export function getSessionStatus(session: GameSession): GameStatus {
  const snapshotIndex = activeSnapshotIndex(session);
  return getGameStatus(session.snapshots[snapshotIndex]!.position, priorPositionsAt(session, snapshotIndex));
}

export function playSessionMove(session: GameSession, intent: MoveIntent): SessionMoveResult {
  if (session.replayIndex !== null) return { kind: "rejected", reason: "replay-active" };
  const current = session.snapshots[session.cursor]!.position;
  const status = getGameStatus(current, priorPositionsAt(session, session.cursor));
  if (status.kind === "checkmate" || status.kind === "stalemate" || status.kind === "draw" || status.kind === "invalid-position") {
    return { kind: "rejected", reason: "game-over" };
  }
  const result = applyLegalMove(current, intent);
  if (result.kind !== "accepted") return { kind: "rejected", reason: result.reason };
  const nextSnapshots = session.snapshots.slice(0, session.cursor + 1);
  nextSnapshots.push({ position: result.position, move: result.move });
  return { kind: "accepted", session: makeSession(nextSnapshots, nextSnapshots.length - 1, null) };
}

export function undoSession(session: GameSession): GameSession {
  if (session.replayIndex !== null || session.cursor === 0) return session;
  return makeSession(session.snapshots, session.cursor - 1, null);
}

export function redoSession(session: GameSession): GameSession {
  if (session.replayIndex !== null || session.cursor >= session.snapshots.length - 1) return session;
  return makeSession(session.snapshots, session.cursor + 1, null);
}

export function openReplay(session: GameSession): GameSession {
  return makeSession(session.snapshots, session.cursor, -1);
}

export function closeReplay(session: GameSession): GameSession {
  return session.replayIndex === null ? session : makeSession(session.snapshots, session.cursor, null);
}

export function seekReplay(session: GameSession, index: number): GameSession | null {
  if (session.replayIndex === null || !Number.isInteger(index) || index < -1 || index >= session.cursor) return null;
  return makeSession(session.snapshots, session.cursor, index);
}

export function stepReplay(session: GameSession, direction: "next" | "previous"): GameSession | null {
  if (session.replayIndex === null) return null;
  return seekReplay(session, session.replayIndex + (direction === "next" ? 1 : -1));
}

export function firstReplayPosition(session: GameSession): GameSession | null {
  return seekReplay(session, -1);
}

export function lastReplayPosition(session: GameSession): GameSession | null {
  return session.cursor === 0 ? seekReplay(session, -1) : seekReplay(session, session.cursor - 1);
}

export function getReplayState(session: GameSession): ReplayState | null {
  if (session.replayIndex === null) return null;
  return Object.freeze({
    index: session.replayIndex,
    totalMoves: session.cursor,
    currentMove: session.replayIndex < 0 ? null : session.snapshots[session.replayIndex + 1]!.move,
    atStart: session.replayIndex < 0,
    atEnd: session.replayIndex >= session.cursor - 1,
  });
}
