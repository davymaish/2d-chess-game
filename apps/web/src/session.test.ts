import { describe, expect, it } from "vitest";
import { formatSquare, parseSquare } from "@2d-chess/chess-core";
import {
  closeReplay,
  createGameSession,
  firstReplayPosition,
  getMoveHistory,
  getReplayState,
  getSessionPosition,
  lastReplayPosition,
  openReplay,
  playSessionMove,
  redoSession,
  seekReplay,
  stepReplay,
  undoSession,
} from "./session.js";

const sq = (value: string) => parseSquare(value)!;
const move = (from: string, to: string) => ({ from: sq(from), to: sq(to) });
const play = (session: ReturnType<typeof createGameSession>, from: string, to: string) => {
  const result = playSessionMove(session, move(from, to));
  if (result.kind !== "accepted") throw new Error(`Move rejected: ${result.reason}`);
  return result.session;
};

describe("game session", () => {
  it("records immutable structured moves and supports undo/redo", () => {
    const initial = createGameSession();
    const afterWhite = play(initial, "e2", "e4");
    const afterBlack = play(afterWhite, "e7", "e5");
    expect(getMoveHistory(afterBlack).map(({ from, to }) => `${formatSquare(from)}-${formatSquare(to)}`))
      .toEqual(["e2-e4", "e7-e5"]);
    expect(formatSquare(getSessionPosition(initial).pieces.find(({ piece }) => piece.kind === "pawn" && piece.color === "white")!.square))
      .toBe("a2");
    const undone = undoSession(afterBlack);
    expect(undone.cursor).toBe(1);
    expect(getMoveHistory(undone)).toHaveLength(1);
    expect(redoSession(undone).cursor).toBe(2);
    expect(undoSession(initial)).toBe(initial);
    expect(redoSession(afterBlack)).toBe(afterBlack);
  });

  it("discards the redo branch when a different move is played after undo", () => {
    const twoPly = play(play(createGameSession(), "e2", "e4"), "e7", "e5");
    const alternate = play(undoSession(twoPly), "c7", "c5");
    expect(getMoveHistory(alternate).map(({ from }) => formatSquare(from))).toEqual(["e2", "c7"]);
    expect(alternate.snapshots).toHaveLength(3);
    expect(redoSession(alternate)).toBe(alternate);
  });

  it("replays from the initial position without changing the live game", () => {
    const live = play(play(createGameSession(), "e2", "e4"), "e7", "e5");
    const replay = openReplay(live);
    expect(getReplayState(replay)).toMatchObject({ index: -1, totalMoves: 2, currentMove: null, atStart: true, atEnd: false });
    expect(getSessionPosition(replay).activeColor).toBe("white");
    const first = stepReplay(replay, "next")!;
    expect(getReplayState(first)).toMatchObject({ index: 0, currentMove: { from: sq("e2"), to: sq("e4") } });
    expect(stepReplay(replay, "previous")).toBeNull();
    const last = lastReplayPosition(replay)!;
    expect(getReplayState(last)).toMatchObject({ index: 1, atEnd: true });
    expect(stepReplay(last, "next")).toBeNull();
    expect(firstReplayPosition(last)!.replayIndex).toBe(-1);
    expect(seekReplay(last, 2)).toBeNull();
    expect(playSessionMove(replay, move("g1", "f3"))).toEqual({ kind: "rejected", reason: "replay-active" });
    expect(getSessionPosition(live).activeColor).toBe("white");
    expect(getSessionPosition(live).pieces.some(({ square }) => formatSquare(square) === "e4")).toBe(true);
    expect(getSessionPosition(closeReplay(last)).activeColor).toBe("white");
  });

  it("returns predictable replay state for an empty game", () => {
    const replay = openReplay(createGameSession());
    expect(getReplayState(replay)).toMatchObject({ index: -1, totalMoves: 0, atStart: true, atEnd: true });
    expect(lastReplayPosition(replay)).not.toBeNull();
    expect(closeReplay(replay).replayIndex).toBeNull();
  });
});
