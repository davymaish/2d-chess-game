import type { Color } from "@2d-chess/chess-core";
import type { Position } from "@2d-chess/chess-core";

export const CHESS_CLOCK_PRESETS = Object.freeze({
  "bullet-1-0": Object.freeze({ label: "Bullet 1+0", baseSeconds: 60, incrementSeconds: 0 }),
  "blitz-3-2": Object.freeze({ label: "Blitz 3+2", baseSeconds: 180, incrementSeconds: 2 }),
  "blitz-5-0": Object.freeze({ label: "Blitz 5+0", baseSeconds: 300, incrementSeconds: 0 }),
  "rapid-10-0": Object.freeze({ label: "Rapid 10+0", baseSeconds: 600, incrementSeconds: 0 }),
  "rapid-15-10": Object.freeze({ label: "Rapid 15+10", baseSeconds: 900, incrementSeconds: 10 }),
});

export type ClockPresetId = keyof typeof CHESS_CLOCK_PRESETS;
export interface ChessClockState {
  readonly whiteMilliseconds: number;
  readonly blackMilliseconds: number;
  readonly incrementMilliseconds: number;
  readonly activeColor: Color;
  readonly running: boolean;
  readonly started: boolean;
  readonly lastTickAt: number | null;
  readonly flaggedColor: Color | null;
}

export type TimeoutOutcome =
  | { readonly kind: "win"; readonly winner: Color }
  | { readonly kind: "draw"; readonly winner: null };

export function createChessClock(preset: ClockPresetId = "blitz-5-0", activeColor: Color = "white"): ChessClockState {
  const configuration = CHESS_CLOCK_PRESETS[preset];
  return Object.freeze({
    whiteMilliseconds: configuration.baseSeconds * 1000,
    blackMilliseconds: configuration.baseSeconds * 1000,
    incrementMilliseconds: configuration.incrementSeconds * 1000,
    activeColor,
    running: false,
    started: false,
    lastTickAt: null,
    flaggedColor: null,
  });
}

export function tickClock(state: ChessClockState, now: number): ChessClockState {
  if (!state.running || state.lastTickAt === null || state.flaggedColor !== null) return state;
  const elapsed = Math.max(0, now - state.lastTickAt);
  const remaining = Math.max(0, (state.activeColor === "white" ? state.whiteMilliseconds : state.blackMilliseconds) - elapsed);
  if (state.activeColor === "white") {
    return Object.freeze({ ...state, whiteMilliseconds: remaining, lastTickAt: remaining === 0 ? null : now, running: remaining !== 0, flaggedColor: remaining === 0 ? "white" : null });
  }
  return Object.freeze({ ...state, blackMilliseconds: remaining, lastTickAt: remaining === 0 ? null : now, running: remaining !== 0, flaggedColor: remaining === 0 ? "black" : null });
}

export function startClock(state: ChessClockState, now: number): ChessClockState {
  if (state.running || state.flaggedColor !== null) return state;
  return Object.freeze({ ...state, running: true, started: true, lastTickAt: now });
}

export function pauseClock(state: ChessClockState, now: number): ChessClockState {
  if (!state.running) return state;
  const current = tickClock(state, now);
  if (!current.running) return current;
  return Object.freeze({ ...current, running: false, lastTickAt: null });
}

export function switchClockSide(state: ChessClockState, nextColor: Color, now: number): ChessClockState {
  if (nextColor !== "white" && nextColor !== "black") throw new RangeError(`Invalid chess clock color: ${String(nextColor)}`);
  if (nextColor === state.activeColor || state.flaggedColor !== null) return state;
  const current = state.running ? tickClock(state, now) : state;
  if (current.flaggedColor !== null) return current;
  const earnedIncrement = current.started ? current.incrementMilliseconds : 0;
  const updated = current.activeColor === "white"
    ? { ...current, whiteMilliseconds: current.whiteMilliseconds + earnedIncrement }
    : { ...current, blackMilliseconds: current.blackMilliseconds + earnedIncrement };
  return Object.freeze({ ...updated, activeColor: nextColor, lastTickAt: current.running ? now : null });
}

export function alignClockSide(state: ChessClockState, nextColor: Color): ChessClockState {
  if (nextColor !== "white" && nextColor !== "black") throw new RangeError(`Invalid chess clock color: ${String(nextColor)}`);
  if (state.activeColor === nextColor && !state.running) return state;
  return Object.freeze({ ...state, activeColor: nextColor, running: false, lastTickAt: null });
}

export function stopClock(state: ChessClockState, now: number): ChessClockState {
  return state.running ? pauseClock(state, now) : state;
}

export function remainingSeconds(milliseconds: number): number {
  return Math.ceil(Math.max(0, milliseconds) / 1000);
}

export function formatClockTime(milliseconds: number): string {
  const seconds = remainingSeconds(milliseconds);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Mirrors V1's flag-fall adjudication, which awards a win only with mating material. */
export function getTimeoutOutcome(position: Position, flaggedColor: Color): TimeoutOutcome {
  const winner: Color = flaggedColor === "white" ? "black" : "white";
  const material = position.pieces.filter(({ piece }) => piece.color === winner && piece.kind !== "king");
  const canMate = material.some(({ piece }) => ["pawn", "rook", "queen"].includes(piece.kind)) ||
    (material.some(({ piece }) => piece.kind === "bishop") && material.some(({ piece }) => piece.kind === "knight")) ||
    material.filter(({ piece }) => piece.kind === "knight").length >= 2 ||
    (() => {
      const bishops = material.filter(({ piece }) => piece.kind === "bishop");
      const squareColors = new Set(bishops.map(({ square }) => ("abcdefgh".indexOf(square.file) + square.rank) % 2));
      return bishops.length >= 2 && squareColors.size > 1;
    })();
  return canMate ? { kind: "win", winner } : { kind: "draw", winner: null };
}
