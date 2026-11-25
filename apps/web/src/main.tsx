import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  formatSquare,
  pieceAt,
} from "@2d-chess/chess-core";
import type { MoveIntent, MoveRecord, PromotionPieceKind, Square } from "@2d-chess/chess-core";
import { legalIntentsFrom } from "./game.js";
import {
  closeReplay,
  createGameSession,
  firstReplayPosition,
  getMoveHistory,
  getReplayState,
  getSessionPosition,
  getSessionStatus,
  lastReplayPosition,
  openReplay,
  playSessionMove,
  redoSession,
  seekReplay,
  stepReplay,
  undoSession,
} from "./session.js";
import "./style.css";

const GLYPHS: Record<string, string> = {
  "white-king": "♔", "white-queen": "♕", "white-rook": "♖", "white-bishop": "♗", "white-knight": "♘", "white-pawn": "♙",
  "black-king": "♚", "black-queen": "♛", "black-rook": "♜", "black-bishop": "♝", "black-knight": "♞", "black-pawn": "♟",
};
const PROMOTION_OPTIONS: readonly PromotionPieceKind[] = ["queen", "rook", "bishop", "knight"];
const label = (kind: string) => kind[0]!.toUpperCase() + kind.slice(1);

type PendingPromotion = { readonly from: Square; readonly to: Square };

function statusText(kind: ReturnType<typeof getSessionStatus>["kind"], detail?: string): string {
  if (kind === "check") return "Check";
  if (kind === "checkmate") return `Checkmate — ${detail} wins`;
  if (kind === "stalemate") return "Draw — stalemate";
  if (kind === "draw") return `Draw — ${detail}`;
  if (kind === "invalid-position") return "Position error";
  return "In progress";
}

function moveLabel(move: MoveRecord, index: number): string {
  const number = Math.floor(index / 2) + 1;
  const prefix = index % 2 === 0 ? `${number}.` : `${number}...`;
  const capture = move.capturedPiece ? "×" : "–";
  const promotion = move.promotion ? `=${label(move.promotion)[0]}` : "";
  return `${prefix} ${formatSquare(move.from)}${capture}${formatSquare(move.to)}${promotion}`;
}

function App() {
  const [session, setSession] = useState(() => createGameSession());
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const position = getSessionPosition(session);
  const status = useMemo(() => getSessionStatus(session), [session]);
  const replay = getReplayState(session);
  const history = getMoveHistory(session);
  const selected = replay ? null : selectedSquare;
  const legalIntents = selected ? legalIntentsFrom(position, selected) : [];
  const legalTargets = new Set(legalIntents.map((intent) => formatSquare(intent.to)));
  const gameOver = status.kind === "checkmate" || status.kind === "stalemate" || status.kind === "draw" || status.kind === "invalid-position";
  const replaying = replay !== null;

  function finishMove(intent: MoveIntent) {
    const result = playSessionMove(session, intent);
    if (result.kind !== "accepted") return;
    setSession(result.session);
    setPendingPromotion(null);
  }

  function selectSquare(square: Square) {
    if (gameOver || replaying || pendingPromotion) return;
    const currentSelected = selected;
    const name = formatSquare(square);
    if (currentSelected && legalTargets.has(name)) {
      const intent = legalIntents.find((candidate) => formatSquare(candidate.to) === name)!;
      const moving = pieceAt(position, currentSelected);
      if (moving?.kind === "pawn" && (square.rank === 1 || square.rank === 8)) {
        setPendingPromotion({ from: currentSelected, to: square });
      } else {
        finishMove(intent);
      }
      setSelectedSquare(null);
      return;
    }
    const piece = pieceAt(position, square);
    setSelectedSquare(piece?.color === position.activeColor ? square : null);
  }

  function resetGame() {
    setSession(createGameSession());
    setSelectedSquare(null);
    setPendingPromotion(null);
  }

  function moveReplay(target: ReturnType<typeof stepReplay>) {
    if (target) setSession(target);
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
            <div><strong>{replay ? (replay.index < 0 ? "Replay · before first move" : `Replay · move ${replay.index + 1} of ${replay.totalMoves}`) : gameOver ? statusText(status.kind, resultDetail) : turnLabel}</strong><span>{status.kind === "check" ? "The king is under attack." : status.kind === "active" ? "Both sides are ready." : "Game status"}</span></div>
          </div>
          <div className="session-actions">
            <button className="reset-button" type="button" onClick={resetGame}>New game</button>
            <button type="button" onClick={() => setSession(undoSession(session))} disabled={replaying || session.cursor === 0}>Undo</button>
            <button type="button" onClick={() => setSession(redoSession(session))} disabled={replaying || session.cursor >= session.snapshots.length - 1}>Redo</button>
          </div>
          {!replaying ? <button className="replay-toggle" type="button" onClick={() => setSession(openReplay(session))} disabled={history.length === 0}>Review moves</button> : <div className="replay-controls" aria-label="Replay controls">
            <button type="button" aria-label="Replay from start" onClick={() => moveReplay(firstReplayPosition(session))} disabled={replay.atStart}>|◀</button>
            <button type="button" aria-label="Previous replay move" onClick={() => moveReplay(stepReplay(session, "previous"))} disabled={replay.atStart}>◀</button>
            <span aria-live="polite">{replay.index < 0 ? "Start" : `${replay.index + 1} / ${replay.totalMoves}`}</span>
            <button type="button" aria-label="Next replay move" onClick={() => moveReplay(stepReplay(session, "next"))} disabled={replay.atEnd}>▶</button>
            <button type="button" aria-label="Replay to end" onClick={() => moveReplay(lastReplayPosition(session))} disabled={replay.atEnd}>▶|</button>
            <button type="button" onClick={() => { setSession(closeReplay(session)); setSelectedSquare(null); }}>Exit review</button>
          </div>}
          <p className="keyboard-hint">Keyboard and touch: focus a square and press Enter or Space.</p>
          {history.length > 0 && <ol className="move-history" aria-label="Move history">
            {history.map((move, index) => <li key={`${formatSquare(move.from)}-${formatSquare(move.to)}-${index}`}>
              <button type="button" aria-current={replay?.index === index ? "step" : undefined}
                onClick={() => {
                  if (!replaying) setSession(openReplay(session));
                  const base = replaying ? session : openReplay(session);
                  const destination = seekReplay(base, index);
                  if (destination) setSession(destination);
                }}>{moveLabel(move, index)}</button>
            </li>)}
          </ol>}
        </div>

        <div className="board-column">
          <div className="board-frame">
            <div className="board" role="group" aria-label="Chessboard">
              {Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => {
                const square = { file: "abcdefgh"[col]! as Square["file"], rank: (8 - row) as Square["rank"] };
                const name = formatSquare(square);
                const piece = pieceAt(position, square);
                const isLight = (col + square.rank) % 2 === 0;
                const isSelected = selectedSquare !== null && formatSquare(selectedSquare) === name;
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
                  disabled={gameOver || replaying || pendingPromotion !== null}
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
      <footer><span>Local-first by design</span><span>Rules, sessions, and outcomes from chess-core</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
