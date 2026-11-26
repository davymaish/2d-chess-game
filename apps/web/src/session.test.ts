import { describe, expect, it } from "vitest";
import { formatSquare, parseFEN, parseSquare } from "@2d-chess/chess-core";
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

  it("retains deep immutable position and move values in session snapshots", () => {
    const session = play(createGameSession(), "e2", "e4");
    const snapshot = session.snapshots[1]!;
    const record = getMoveHistory(session)[0]!;
    expect(Object.isFrozen(session.snapshots)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.position)).toBe(true);
    expect(Object.isFrozen(snapshot.position.pieces)).toBe(true);
    expect(Object.isFrozen(snapshot.position.pieces[0]!.square)).toBe(true);
    expect(Object.isFrozen(snapshot.position.pieces[0]!.piece)).toBe(true);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.from)).toBe(true);
    expect(Object.isFrozen(record.piece)).toBe(true);
  });

  it("restores castling, en-passant, and promotion state across undo and redo", () => {
    const castleStart = createGameSession(parseFEN("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"));
    const castled = play(castleStart, "e1", "g1");
    expect(getSessionPosition(castled).castlingRights).toEqual(["black-king-side", "black-queen-side"]);
    expect(getSessionPosition(undoSession(castled))).toEqual(getSessionPosition(castleStart));
    expect(getSessionPosition(redoSession(undoSession(castled)))).toEqual(getSessionPosition(castled));

    const epStart = createGameSession(parseFEN("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2"));
    const enPassant = play(epStart, "e5", "d6");
    expect(getSessionPosition(enPassant).pieces.some(({ square }) => formatSquare(square) === "d5")).toBe(false);
    expect(getSessionPosition(undoSession(enPassant))).toEqual(getSessionPosition(epStart));
    expect(getSessionPosition(redoSession(undoSession(enPassant)))).toEqual(getSessionPosition(enPassant));

    const promotionStart = createGameSession(parseFEN("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"));
    const promotion = playSessionMove(promotionStart, { from: sq("a7"), to: sq("a8"), promotion: "knight" });
    expect(promotion.kind).toBe("accepted");
    if (promotion.kind === "accepted") {
      expect(getSessionPosition(promotion.session).pieces.find(({ square }) => formatSquare(square) === "a8")?.piece.kind).toBe("knight");
      expect(getSessionPosition(undoSession(promotion.session))).toEqual(getSessionPosition(promotionStart));
      expect(getSessionPosition(redoSession(undoSession(promotion.session)))).toEqual(getSessionPosition(promotion.session));
    }
  });
});
