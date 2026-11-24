export type File = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface Square {
  readonly file: File;
  readonly rank: Rank;
}

export type Color = "white" | "black";
export type PieceKind = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";
export type PromotionPieceKind = "queen" | "rook" | "bishop" | "knight";
export type CastlingRight =
  | "white-king-side"
  | "white-queen-side"
  | "black-king-side"
  | "black-queen-side";

export interface ChessPiece {
  readonly color: Color;
  readonly kind: PieceKind;
}

export interface PieceOnSquare {
  readonly square: Square;
  readonly piece: ChessPiece;
}

export interface Position {
  readonly pieces: readonly PieceOnSquare[];
  readonly activeColor: Color;
  readonly castlingRights: readonly CastlingRight[];
  readonly enPassantTarget: Square | null;
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
}

export interface PositionInput {
  readonly pieces: readonly PieceOnSquare[];
  readonly activeColor: Color;
  readonly castlingRights?: readonly CastlingRight[];
  readonly enPassantTarget?: Square | null;
  readonly halfmoveClock?: number;
  readonly fullmoveNumber?: number;
}

export interface MoveIntent {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: PromotionPieceKind;
}

export interface MoveRecord {
  readonly from: Square;
  readonly to: Square;
  readonly piece: ChessPiece;
  readonly capturedPiece?: ChessPiece;
  readonly promotion?: PromotionPieceKind;
}

export type MoveRejectionReason =
  | "invalid-position"
  | "empty-origin"
  | "wrong-turn"
  | "illegal-move"
  | "promotion-required"
  | "invalid-promotion";

export type MoveResult =
  | { readonly kind: "accepted"; readonly position: Position; readonly move: MoveRecord }
  | { readonly kind: "rejected"; readonly reason: MoveRejectionReason };

export type GameStatus =
  | { readonly kind: "invalid-position"; readonly errors: readonly PositionValidationError[] }
  | { readonly kind: "active" }
  | { readonly kind: "check" }
  | { readonly kind: "checkmate"; readonly winner: Color }
  | { readonly kind: "stalemate" };

export type PositionValidationCode =
  | "invalid-position"
  | "invalid-square"
  | "duplicate-square"
  | "invalid-piece"
  | "king-count"
  | "pawn-on-back-rank"
  | "invalid-active-color"
  | "invalid-castling-right"
  | "invalid-en-passant-target"
  | "invalid-halfmove-clock"
  | "invalid-fullmove-number";

export interface PositionValidationError {
  readonly code: PositionValidationCode;
  readonly message: string;
  readonly square?: string;
  readonly color?: string;
}

export type PositionValidationResult =
  | { readonly ok: true; readonly position: Position }
  | { readonly ok: false; readonly errors: readonly PositionValidationError[] };
