import { describe, expect, it } from "vitest";
import { formatSquare, parseSquare } from "@2d-chess/chess-core";
import { arrowKeySquare, orientedBoardSquares } from "./orientation.js";

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

  it("moves focus by visual arrow direction for either orientation and stops at edges", () => {
    const square = (name: string) => parseSquare(name)!;
    expect(formatSquare(arrowKeySquare(square("e4"), "ArrowLeft", "white")!)).toBe("d4");
    expect(formatSquare(arrowKeySquare(square("e4"), "ArrowUp", "white")!)).toBe("e5");
    expect(formatSquare(arrowKeySquare(square("e4"), "ArrowLeft", "black")!)).toBe("f4");
    expect(formatSquare(arrowKeySquare(square("e4"), "ArrowUp", "black")!)).toBe("e3");
    expect(arrowKeySquare(square("a8"), "ArrowLeft", "white")).toBeNull();
    expect(arrowKeySquare(square("a1"), "ArrowDown", "white")).toBeNull();
    expect(arrowKeySquare(square("a1"), "ArrowRight", "black")).toBeNull();
  });
});
