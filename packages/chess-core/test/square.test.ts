import { describe, expect, it } from "vitest";
import { allSquares, formatSquare, parseSquare } from "../src/index.js";

describe("square coordinates", () => {
  it("parses and formats valid algebraic coordinates", () => {
    expect(parseSquare("a1")).toEqual({ file: "a", rank: 1 });
    expect(parseSquare("h8")).toEqual({ file: "h", rank: 8 });
    expect(formatSquare({ file: "e", rank: 4 })).toBe("e4");
  });

  it("rejects malformed and out-of-board coordinates", () => {
    for (const value of ["", "a0", "i1", "e9", "E4", " e4", "aa1"]) {
      expect(parseSquare(value)).toBeNull();
    }
  });

  it("enumerates each board square exactly once", () => {
    const squares = allSquares();
    expect(squares).toHaveLength(64);
    expect(new Set(squares.map(formatSquare)).size).toBe(64);
    expect(formatSquare(squares[0]!)).toBe("a1");
    expect(formatSquare(squares[63]!)).toBe("h8");
  });
});
