import { describe, expect, it } from "vitest";
import {
  applyPseudoLegalMove,
  createPosition,
  parseSquare,
  pieceAt,
} from "../src/index.js";
import type { CastlingRight, Color, MoveResult, PieceKind, PieceOnSquare, Position, PromotionPieceKind } from "../src/index.js";

type BoardOptions = {
  readonly activeColor?: Color;
  readonly whiteKing?: string;
  readonly blackKing?: string;
  readonly castlingRights?: readonly CastlingRight[];
  readonly enPassantTarget?: string | null;
  readonly halfmoveClock?: number;
  readonly fullmoveNumber?: number;
};

function square(value: string) {
  const parsed = parseSquare(value);
  if (!parsed) throw new Error(`Invalid test square: ${value}`);
  return parsed;
}

function placement(at: string, color: Color, kind: PieceKind): PieceOnSquare {
  return { square: square(at), piece: { color, kind } };
}

function board(extras: readonly PieceOnSquare[] = [], options: BoardOptions = {}): Position {
  const result = createPosition({
    pieces: [
      placement(options.whiteKing ?? "a1", "white", "king"),
      placement(options.blackKing ?? "h8", "black", "king"),
      ...extras,
    ],
    activeColor: options.activeColor ?? "white",
    ...(options.castlingRights === undefined ? {} : { castlingRights: options.castlingRights }),
    enPassantTarget: options.enPassantTarget === undefined
      ? null
      : options.enPassantTarget === null
        ? null
        : square(options.enPassantTarget),
    ...(options.halfmoveClock === undefined ? {} : { halfmoveClock: options.halfmoveClock }),
    ...(options.fullmoveNumber === undefined ? {} : { fullmoveNumber: options.fullmoveNumber }),
  });
  if (!result.ok) throw new Error(`Invalid test position: ${result.errors.map(({ code }) => code).join(", ")}`);
  return result.position;
}

function move(
  position: Position,
  from: string,
  to: string,
  promotion?: PromotionPieceKind,
): MoveResult {
  const intent = promotion
    ? { from: square(from), to: square(to), promotion }
    : { from: square(from), to: square(to) };
  return applyPseudoLegalMove(position, intent);
}

function expectAccepted(result: MoveResult): Extract<MoveResult, { kind: "accepted" }> {
  expect(result.kind).toBe("accepted");
  if (result.kind !== "accepted") throw new Error(`Expected accepted move, got ${result.reason}`);
  return result;
}

function expectRejected(result: MoveResult, reason: string): void {
  expect(result).toEqual({ kind: "rejected", reason });
}

