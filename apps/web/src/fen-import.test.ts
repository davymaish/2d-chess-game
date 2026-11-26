import { describe, expect, it, vi } from "vitest";
import { parseFEN, parseSquare } from "@2d-chess/chess-core";
import { createGameSession, playSessionMove } from "./session.js";
import {
  FEN_REPLACEMENT_CONFIRMATION,
  hasFenReplacementProgress,
  prepareFenImport,
} from "./fen-import.js";

const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const atNinetyNine = "4k3/8/8/8/8/8/8/4K2R w - - 99 1";
const atOneHundred = "4k3/8/8/8/8/8/8/4K2R w - - 100 1";
const noConfirmation = () => true;

describe("FEN import safeguards", () => {
  it("allows a playable position just below the fifty-move threshold", () => {
    const decision = prepareFenImport(atNinetyNine, false, noConfirmation);
    expect(decision.kind).toBe("ready");
    if (decision.kind === "ready") expect(decision.position.halfmoveClock).toBe(99);
  });

  it("rejects a position at the fifty-move threshold without offering replacement", () => {
    const confirm = vi.fn(() => true);
    const decision = prepareFenImport(atOneHundred, true, confirm);
    expect(decision).toEqual({
      kind: "invalid",
      message: expect.stringMatching(/fifty-move draw threshold/i),
    });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("requests confirmation before replacing existing move, clock, or promotion progress", () => {
    const initial = createGameSession();
    expect(hasFenReplacementProgress(initial, false, false)).toBe(false);
    expect(hasFenReplacementProgress(initial, true, false)).toBe(true);
    expect(hasFenReplacementProgress(initial, false, true)).toBe(true);

    const played = playSessionMove(initial, { from: parseSquare("e2")!, to: parseSquare("e4")! });
    expect(played.kind).toBe("accepted");
    if (played.kind === "accepted") expect(hasFenReplacementProgress(played.session, false, false)).toBe(true);

    const importedRoot = createGameSession(parseFEN("4k3/8/8/8/8/8/8/4K2R w - - 0 1"));
    expect(hasFenReplacementProgress(importedRoot, false, false)).toBe(true);
  });

  it("leaves replacement cancelled when confirmation is declined", () => {
    const confirm = vi.fn(() => false);
    expect(prepareFenImport(initialFen, true, confirm)).toEqual({ kind: "cancelled" });
    expect(confirm).toHaveBeenCalledOnce();
    expect(FEN_REPLACEMENT_CONFIRMATION).toMatch(/replace the current position, move history, and clock state/i);
  });

  it("returns parse failures without asking for confirmation", () => {
    const confirm = vi.fn(() => true);
    expect(prepareFenImport("not a FEN", true, confirm).kind).toBe("invalid");
    expect(confirm).not.toHaveBeenCalled();
  });
});
