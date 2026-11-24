import { describe, expect, it } from "vitest";
import {
  applyLegalMove,
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

function legalMove(position: Position, from: string, to: string): MoveResult {
  return applyLegalMove(position, { from: square(from), to: square(to) });
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

  it("does not apply castling or en-passant capture in the pseudo-legal move layer", () => {
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

  it("castles on either side and moves the rook while clearing both rights", () => {
    const position = board(
      [placement("a1", "white", "rook"), placement("h1", "white", "rook")],
      { whiteKing: "e1", blackKing: "h8", castlingRights: ["white-king-side", "white-queen-side"] },
    );
    const kingSide = expectAccepted(legalMove(position, "e1", "g1"));
    expect(pieceAt(kingSide.position, square("g1"))).toEqual({ color: "white", kind: "king" });
    expect(pieceAt(kingSide.position, square("f1"))).toEqual({ color: "white", kind: "rook" });
    expect(pieceAt(kingSide.position, square("h1"))).toBeNull();
    expect(kingSide.position.castlingRights).toEqual([]);
    expect(kingSide.position.activeColor).toBe("black");
    expect(kingSide.position.halfmoveClock).toBe(1);

    const queenSide = expectAccepted(legalMove(position, "e1", "c1"));
    expect(pieceAt(queenSide.position, square("c1"))).toEqual({ color: "white", kind: "king" });
    expect(pieceAt(queenSide.position, square("d1"))).toEqual({ color: "white", kind: "rook" });
    expect(pieceAt(queenSide.position, square("a1"))).toBeNull();
    expect(queenSide.position.castlingRights).toEqual([]);
  });

  it("supports black castling and increments the fullmove number", () => {
    const position = board([placement("h8", "black", "rook")], {
      activeColor: "black",
      whiteKing: "a1",
      blackKing: "e8",
      castlingRights: ["black-king-side"],
      fullmoveNumber: 6,
    });
    const castled = expectAccepted(legalMove(position, "e8", "g8"));
    expect(pieceAt(castled.position, square("g8"))).toEqual({ color: "black", kind: "king" });
    expect(pieceAt(castled.position, square("f8"))).toEqual({ color: "black", kind: "rook" });
    expect(castled.position.fullmoveNumber).toBe(7);
    expect(castled.position.castlingRights).toEqual([]);
  });

  it("rejects castling through occupied squares or without its right and rook", () => {
    const blocked = board(
      [placement("a1", "white", "rook"), placement("h1", "white", "rook"), placement("b1", "white", "knight")],
      { whiteKing: "e1", castlingRights: ["white-king-side", "white-queen-side"] },
    );
    expectRejected(legalMove(blocked, "e1", "c1"), "illegal-move");
    expectAccepted(legalMove(blocked, "e1", "g1"));

    const noRook = board([], {
      whiteKing: "e1",
      castlingRights: ["white-king-side"],
    });
    expectRejected(legalMove(noRook, "e1", "g1"), "illegal-move");

    const noRight = board([placement("h1", "white", "rook")], { whiteKing: "e1" });
    expectRejected(legalMove(noRight, "e1", "g1"), "illegal-move");
  });

  it("rejects castling out of check or through an attacked transit square", () => {
    const inCheck = board(
      [placement("h1", "white", "rook"), placement("e8", "black", "rook")],
      { whiteKing: "e1", blackKing: "a8", castlingRights: ["white-king-side"] },
    );
    expectRejected(legalMove(inCheck, "e1", "g1"), "illegal-move");

    const attackedTransit = board(
      [
        placement("a1", "white", "rook"),
        placement("h1", "white", "rook"),
        placement("f8", "black", "rook"),
      ],
      { whiteKing: "e1", blackKing: "a8", castlingRights: ["white-king-side", "white-queen-side"] },
    );
    expectRejected(legalMove(attackedTransit, "e1", "g1"), "illegal-move");
    expectAccepted(legalMove(attackedTransit, "e1", "c1"));

    const attackedDestination = board(
      [placement("h1", "white", "rook"), placement("g8", "black", "rook")],
      { whiteKing: "e1", blackKing: "a8", castlingRights: ["white-king-side"] },
    );
    expectRejected(legalMove(attackedDestination, "e1", "g1"), "illegal-move");
  });

  it("applies en-passant captures for either side and updates turn metadata", () => {
    const whiteCapture = board(
      [placement("e5", "white", "pawn"), placement("d5", "black", "pawn")],
      { enPassantTarget: "d6", halfmoveClock: 12, fullmoveNumber: 4 },
    );
    const afterWhite = expectAccepted(legalMove(whiteCapture, "e5", "d6"));
    expect(pieceAt(afterWhite.position, square("d6"))).toEqual({ color: "white", kind: "pawn" });
    expect(pieceAt(afterWhite.position, square("d5"))).toBeNull();
    expect(pieceAt(afterWhite.position, square("e5"))).toBeNull();
    expect(afterWhite.move.capturedPiece).toEqual({ color: "black", kind: "pawn" });
    expect(afterWhite.position.activeColor).toBe("black");
    expect(afterWhite.position.enPassantTarget).toBeNull();
    expect(afterWhite.position.halfmoveClock).toBe(0);
    expect(afterWhite.position.fullmoveNumber).toBe(4);

    const blackCapture = board(
      [placement("e4", "black", "pawn"), placement("d4", "white", "pawn")],
      { activeColor: "black", enPassantTarget: "d3", fullmoveNumber: 7 },
    );
    const afterBlack = expectAccepted(legalMove(blackCapture, "e4", "d3"));
    expect(pieceAt(afterBlack.position, square("d3"))).toEqual({ color: "black", kind: "pawn" });
    expect(pieceAt(afterBlack.position, square("d4"))).toBeNull();
    expect(afterBlack.move.capturedPiece).toEqual({ color: "white", kind: "pawn" });
    expect(afterBlack.position.activeColor).toBe("white");
    expect(afterBlack.position.fullmoveNumber).toBe(8);
  });

  it("rejects en passant when removing both pawns exposes the mover's king", () => {
    const discoveredCheck = board(
      [
        placement("g5", "white", "pawn"),
        placement("a5", "black", "rook"),
        placement("f5", "black", "pawn"),
      ],
      { whiteKing: "h5", blackKing: "a8", enPassantTarget: "f6" },
    );
    expectRejected(legalMove(discoveredCheck, "g5", "f6"), "illegal-move");
  });

  it("keeps pseudo-legal movement separate from king-safety filtering", () => {
    const position = board([placement("e8", "black", "rook")], {
      whiteKing: "e1",
      blackKing: "h8",
    });
    expectAccepted(move(position, "e1", "e2"));
    expectRejected(legalMove(position, "e1", "e2"), "illegal-move");
  });

  it("rejects a pinned piece move that exposes its king", () => {
    const position = board(
      [placement("e2", "white", "rook"), placement("e8", "black", "rook")],
      { whiteKing: "e1", blackKing: "a8" },
    );
    expectAccepted(move(position, "e2", "f2"));
    expectRejected(legalMove(position, "e2", "f2"), "illegal-move");
  });

  it("rejects a king move onto squares attacked by pawns or the opposing king", () => {
    const position = board([placement("d6", "black", "pawn")], {
      whiteKing: "e4",
      blackKing: "h8",
    });
    expectAccepted(move(position, "e4", "e5"));
    expectRejected(legalMove(position, "e4", "e5"), "illegal-move");

    const opposingKing = board([], { whiteKing: "e4", blackKing: "e6" });
    expectAccepted(move(opposingKing, "e4", "e5"));
    expectRejected(legalMove(opposingKing, "e4", "e5"), "illegal-move");
  });

  it("allows a king to escape check and a king to capture an undefended checking piece", () => {
    const escape = board([placement("e8", "black", "rook")], {
      whiteKing: "e1",
      blackKing: "h8",
    });
    const escaped = expectAccepted(legalMove(escape, "e1", "d1"));
    expect(pieceAt(escaped.position, square("d1"))).toEqual({ color: "white", kind: "king" });

    const capture = board([placement("e2", "black", "rook")], {
      whiteKing: "e1",
      blackKing: "h8",
    });
    const captured = expectAccepted(legalMove(capture, "e1", "e2"));
    expect(pieceAt(captured.position, square("e2"))).toEqual({ color: "white", kind: "king" });
    expect(captured.move.capturedPiece).toEqual({ color: "black", kind: "rook" });
  });
});
