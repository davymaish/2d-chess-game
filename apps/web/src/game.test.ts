import { describe, expect, it } from "vitest";
import { createInitialPosition, parseSquare } from "@2d-chess/chess-core";
import { legalIntentsFrom } from "./game.js";

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
});
