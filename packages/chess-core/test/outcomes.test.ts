import { describe, expect, it } from "vitest";
import {
  createInitialPosition,
  createPosition,
  getGameStatus,
  parseSquare,
} from "../src/index.js";
import type { CastlingRight, Color, PieceKind, PieceOnSquare, Position } from "../src/index.js";

type PositionOptions = {
  readonly castlingRights?: readonly CastlingRight[];
  readonly enPassantTarget?: string | null;
  readonly halfmoveClock?: number;
  readonly fullmoveNumber?: number;
};

function placement(at: string, color: Color, kind: PieceKind): PieceOnSquare {
  const parsed = parseSquare(at);
  if (!parsed) throw new Error(`Invalid test square: ${at}`);
  return { square: parsed, piece: { color, kind } };
}

function position(
  pieces: readonly PieceOnSquare[],
  activeColor: Color,
  options: PositionOptions = {},
): Position {
  const parsedTarget = options.enPassantTarget === undefined || options.enPassantTarget === null
    ? null
    : parseSquare(options.enPassantTarget);
  if (options.enPassantTarget !== undefined && options.enPassantTarget !== null && !parsedTarget) {
    throw new Error(`Invalid test en-passant square: ${options.enPassantTarget}`);
  }
  const result = createPosition({
    pieces,
    activeColor,
    ...(options.castlingRights === undefined ? {} : { castlingRights: options.castlingRights }),
    enPassantTarget: parsedTarget,
    ...(options.halfmoveClock === undefined ? {} : { halfmoveClock: options.halfmoveClock }),
    ...(options.fullmoveNumber === undefined ? {} : { fullmoveNumber: options.fullmoveNumber }),
  });
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

  it("detects insufficient material only for supported dead-position cases", () => {
    const kingsOnly = position(
      [placement("a1", "white", "king"), placement("h8", "black", "king")],
      "white",
    );
    expect(getGameStatus(kingsOnly)).toEqual({ kind: "draw", reason: "insufficient-material" });

    const sameColorBishops = position(
      [
        placement("a1", "white", "king"),
        placement("h8", "black", "king"),
        placement("b1", "white", "bishop"),
        placement("d3", "black", "bishop"),
      ],
      "white",
    );
    expect(getGameStatus(sameColorBishops)).toEqual({ kind: "draw", reason: "insufficient-material" });

    const oppositeColorBishops = position(
      [
        placement("a1", "white", "king"),
        placement("h8", "black", "king"),
        placement("b1", "white", "bishop"),
        placement("d2", "black", "bishop"),
      ],
      "white",
    );
    expect(getGameStatus(oppositeColorBishops).kind).toBe("active");

    const twoKnights = position(
      [
        placement("a1", "white", "king"),
        placement("h8", "black", "king"),
        placement("b1", "white", "knight"),
        placement("c3", "white", "knight"),
      ],
      "white",
    );
    expect(getGameStatus(twoKnights).kind).toBe("active");
  });

  it("applies the 50-move draw at 100 half-moves but not before it", () => {
    const pieces = [
      placement("a1", "white", "king"),
      placement("h8", "black", "king"),
      placement("a2", "white", "rook"),
    ];
    expect(getGameStatus(position(pieces, "white", { halfmoveClock: 99 })).kind).toBe("active");
    expect(getGameStatus(position(pieces, "white", { halfmoveClock: 100 }))).toEqual({
      kind: "draw",
      reason: "fifty-move",
    });

    const checkmate = position(
      [
        placement("f6", "white", "king"),
        placement("g7", "white", "queen"),
        placement("h8", "black", "king"),
      ],
      "black",
      { halfmoveClock: 100 },
    );
    expect(getGameStatus(checkmate)).toEqual({ kind: "checkmate", winner: "white" });
  });

  it("counts threefold repetition by board, side to move, and castling rights", () => {
    const pieces = [
      placement("e1", "white", "king"),
      placement("e8", "black", "king"),
      placement("a2", "white", "rook"),
    ];
    const current = position(pieces, "white", { halfmoveClock: 18, fullmoveNumber: 9 });
    const sameWithDifferentCounters = position(pieces, "white", { halfmoveClock: 4, fullmoveNumber: 3 });
    expect(getGameStatus(current, [sameWithDifferentCounters]).kind).toBe("active");
    expect(getGameStatus(current, [sameWithDifferentCounters, sameWithDifferentCounters])).toEqual({
      kind: "draw",
      reason: "threefold-repetition",
    });

    const oppositeTurn = position(pieces, "black");
    expect(getGameStatus(current, [sameWithDifferentCounters, oppositeTurn]).kind).toBe("active");

    const changedRights = position(pieces, "white", { castlingRights: ["white-king-side"] });
    expect(getGameStatus(current, [sameWithDifferentCounters, changedRights]).kind).toBe("active");
  });

  it("includes en-passant identity only when a legal capture is available", () => {
    const capturablePieces = [
      placement("a1", "white", "king"),
      placement("h8", "black", "king"),
      placement("e5", "white", "pawn"),
      placement("d5", "black", "pawn"),
    ];
    const withCapture = position(capturablePieces, "white", { enPassantTarget: "d6" });
    const withoutTarget = position(capturablePieces, "white");
    expect(getGameStatus(withCapture, [withoutTarget, withoutTarget]).kind).toBe("active");

    const noCapturingPawn = [
      placement("a1", "white", "king"),
      placement("h8", "black", "king"),
      placement("d5", "black", "pawn"),
    ];
    const spuriousTarget = position(noCapturingPawn, "white", { enPassantTarget: "d6" });
    const noTarget = position(noCapturingPawn, "white");
    expect(getGameStatus(spuriousTarget, [noTarget, noTarget])).toEqual({
      kind: "draw",
      reason: "threefold-repetition",
    });
  });
});
