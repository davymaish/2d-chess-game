import { describe, expect, it } from "vitest";
import { createInitialPosition, createPosition, parseSquare } from "@2d-chess/chess-core";
import {
  createChessClock,
  formatClockTime,
  getTimeoutOutcome,
  pauseClock,
  startClock,
  switchClockSide,
  tickClock,
} from "./clock.js";
import type { PieceOnSquare } from "@2d-chess/chess-core";

const placement = (square: string, color: "white" | "black", kind: PieceOnSquare["piece"]["kind"]): PieceOnSquare => ({
  square: parseSquare(square)!,
  piece: { color, kind },
});
const position = (pieces: readonly PieceOnSquare[]) => {
  const result = createPosition({ pieces, activeColor: "white" });
  if (!result.ok) throw new Error(result.errors.map(({ message }) => message).join("; "));
  return result.position;
};

describe("chess clock", () => {
  it("creates configured presets and formats remaining time by rounding up", () => {
    expect(createChessClock("bullet-1-0").whiteMilliseconds).toBe(60_000);
    expect(createChessClock("rapid-15-10").incrementMilliseconds).toBe(10_000);
    expect(formatClockTime(59_001)).toBe("1:00");
    expect(formatClockTime(0)).toBe("0:00");
  });

  it("uses injected timestamps for ticking, pause, and resume without wall-clock waits", () => {
    const started = startClock(createChessClock("bullet-1-0"), 10_000);
    const paused = pauseClock(started, 11_250);
    expect(paused.whiteMilliseconds).toBe(58_750);
    expect(paused.running).toBe(false);
    expect(paused.lastTickAt).toBeNull();
    const resumed = startClock(paused, 20_000);
    expect(tickClock(resumed, 21_000).whiteMilliseconds).toBe(57_750);
    expect(pauseClock(paused, 99_000)).toBe(paused);
  });

  it("charges elapsed time before switching sides and awards increment once per completed move", () => {
    const running = startClock(createChessClock("blitz-3-2"), 100);
    const switched = switchClockSide(running, "black", 2_100);
    expect(switched.whiteMilliseconds).toBe(180_000);
    expect(switched.activeColor).toBe("black");
    expect(switched.lastTickAt).toBe(2_100);
    const blackSwitch = switchClockSide(switched, "white", 3_100);
    expect(blackSwitch.blackMilliseconds).toBe(181_000);
    expect(blackSwitch.activeColor).toBe("white");
  });

  it("flags at zero, stays stopped, and clamps backward timestamps", () => {
    const running = startClock(createChessClock("bullet-1-0"), 50_000);
    const unchanged = tickClock(running, 49_000);
    expect(unchanged.whiteMilliseconds).toBe(60_000);
    const flagged = tickClock(running, 110_000);
    expect(flagged).toMatchObject({ whiteMilliseconds: 0, running: false, flaggedColor: "white" });
    expect(startClock(flagged, 120_000)).toBe(flagged);
    expect(switchClockSide(flagged, "black", 120_000)).toBe(flagged);
  });

  it("awards a timeout win only when the non-flagged side has V1-compatible mating material", () => {
    expect(getTimeoutOutcome(createInitialPosition(), "white")).toEqual({ kind: "win", winner: "black" });
    const kings = position([placement("a1", "white", "king"), placement("h8", "black", "king")]);
    expect(getTimeoutOutcome(kings, "white")).toEqual({ kind: "draw", winner: null });
    const loneKnight = position([
      placement("a1", "white", "king"), placement("h8", "black", "king"), placement("b8", "black", "knight"),
    ]);
    expect(getTimeoutOutcome(loneKnight, "white")).toEqual({ kind: "draw", winner: null });
  });
});
