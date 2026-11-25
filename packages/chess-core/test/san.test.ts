import { describe, expect, it } from "vitest";
import { applyLegalMove, createInitialPosition, formatSAN, parseFEN, parseSquare } from "../src/index.js";
import type { Position, PromotionPieceKind } from "../src/index.js";

function san(position: Position, from: string, to: string, promotion?: PromotionPieceKind): string {
  const intent = promotion
    ? { from: parseSquare(from)!, to: parseSquare(to)!, promotion }
    : { from: parseSquare(from)!, to: parseSquare(to)! };
  const result = applyLegalMove(position, intent);
  if (result.kind !== "accepted") throw new Error(`Expected a legal test move; got ${result.reason}`);
  return formatSAN(position, result.move);
}

describe("SAN formatting", () => {
  it("formats pawn and piece moves from the starting position", () => {
    const initial = createInitialPosition();
    expect(san(initial, "e2", "e4")).toBe("e4");
    expect(san(initial, "g1", "f3")).toBe("Nf3");
  });

  it("formats captures and legal-origin disambiguation", () => {
    expect(san(parseFEN("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"), "e4", "d5")).toBe("exd5");
    const knights = parseFEN("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1");
    expect(san(knights, "b1", "d2")).toBe("Nbd2");
    expect(san(knights, "f3", "d2")).toBe("Nfd2");
  });

  it("uses standard castling notation and marks check", () => {
    expect(san(parseFEN("4k3/8/8/8/8/8/8/4K2R w K - 0 1"), "e1", "g1")).toBe("O-O");
    expect(san(parseFEN("4k3/8/8/8/8/8/5R2/K7 w - - 0 1"), "f2", "e2")).toBe("Re2+");
  });
});
