import { describe, expect, it } from "vitest";
import { parseFEN, parsePGN, parseSquare } from "@2d-chess/chess-core";
import { createGameSession, playSessionMove, undoSession } from "./session.js";
import { serializeSessionPGN } from "./pgn-session.js";

function play(session: ReturnType<typeof createGameSession>, from: string, to: string) {
  const result = playSessionMove(session, { from: parseSquare(from)!, to: parseSquare(to)! });
  if (result.kind !== "accepted") throw new Error(`Expected accepted move; got ${result.reason}`);
  return result.session;
}

describe("session PGN adapter", () => {
  it("exports SAN moves from the active session timeline", () => {
    const session = play(play(createGameSession(), "e2", "e4"), "e7", "e5");
    const text = serializeSessionPGN(session, "1-0");
    expect(text).toContain("[Result \"1-0\"]");
    expect(text.endsWith("\n\n1. e4 e5 1-0")).toBe(true);
  });

  it("exports only moves through the active undo cursor", () => {
    const session = play(play(createGameSession(), "e2", "e4"), "e7", "e5");
    expect(serializeSessionPGN(undoSession(session))).toContain("\n\n1. e4 *");
  });

  it("includes FEN setup tags when the session started from an imported position", () => {
    const initial = parseFEN("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    const text = serializeSessionPGN(createGameSession(initial));
    expect(text).toContain('[SetUp "1"]');
    expect(text).toContain('[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]');
    expect(parsePGN(text).startingPosition.pieces).toEqual(initial.pieces);
  });
});
