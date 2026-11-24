import { describe, expect, it } from "vitest";
import {
  createInitialPosition,
  createPosition,
  formatSquare,
  parseSquare,
  pieceAt,
} from "../src/index.js";
import type { Color, File, PieceKind, PieceOnSquare, PositionInput, Rank } from "../src/index.js";

function kingsOnly(): PositionInput {
  return {
    pieces: [
      { square: parseSquare("e1")!, piece: { color: "white", kind: "king" } },
      { square: parseSquare("e8")!, piece: { color: "black", kind: "king" } },
    ],
    activeColor: "white",
  };
}

function expectInvalid(input: PositionInput): readonly string[] {
  const result = createPosition(input);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors.map(({ code }) => code);
}

describe("position model", () => {
  it("creates the standard initial layout and metadata", () => {
    const position = createInitialPosition();

    expect(position.pieces).toHaveLength(32);
    expect(position.activeColor).toBe("white");
    expect(position.castlingRights).toEqual([
      "white-king-side",
      "white-queen-side",
      "black-king-side",
      "black-queen-side",
    ]);
    expect(position.enPassantTarget).toBeNull();
    expect(position.halfmoveClock).toBe(0);
    expect(position.fullmoveNumber).toBe(1);
    expect(pieceAt(position, parseSquare("e1")!)).toEqual({ color: "white", kind: "king" });
    expect(pieceAt(position, parseSquare("d8")!)).toEqual({ color: "black", kind: "queen" });
    expect(pieceAt(position, parseSquare("a2")!)).toEqual({ color: "white", kind: "pawn" });
    expect(pieceAt(position, parseSquare("e4")!)).toBeNull();
  });

  it("rejects invalid square coordinates from untrusted runtime input", () => {
    const input = kingsOnly() as { pieces: PieceOnSquare[]; activeColor: "white" };
    input.pieces.push({
      square: { file: "z", rank: 3 } as unknown as PieceOnSquare["square"],
      piece: { color: "white", kind: "knight" },
    });
    expect(expectInvalid(input)).toContain("invalid-square");
  });

  it("rejects duplicate occupancy", () => {
    const input = kingsOnly();
    const result = createPosition({
      ...input,
      pieces: [
        ...input.pieces,
        { square: parseSquare("e1")!, piece: { color: "white", kind: "rook" } },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.map(({ code }) => code)).toContain("duplicate-square");
  });

  it("requires exactly one king of each color", () => {
    const errors = expectInvalid({
      pieces: [{ square: parseSquare("e1")!, piece: { color: "white", kind: "king" } }],
      activeColor: "white",
    });
    expect(errors).toContain("king-count");
  });

  it("rejects pawns on either back rank", () => {
    const input = kingsOnly();
    const result = createPosition({
      ...input,
      pieces: [
        ...input.pieces,
        { square: parseSquare("a8")!, piece: { color: "white", kind: "pawn" } },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.map(({ code }) => code)).toContain("pawn-on-back-rank");
  });

  it("preserves valid metadata and supplies defaults", () => {
    const input = kingsOnly();
    const result = createPosition({
      ...input,
      activeColor: "black",
      castlingRights: ["black-queen-side"],
      enPassantTarget: parseSquare("e3"),
      halfmoveClock: 7,
      fullmoveNumber: 12,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.position.activeColor).toBe("black");
    expect(result.position.castlingRights).toEqual(["black-queen-side"]);
    expect(result.position.enPassantTarget).toEqual({ file: "e", rank: 3 });
    expect(result.position.halfmoveClock).toBe(7);
    expect(result.position.fullmoveNumber).toBe(12);

    const defaults = createPosition(input);
    expect(defaults.ok).toBe(true);
    if (defaults.ok) {
      expect(defaults.position.castlingRights).toEqual([]);
      expect(defaults.position.enPassantTarget).toBeNull();
      expect(defaults.position.halfmoveClock).toBe(0);
      expect(defaults.position.fullmoveNumber).toBe(1);
    }
  });

  it("rejects invalid clock metadata", () => {
    const input = kingsOnly();
    const errors = expectInvalid({ ...input, halfmoveClock: -1 });
    expect(errors).toContain("invalid-halfmove-clock");
    expect(expectInvalid({ ...input, fullmoveNumber: 0 })).toContain("invalid-fullmove-number");
  });

  it("defensively copies and freezes nested position data", () => {
    const mutableSquare = { file: "e" as File, rank: 1 as Rank };
    const mutablePiece = { color: "white" as Color, kind: "king" as PieceKind };
    const pieces: PieceOnSquare[] = [
      { square: mutableSquare, piece: mutablePiece },
      { square: { file: "e", rank: 8 }, piece: { color: "black", kind: "king" } },
    ];
    const input = { pieces, activeColor: "white" as const };
    const result = createPosition(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    mutableSquare.file = "a";
    mutablePiece.kind = "queen";
    pieces.pop();
    expect(formatSquare(result.position.pieces[0]!.square)).toBe("e1");
    expect(result.position.pieces[0]!.piece.kind).toBe("king");
    expect(result.position.pieces).toHaveLength(2);
    expect(Object.isFrozen(result.position)).toBe(true);
    expect(Object.isFrozen(result.position.pieces)).toBe(true);
    expect(Object.isFrozen(result.position.pieces[0]!.square)).toBe(true);
    expect(Object.isFrozen(result.position.pieces[0]!.piece)).toBe(true);
  });
});
