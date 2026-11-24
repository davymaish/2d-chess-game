import { describe, expect, it } from "vitest";
import {
  createInitialPosition,
  createPosition,
  getGameStatus,
  parseSquare,
} from "../src/index.js";
import type { Color, PieceKind, PieceOnSquare, Position } from "../src/index.js";

function placement(at: string, color: Color, kind: PieceKind): PieceOnSquare {
  const parsed = parseSquare(at);
  if (!parsed) throw new Error(`Invalid test square: ${at}`);
  return { square: parsed, piece: { color, kind } };
}

function position(pieces: readonly PieceOnSquare[], activeColor: Color): Position {
  const result = createPosition({ pieces, activeColor });
  if (!result.ok) throw new Error(`Invalid test position: ${result.errors.map(({ code }) => code).join(", ")}`);
  return result.position;
}

describe("game status", () => {
  it("classifies a position with legal moves and no check as active", () => {
    expect(getGameStatus(createInitialPosition())).toEqual({ kind: "active" });
  });

  it("distinguishes check from checkmate when the checked king can escape", () => {
    const checked = position(
      [
        placement("a1", "white", "king"),
        placement("h8", "black", "king"),
        placement("h1", "white", "rook"),
      ],
      "black",
    );
    expect(getGameStatus(checked)).toEqual({ kind: "check" });
  });

  it("identifies checkmate and reports the winning side", () => {
    const checkmate = position(
      [
        placement("f6", "white", "king"),
        placement("g7", "white", "queen"),
        placement("h8", "black", "king"),
      ],
      "black",
    );
    expect(getGameStatus(checkmate)).toEqual({ kind: "checkmate", winner: "white" });
  });

  it("distinguishes stalemate from check when the side to move has no legal moves", () => {
    const stalemate = position(
      [
        placement("f6", "white", "king"),
        placement("f7", "white", "queen"),
        placement("h8", "black", "king"),
      ],
      "black",
    );
    expect(getGameStatus(stalemate)).toEqual({ kind: "stalemate" });
  });

  it("returns validation errors instead of classifying a malformed position", () => {
    const malformed = { ...createInitialPosition(), pieces: [] } as unknown as Position;
    const status = getGameStatus(malformed);
    expect(status.kind).toBe("invalid-position");
    if (status.kind !== "invalid-position") throw new Error("Expected invalid position");
    expect(status.errors.map(({ code }) => code)).toContain("king-count");
  });
});
