import { describe, expect, it } from "vitest";
import { createInitialPosition, parseFEN, serializeFEN } from "../src/index.js";

describe("FEN import and export", () => {
  it("round-trips the initial position using all six fields", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(serializeFEN(createInitialPosition())).toBe(fen);
    expect(serializeFEN(parseFEN(fen))).toBe(fen);
  });

  it("preserves active color, castling rights, en-passant target, and move counters", () => {
    const fen = "r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 17 42";
    expect(serializeFEN(parseFEN(fen))).toBe(fen);
  });

  it("accepts legal promotion material above the normal queen count", () => {
    const fen = "4k3/QQ6/8/8/8/8/8/4K3 w - - 0 1";
    expect(serializeFEN(parseFEN(fen))).toBe(fen);
  });

  it.each([
    "8/8/8/8/8/8/8/8 w - - 0 1", // missing kings
    "4k3/8/8/8/8/8/8/4K3 w - - 0", // missing field
    "4k3/8/8/8/8/8/8/4K3 x - - 0 1", // invalid active color
    "4k3/8/8/8/8/8/8/4K3 w KK - 0 1", // duplicate castling right
    "4k3/8/8/8/8/8/8/4K3 w K - 0 1", // castling right without rook
    "4k3/8/8/8/8/8/8/4K3 w - e3 0 1", // wrong en-passant rank
    "4k3/8/8/8/8/8/8/4K3 w - - -1 1", // negative counter
    "4k3/8/8/8/8/8/8/4K3 w - - 0 0", // invalid fullmove number
    "4k3/8/8/8/8/8/8/44K3 w - - 0 1", // adjacent empty counts
    "4k3/8/8/8/8/8/4R3/K7 w - - 0 1", // last mover's king left in check
    "4k3/8/8/8/8/8/8/P3K3 w - - 0 1", // pawn on back rank
    "4k3/8/8/8/8/8/PPPPPPPPP/4K3 w - - 0 1", // too many pawns
  ])("rejects malformed or structurally impossible FEN: %s", (fen) => {
    expect(() => parseFEN(fen)).toThrow(TypeError);
  });

  it("rejects an en-passant target without its corresponding double-moved pawn", () => {
    expect(() => parseFEN("4k3/8/8/8/8/8/8/4K3 w - e6 0 1")).toThrow(/corresponding double-moved pawn/);
  });
});