describe("pseudo-legal move application", () => {
  it("moves a pawn one or two squares and records the en-passant target after a double push", () => {
    const result = expectAccepted(move(board([placement("e2", "white", "pawn")]), "e2", "e4"));
    expect(pieceAt(result.position, square("e4"))).toEqual({ color: "white", kind: "pawn" });
    expect(result.position.enPassantTarget).toEqual(square("e3"));
    expect(result.position.activeColor).toBe("black");
    expect(result.position.halfmoveClock).toBe(0);
    expect(result.position.fullmoveNumber).toBe(1);
    expect(result.move.from).toEqual(square("e2"));
    expect(result.move.to).toEqual(square("e4"));
  });

  it("requires a clear pawn path and permits diagonal capture only onto an enemy", () => {
    const blocked = board([
      placement("e2", "white", "pawn"),
      placement("e3", "white", "knight"),
    ]);
    expectRejected(move(blocked, "e2", "e4"), "illegal-move");

    const capture = board([
      placement("e2", "white", "pawn"),
      placement("f3", "black", "knight"),
    ]);
    const accepted = expectAccepted(move(capture, "e2", "f3"));
    expect(accepted.move.capturedPiece).toEqual({ color: "black", kind: "knight" });
    expect(pieceAt(accepted.position, square("f3"))).toEqual({ color: "white", kind: "pawn" });
    expect(pieceAt(accepted.position, square("e2"))).toBeNull();
    expect(accepted.position.halfmoveClock).toBe(0);

    const emptyDiagonal = board([placement("e2", "white", "pawn")]);
    expectRejected(move(emptyDiagonal, "e2", "f3"), "illegal-move");
  });

  it.each([
    ["rook", "a4", "a7"],
    ["bishop", "c1", "f4"],
    ["queen", "d4", "h4"],
    ["knight", "b1", "c3"],
    ["king", "d4", "e5"],
  ] as const)("applies ordinary %s movement geometry", (kind, from, to) => {
    const position = kind === "king"
      ? board([], { whiteKing: from })
      : board([placement(from, "white", kind)]);
    const result = expectAccepted(move(position, from, to));
    expect(pieceAt(result.position, square(to))).toEqual({ color: "white", kind });
  });

  it("blocks sliding pieces but lets knights jump over occupied squares", () => {
    const blockedRook = board(
      [
        placement("a1", "white", "rook"),
        placement("a3", "white", "pawn"),
        placement("a5", "black", "pawn"),
      ],
      { whiteKing: "h1" },
    );
    expectRejected(move(blockedRook, "a1", "a5"), "illegal-move");

    const knightPosition = board([
      placement("b1", "white", "knight"),
      placement("b2", "white", "pawn"),
    ]);
    expectAccepted(move(knightPosition, "b1", "c3"));
  });

  it("rejects wrong-turn moves, empty origins, own-piece captures, and king captures", () => {
    const wrongTurn = board([placement("a4", "white", "rook")], { activeColor: "black" });
    expectRejected(move(wrongTurn, "a4", "a5"), "wrong-turn");
    expectRejected(move(wrongTurn, "b4", "b5"), "empty-origin");

    const ownTarget = board([
      placement("a4", "white", "rook"),
      placement("a5", "white", "pawn"),
    ]);
    expectRejected(move(ownTarget, "a4", "a5"), "illegal-move");

    const kingTarget = board([placement("h4", "white", "rook")]);
    expectRejected(move(kingTarget, "h4", "h8"), "illegal-move");
  });

  it("updates turns, move counters, and the halfmove clock", () => {
    const start = board(
      [placement("b1", "white", "knight"), placement("g8", "black", "knight")],
      { halfmoveClock: 4, fullmoveNumber: 3 },
    );
    const afterWhite = expectAccepted(move(start, "b1", "c3")).position;
    expect(afterWhite.activeColor).toBe("black");
    expect(afterWhite.halfmoveClock).toBe(5);
    expect(afterWhite.fullmoveNumber).toBe(3);

    const afterBlack = expectAccepted(move(afterWhite, "g8", "f6")).position;
    expect(afterBlack.activeColor).toBe("white");
    expect(afterBlack.halfmoveClock).toBe(6);
    expect(afterBlack.fullmoveNumber).toBe(4);
  });

  it("clears castling rights when a king or home rook moves or a home rook is captured", () => {
    const rights: readonly CastlingRight[] = [
      "white-king-side",
      "white-queen-side",
      "black-king-side",
      "black-queen-side",
    ];
    const rookMove = board([placement("a1", "white", "rook")], {
      whiteKing: "e1",
      blackKing: "e8",
      castlingRights: rights,
    });
    expect(expectAccepted(move(rookMove, "a1", "a2")).position.castlingRights).toEqual([
      "white-king-side",
      "black-king-side",
      "black-queen-side",
    ]);

    const kingMove = board([], { whiteKing: "e1", blackKing: "e8", castlingRights: rights });
    expect(expectAccepted(move(kingMove, "e1", "e2")).position.castlingRights).toEqual([
      "black-king-side",
      "black-queen-side",
    ]);

    const rookCapture = board(
      [placement("h1", "white", "queen"), placement("h8", "black", "rook")],
      { whiteKing: "e1", blackKing: "e8", castlingRights: rights },
    );
    expect(expectAccepted(move(rookCapture, "h1", "h8")).position.castlingRights).toEqual([
      "white-king-side",
      "white-queen-side",
      "black-queen-side",
    ]);
  });

  it("requires an explicit promotion choice and applies the selected piece", () => {
    const nearPromotion = board([placement("g7", "white", "pawn")]);
    expectRejected(move(nearPromotion, "g7", "g8"), "promotion-required");
    const promoted = expectAccepted(move(nearPromotion, "g7", "g8", "queen"));
    expect(pieceAt(promoted.position, square("g8"))).toEqual({ color: "white", kind: "queen" });
    expect(promoted.move.promotion).toBe("queen");
    expect(promoted.position.halfmoveClock).toBe(0);

    const invalidPromotion = applyPseudoLegalMove(nearPromotion, {
      from: square("g7"),
      to: square("g8"),
      promotion: "king" as PromotionPieceKind,
    });
    expectRejected(invalidPromotion, "invalid-promotion");
    const ordinaryPawnMove = board([placement("g2", "white", "pawn")]);
    expectRejected(move(ordinaryPawnMove, "g2", "g3", "queen"), "invalid-promotion");
  });

  it("does not apply castling or en-passant capture in this move layer", () => {
    const kingAndRights = board([], {
      whiteKing: "e1",
      blackKing: "e8",
      castlingRights: ["white-king-side"],
    });
    expectRejected(move(kingAndRights, "e1", "g1"), "illegal-move");

    const enPassant = board(
      [placement("e5", "white", "pawn"), placement("d5", "black", "pawn")],
      { enPassantTarget: "d6" },
    );
    expectRejected(move(enPassant, "e5", "d6"), "illegal-move");
  });

  it("does not claim to test whether a move leaves the mover's king in check", () => {
    const position = board([placement("e8", "black", "rook")], {
      whiteKing: "d1",
      blackKing: "h8",
    });
    const result = expectAccepted(move(position, "d1", "e1"));
    expect(pieceAt(result.position, square("e1"))).toEqual({ color: "white", kind: "king" });
  });
});
