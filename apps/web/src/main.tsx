import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  applyLegalMove,
  createInitialPosition,
  formatSquare,
  getGameStatus,
  pieceAt,
} from "@2d-chess/chess-core";
import type { MoveIntent, Position, PromotionPieceKind, Square } from "@2d-chess/chess-core";
import { legalIntentsFrom } from "./game.js";
import "./style.css";

const GLYPHS: Record<string, string> = {
  "white-king": "♔", "white-queen": "♕", "white-rook": "♖", "white-bishop": "♗", "white-knight": "♘", "white-pawn": "♙",
  "black-king": "♚", "black-queen": "♛", "black-rook": "♜", "black-bishop": "♝", "black-knight": "♞", "black-pawn": "♟",
};
const PROMOTION_OPTIONS: readonly PromotionPieceKind[] = ["queen", "rook", "bishop", "knight"];
const label = (kind: string) => kind[0]!.toUpperCase() + kind.slice(1);

type PendingPromotion = { readonly from: Square; readonly to: Square };

function statusText(kind: ReturnType<typeof getGameStatus>["kind"], detail?: string): string {
  if (kind === "check") return "Check";
  if (kind === "checkmate") return `Checkmate — ${detail} wins`;
  if (kind === "stalemate") return "Draw — stalemate";
  if (kind === "draw") return `Draw — ${detail}`;
  if (kind === "invalid-position") return "Position error";
  return "In progress";
}

function App() {
  const [position, setPosition] = useState<Position>(() => createInitialPosition());
  const [priorPositions, setPriorPositions] = useState<readonly Position[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const status = useMemo(() => getGameStatus(position, priorPositions), [position, priorPositions]);
  const legalIntents = selected ? legalIntentsFrom(position, selected) : [];
  const legalTargets = new Set(legalIntents.map((intent) => formatSquare(intent.to)));
  const gameOver = status.kind === "checkmate" || status.kind === "stalemate" || status.kind === "draw" || status.kind === "invalid-position";

  function finishMove(intent: MoveIntent) {
    const result = applyLegalMove(position, intent);
    if (result.kind !== "accepted") return;
    setPriorPositions((previous) => [...previous, position]);
    setPosition(result.position);
    setSelected(null);
    setPendingPromotion(null);
  }

  function selectSquare(square: Square) {
    if (gameOver || pendingPromotion) return;
    const name = formatSquare(square);
    if (selected && legalTargets.has(name)) {
      const intent = legalIntents.find((candidate) => formatSquare(candidate.to) === name)!;
      const moving = pieceAt(position, selected);
      const promotes = moving?.kind === "pawn" && (square.rank === 1 || square.rank === 8);
      if (promotes) setPendingPromotion({ from: selected, to: square });
      else finishMove(intent);
      return;
    }
    const piece = pieceAt(position, square);
    setSelected(piece?.color === position.activeColor ? square : null);
  }

  function resetGame() {
    setPosition(createInitialPosition());
    setPriorPositions([]);
    setSelected(null);
    setPendingPromotion(null);
  }

  const turnLabel = position.activeColor === "white" ? "White to move" : "Black to move";
  const resultDetail = status.kind === "checkmate" ? label(status.winner) : status.kind === "draw" ? status.reason.replaceAll("-", " ") : undefined;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Chess home">CHESS<span> / 02</span></a>
        <span className="edition">LOCAL GAME · V2</span>
      </header>

      <section className="game-layout" aria-labelledby="game-title">
        <div className="game-info">
          <p className="eyebrow">A NEW FOUNDATION, NOW IN PLAY</p>
          <h1 id="game-title">Your move.</h1>
          <p className="lede">A local two-player game, powered by the V2 rules engine. Choose a piece, then a highlighted square.</p>
          <div className="turn-card" aria-live="polite" aria-atomic="true">
            <span className={`turn-indicator ${position.activeColor}`} aria-hidden="true" />
            <div><strong>{gameOver ? statusText(status.kind, resultDetail) : turnLabel}</strong><span>{status.kind === "check" ? "The king is under attack." : status.kind === "active" ? "Both sides are ready." : "Game status"}</span></div>
          </div>
          <button className="reset-button" type="button" onClick={resetGame}>New game</button>
          <p className="keyboard-hint">Keyboard and touch: focus a square and press Enter or Space.</p>
        </div>

        <div className="board-column">
          <div className="board-frame">
            <div className="board" role="group" aria-label="Chessboard">
              {[...Array(8)].flatMap((_, row) => [...Array(8)].map((__, col) => {
                const square = { file: "abcdefgh"[col]! as Square["file"], rank: (8 - row) as Square["rank"] };
                const name = formatSquare(square);
                const piece = pieceAt(position, square);
                const isLight = (col + square.rank) % 2 === 0;
                const isSelected = selected !== null && formatSquare(selected) === name;
                const isTarget = legalTargets.has(name);
                const contents = piece ? GLYPHS[`${piece.color}-${piece.kind}`] : "";
                const accessiblePiece = piece ? `${piece.color} ${piece.kind}` : "empty";
                return <button
                  key={name}
                  type="button"
                  className={`square ${isLight ? "light" : "dark"}${isSelected ? " selected" : ""}${isTarget ? " target" : ""}`}
                  aria-label={`${name}, ${accessiblePiece}${isSelected ? ", selected" : ""}${isTarget ? ", legal destination" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => selectSquare(square)}
                  disabled={gameOver || pendingPromotion !== null}
                >
                  {col === 0 && <span className="rank-coordinate" aria-hidden="true">{square.rank}</span>}
                  {row === 7 && <span className="file-coordinate" aria-hidden="true">{square.file}</span>}
                  {contents && <span className={`piece ${piece!.color}`} aria-hidden="true">{contents}</span>}
                </button>;
              }))}
            </div>
          </div>
          <div className="board-caption"><span>White at bottom</span><span>{position.fullmoveNumber === 1 && position.activeColor === "white" ? "Ready to begin" : `Move ${position.fullmoveNumber}`}</span></div>
        </div>
      </section>

      {pendingPromotion && <div className="promotion-backdrop">
        <section className="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
          <h2 id="promotion-title">Choose a promotion</h2>
          <p>Promote your pawn to:</p>
          <div className="promotion-options">
            {PROMOTION_OPTIONS.map((promotion) => <button key={promotion} type="button" onClick={() => finishMove({ ...pendingPromotion, promotion })}>
              <span aria-hidden="true">{GLYPHS[`${position.activeColor}-${promotion}`]}</span>{label(promotion)}
            </button>)}
          </div>
          <button className="cancel-promotion" type="button" onClick={() => setPendingPromotion(null)}>Cancel</button>
        </section>
      </div>}
      <footer><span>Local-first by design</span><span>Rules and outcomes from chess-core</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
