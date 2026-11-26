import { describe, expect, it } from "vitest";
import { createInitialPosition, parseSquare } from "@2d-chess/chess-core";
import { legalIntentsFrom } from "./game.js";
import { createGameSession, getSessionPosition, openReplay, playSessionMove, seekReplay } from "./session.js";

const square = (name: string) => parseSquare(name)!;

describe("legalIntentsFrom", () => {
  it("returns only legal opening moves for the selected active-side piece", () => {
    const position = createInitialPosition();
    expect(legalIntentsFrom(position, square("e2")).map(({ to }) => `${to.file}${to.rank}`).sort())
      .toEqual(["e3", "e4"]);
    expect(legalIntentsFrom(position, square("e7"))).toEqual([]);
  });

  it("offers all four promotion choices only when a pawn can promote", () => {
    const position = {
      pieces: [
        { square: square("a1"), piece: { color: "white" as const, kind: "king" as const } },
        { square: square("h8"), piece: { color: "black" as const, kind: "king" as const } },
        { square: square("e7"), piece: { color: "white" as const, kind: "pawn" as const } },
      ],
      activeColor: "white" as const,
      castlingRights: [],
      enPassantTarget: null,
      halfmoveClock: 0,
      fullmoveNumber: 1,
    };
    expect(legalIntentsFrom(position, square("e7")).map((move) => move.promotion).sort())
      .toEqual(["bishop", "knight", "queen", "rook"]);
  });

  it("provides legal-move hints for the replayed side without changing the replay session", () => {
    const firstMove = playSessionMove(createGameSession(), { from: square("e2"), to: square("e4") });
    expect(firstMove.kind).toBe("accepted");
    if (firstMove.kind !== "accepted") throw new Error("The opening move should be accepted.");

    const replay = seekReplay(openReplay(firstMove.session), 0);
    expect(replay).not.toBeNull();
    if (!replay) throw new Error("The first move should be available in replay.");

    const replayPosition = getSessionPosition(replay);
    expect(legalIntentsFrom(replayPosition, square("e7")).map(({ to }) => `${to.file}${to.rank}`).sort())
      .toEqual(["e5", "e6"]);

    const beforeHintAttempt = JSON.stringify(replay);
    expect(playSessionMove(replay, { from: square("e7"), to: square("e5") }))
      .toEqual({ kind: "rejected", reason: "replay-active" });
    expect(JSON.stringify(replay)).toBe(beforeHintAttempt);
    expect(getSessionPosition(replay)).toBe(replayPosition);
  });
});
