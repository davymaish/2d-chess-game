import { describe, expect, it } from "vitest";
import { formatSquare } from "@2d-chess/chess-core";
import { orientedBoardSquares } from "./orientation.js";

describe("orientedBoardSquares", () => {
  it("renders the standard white-bottom ordering", () => {
    const squares = orientedBoardSquares("white").map(formatSquare);
    expect(squares).toHaveLength(64);
    expect(squares.slice(0, 8)).toEqual(["a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"]);
    expect(squares.slice(-8)).toEqual(["a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1"]);
  });

  it("flips ranks and files while retaining each square exactly once", () => {
    const squares = orientedBoardSquares("black").map(formatSquare);
    expect(squares).toHaveLength(64);
    expect(squares.slice(0, 8)).toEqual(["h1", "g1", "f1", "e1", "d1", "c1", "b1", "a1"]);
    expect(squares.slice(-8)).toEqual(["h8", "g8", "f8", "e8", "d8", "c8", "b8", "a8"]);
    expect(new Set(squares).size).toBe(64);
  });
});
