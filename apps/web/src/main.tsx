import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  formatSquare,
  parsePGN,
  pieceAt,
  serializeFEN,
} from "@2d-chess/chess-core";
import type { MoveIntent, MoveRecord, PGNResult, ParsedPGN, PromotionPieceKind, Square } from "@2d-chess/chess-core";
import { legalIntentsFrom } from "./game.js";
import { FEN_REPLACEMENT_CONFIRMATION, hasFenReplacementProgress, prepareFenImport } from "./fen-import.js";
import { serializeSessionPGN } from "./pgn-session.js";
import { inspectGameSaveStorage, saveGameToStorage } from "./persistence.js";
import type { SaveInspection } from "./persistence.js";
import { arrowKeySquare, orientedBoardSquares } from "./orientation.js";
import type { BoardOrientation } from "./orientation.js";
import {
  CHESS_CLOCK_PRESETS,
  alignClockSide,
  createChessClock,
  formatClockTime,
  getTimeoutOutcome,
  pauseClock,
  startClock,
  switchClockSide,
  tickClock,
} from "./clock.js";
import type { ClockPresetId } from "./clock.js";
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
  const [initialSave] = useState<SaveInspection>(() => inspectGameSaveStorage());
  const restored = initialSave.status === "available" ? initialSave.save : null;
  const [session, setSession] = useState(() => restored?.session ?? createGameSession());
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [keyboardFocusSquare, setKeyboardFocusSquare] = useState<Square>(() => orientedBoardSquares("white")[0]!);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [clockPreset, setClockPreset] = useState<ClockPresetId>(() => restored?.clockPreset ?? "blitz-5-0");
  const [clock, setClock] = useState(() => restored?.clock ?? createChessClock("blitz-5-0"));
  const [orientation, setOrientation] = useState<BoardOrientation>("white");
  const [fenText, setFenText] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [fenMessage, setFenMessage] = useState("");
  const [pgnText, setPgnText] = useState("");
  const [pgnMessage, setPgnMessage] = useState("");
  const [pgnPreview, setPgnPreview] = useState<ParsedPGN | null>(null);
  const promotionDialogRef = useRef<HTMLElement | null>(null);
  const promotionReturnFocusRef = useRef<string | null>(null);
  const [saveNotice, setSaveNotice] = useState(() => initialSave.status === "available"
    ? "Saved game restored. The clock is paused; offline time is not charged."
    : initialSave.status === "legacy" ? initialSave.message
      : initialSave.status === "invalid" || initialSave.status === "outdated"
        ? `Saved data was preserved: ${initialSave.message}`
        : initialSave.status === "unavailable" ? initialSave.message : "Game saves automatically on this device.");
  const persistenceRef = useRef({ session, clockPreset, clock });
  persistenceRef.current = { session, clockPreset, clock };
  const saveNowRef = useRef<() => void>(() => undefined);
  saveNowRef.current = () => {
    const current = persistenceRef.current;
    const result = saveGameToStorage(current.session, current.clockPreset, current.clock);
    const message = result.status === "saved" ? "Game saved on this device."
      : result.status === "cleared" ? "Completed game save cleared."
        : result.message;
    setSaveNotice((previous) => previous === message ? previous : message);
  };
  const position = getSessionPosition(session);
  const status = useMemo(() => getSessionStatus(session), [session]);
  const replay = getReplayState(session);
  const history = getMoveHistory(session);
  const boardSquares = orientedBoardSquares(orientation);
  const selected = selectedSquare;
  const legalIntents = selected ? legalIntentsFrom(position, selected) : [];
  const legalTargets = new Set(legalIntents.map((intent) => formatSquare(intent.to)));
  const timeout = clock.flaggedColor ? getTimeoutOutcome(position, clock.flaggedColor) : null;
  const gameOver = status.kind === "checkmate" || status.kind === "stalemate" || status.kind === "draw" || status.kind === "invalid-position" || timeout !== null;
  const replaying = replay !== null;

  useEffect(() => {
    if (!clock.running) return;
    const timer = window.setInterval(() => setClock((current) => tickClock(current, Date.now())), 250);
    return () => window.clearInterval(timer);
  }, [clock.running]);

  useEffect(() => {
    if (gameOver && clock.running) setClock((current) => pauseClock(current, Date.now()));
  }, [gameOver, clock.running]);

  useEffect(() => {
    saveNowRef.current();
  }, [session, clockPreset, clock.running, clock.started, clock.flaggedColor]);

  useEffect(() => {
    if (!clock.running) return;
    const timer = window.setInterval(() => saveNowRef.current(), 1000);
    return () => window.clearInterval(timer);
  }, [clock.running]);

  useEffect(() => {
    const persistOnHide = () => saveNowRef.current();
    window.addEventListener("pagehide", persistOnHide);
    return () => window.removeEventListener("pagehide", persistOnHide);
  }, []);

  useEffect(() => {
    if (pendingPromotion) {
      promotionDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    const returnTo = promotionReturnFocusRef.current;
    if (returnTo) {
      promotionReturnFocusRef.current = null;
      document.querySelector<HTMLButtonElement>(`[data-square="${returnTo}"]`)?.focus();
    }
  }, [pendingPromotion]);

  function finishMove(intent: MoveIntent) {
    const now = Date.now();
    const checkedClock = tickClock(clock, now);
    if (checkedClock.flaggedColor !== null) {
      setClock(checkedClock);
      return;
    }
    const result = playSessionMove(session, intent);
    if (result.kind !== "accepted") return;
    setSession(result.session);
    setClock((current) => switchClockSide(tickClock(current, now), result.session.snapshots[result.session.cursor]!.position.activeColor, now));
    setPendingPromotion(null);
  }

  function selectSquare(square: Square) {
    if ((gameOver && !replaying) || pendingPromotion) return;
    setKeyboardFocusSquare(square);
    const currentSelected = selected;
    const name = formatSquare(square);
    if (currentSelected && legalTargets.has(name)) {
      if (replaying) return;
      const intent = legalIntents.find((candidate) => formatSquare(candidate.to) === name)!;
      const moving = pieceAt(position, currentSelected);
      if (moving?.kind === "pawn" && (square.rank === 1 || square.rank === 8)) {
        promotionReturnFocusRef.current = formatSquare(square);
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
    setClock(createChessClock(clockPreset));
    setFenText("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    setFenMessage("");
  }

  function loadFen() {
    const decision = prepareFenImport(
      fenText,
      hasFenReplacementProgress(session, clock.started, pendingPromotion !== null),
      () => window.confirm(FEN_REPLACEMENT_CONFIRMATION),
    );
    if (decision.kind === "cancelled") {
      setFenMessage("Position load cancelled; the current game was not changed.");
      return;
    }
    if (decision.kind === "invalid") {
      setFenMessage(decision.message);
      return;
    }
    setSession(createGameSession(decision.position));
    setClock(createChessClock(clockPreset, decision.position.activeColor));
    setSelectedSquare(null);
    setPendingPromotion(null);
    setFenMessage("Position loaded. Move history starts from this position.");
  }

  function cancelPromotion() {
    if (pendingPromotion) promotionReturnFocusRef.current = formatSquare(pendingPromotion.from);
    setPendingPromotion(null);
  }

  function handlePromotionKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelPromotion();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  function exportPgn() {
    let result: PGNResult = "*";
    if (timeout) result = timeout.kind === "draw" ? "1/2-1/2" : timeout.winner === "white" ? "1-0" : "0-1";
    else if (status.kind === "checkmate") result = status.winner === "white" ? "1-0" : "0-1";
    else if (status.kind === "draw" || status.kind === "stalemate") result = "1/2-1/2";
    setPgnText(serializeSessionPGN(session, result));
    setPgnPreview(null);
    setPgnMessage("Current session exported as PGN.");
  }

  function previewPgn() {
    try {
      setPgnPreview(parsePGN(pgnText));
      setPgnMessage("PGN imported for preview; the active board was not changed.");
    } catch (error) {
      setPgnPreview(null);
      setPgnMessage(error instanceof Error ? `PGN import failed: ${error.message}` : "PGN import failed.");
    }
  }

  function moveReplay(target: ReturnType<typeof stepReplay>) {
    if (target) {
      setSession(target);
      setSelectedSquare(null);
    }
  }

  const turnLabel = position.activeColor === "white" ? "White to move" : "Black to move";
  const resultDetail = status.kind === "checkmate" ? label(status.winner) : status.kind === "draw" ? status.reason.replaceAll("-", " ") : undefined;
  const outcomeLabel = timeout
    ? timeout.kind === "win" ? `Flag fall — ${label(timeout.winner)} wins` : "Flag fall — draw, no mating material"
    : replay ? (replay.index < 0 ? "Replay · before first move" : `Replay · move ${replay.index + 1} of ${replay.totalMoves}`)
      : gameOver ? statusText(status.kind, resultDetail) : turnLabel;

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
            <div><strong>{outcomeLabel}</strong><span>{timeout ? timeout.kind === "win" ? `${label(timeout.winner)} has mating material.` : "The opponent cannot checkmate." : status.kind === "check" ? "The king is under attack." : status.kind === "active" ? "Both sides are ready." : "Game status"}</span></div>
          </div>
          <section className="clock-panel" aria-label="Chess clock">
            <div className="clock-heading"><h2>Chess clock</h2><label htmlFor="clock-preset">Time control</label></div>
            <select id="clock-preset" value={clockPreset} disabled={session.cursor > 0 || clock.started || replaying}
              onChange={(event) => {
                const preset = event.target.value as ClockPresetId;
                setClockPreset(preset);
                setClock(createChessClock(preset, position.activeColor));
              }}>
              {Object.entries(CHESS_CLOCK_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
            </select>
            <div className="clock-readouts" aria-live="off">
              <div className={clock.activeColor === "white" ? "clock-active" : ""}><span>White</span><strong aria-label={`White ${formatClockTime(clock.whiteMilliseconds)} remaining`}>{formatClockTime(clock.whiteMilliseconds)}</strong></div>
              <div className={clock.activeColor === "black" ? "clock-active" : ""}><span>Black</span><strong aria-label={`Black ${formatClockTime(clock.blackMilliseconds)} remaining`}>{formatClockTime(clock.blackMilliseconds)}</strong></div>
            </div>
            <button className="clock-toggle" type="button" disabled={replaying || clock.flaggedColor !== null || (gameOver && !timeout)}
              onClick={() => setClock((current) => current.running ? pauseClock(current, Date.now()) : startClock(current, Date.now()))}>
              {clock.running ? "Pause clock" : clock.started ? "Resume clock" : "Start clock"}
            </button>
            {timeout && <p className="clock-result" role="status">{outcomeLabel}</p>}
          </section>
          <div className="session-actions">
            <button className="reset-button" type="button" onClick={resetGame}>New game</button>
            <button type="button" className="orientation-toggle" aria-pressed={orientation === "black"}
              onClick={() => setOrientation((current) => current === "white" ? "black" : "white")}>Flip board</button>
            <button type="button" onClick={() => {
              const next = undoSession(session);
              setSession(next);
              setClock(alignClockSide(pauseClock(clock, Date.now()), getSessionPosition(next).activeColor));
              setSelectedSquare(null);
            }} disabled={replaying || session.cursor === 0}>Undo</button>
            <button type="button" onClick={() => {
              const next = redoSession(session);
              setSession(next);
              setClock(alignClockSide(pauseClock(clock, Date.now()), getSessionPosition(next).activeColor));
              setSelectedSquare(null);
            }} disabled={replaying || session.cursor >= session.snapshots.length - 1}>Redo</button>
          </div>
          <p className="save-status" role="status" aria-live="polite">{saveNotice}</p>
          {!replaying ? <button className="replay-toggle" type="button" onClick={() => { setSelectedSquare(null); setClock(pauseClock(clock, Date.now())); setSession(openReplay(session)); }} disabled={history.length === 0}>Review moves</button> : <div className="replay-controls" aria-label="Replay controls">
            <button type="button" aria-label="Replay from start" onClick={() => moveReplay(firstReplayPosition(session))} disabled={replay.atStart}>|◀</button>
            <button type="button" aria-label="Previous replay move" onClick={() => moveReplay(stepReplay(session, "previous"))} disabled={replay.atStart}>◀</button>
            <span aria-live="polite">{replay.index < 0 ? "Start" : `${replay.index + 1} / ${replay.totalMoves}`}</span>
            <button type="button" aria-label="Next replay move" onClick={() => moveReplay(stepReplay(session, "next"))} disabled={replay.atEnd}>▶</button>
            <button type="button" aria-label="Replay to end" onClick={() => moveReplay(lastReplayPosition(session))} disabled={replay.atEnd}>▶|</button>
            <button type="button" onClick={() => { setSession(closeReplay(session)); setSelectedSquare(null); }}>Exit review</button>
            <span className="replay-hint-note" role="note">Select a piece to see legal-move hints. Moves cannot be played in review.</span>
          </div>}
          <p className="keyboard-hint">Keyboard and touch: focus a square and press Enter or Space.</p>
          <section className="fen-panel" aria-labelledby="fen-title">
            <h2 id="fen-title">Position notation</h2>
            <label htmlFor="fen-input">FEN (six fields)</label>
            <textarea id="fen-input" rows={3} spellCheck={false} value={fenText} onChange={(event) => setFenText(event.target.value)} />
            <div className="fen-actions">
              <button type="button" onClick={() => { setFenText(serializeFEN(position)); setFenMessage("Current position exported to the field."); }}>Show current FEN</button>
              <button type="button" disabled={replaying} onClick={loadFen}>Load position</button>
            </div>
            <p className="fen-message" role="status" aria-live="polite">{fenMessage}</p>
          </section>
          <section className="pgn-panel" aria-labelledby="pgn-title">
            <h2 id="pgn-title">Portable game notation</h2>
            <label htmlFor="pgn-input">PGN</label>
            <textarea id="pgn-input" rows={4} spellCheck={false} value={pgnText} onChange={(event) => setPgnText(event.target.value)} />
            <div className="pgn-actions">
              <button type="button" onClick={exportPgn}>Export PGN</button>
              <button type="button" onClick={previewPgn}>Preview import</button>
            </div>
            <p className="pgn-message" role="status" aria-live="polite">{pgnMessage}</p>
            {pgnPreview && <div className="pgn-preview" aria-label="Imported PGN preview">
              <strong>{pgnPreview.headers.Event ?? "Imported game"}</strong>
              <ol>{pgnPreview.moves.map((move, index) => <li key={`${move}-${index}`}>{move}</li>)}</ol>
              <span>Result: {pgnPreview.result}</span>
            </div>}
          </section>
          {history.length > 0 && <ol className="move-history" aria-label="Move history">
            {history.map((move, index) => <li key={`${formatSquare(move.from)}-${formatSquare(move.to)}-${index}`}>
              <button type="button" aria-current={replay?.index === index ? "step" : undefined}
                onClick={() => {
                  if (!replaying) { setSelectedSquare(null); setClock(pauseClock(clock, Date.now())); setSession(openReplay(session)); }
                  const base = replaying ? session : openReplay(session);
                  const destination = seekReplay(base, index);
                  if (destination) { setSession(destination); setSelectedSquare(null); }
                }}>{moveLabel(move, index)}</button>
            </li>)}
          </ol>}
        </div>

        <div className="board-column">
          <div className="board-frame">
            <div className="board" role="group" aria-label={`Chessboard, ${orientation} at bottom`}>
              {boardSquares.map((square, index) => {
                const row = Math.floor(index / 8);
                const col = index % 8;
                const name = formatSquare(square);
                const piece = pieceAt(position, square);
                const isLight = ("abcdefgh".indexOf(square.file) + square.rank) % 2 === 0;
                const isSelected = selectedSquare !== null && formatSquare(selectedSquare) === name;
                const isTarget = legalTargets.has(name);
                const contents = piece ? GLYPHS[`${piece.color}-${piece.kind}`] : "";
                const accessiblePiece = piece ? `${piece.color} ${piece.kind}` : "empty";
                return <button
                  key={name}
                  type="button"
                  data-square={name}
                  tabIndex={formatSquare(keyboardFocusSquare) === name ? 0 : -1}
                  className={`square ${isLight ? "light" : "dark"}${isSelected ? " selected" : ""}${isTarget ? " target" : ""}`}
                  aria-label={`${name}, ${accessiblePiece}${isSelected ? ", selected" : ""}${isTarget ? (replaying ? ", legal move hint" : ", legal destination") : ""}`}
                  aria-pressed={isSelected}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && selectedSquare) {
                      event.preventDefault();
                      setSelectedSquare(null);
                      return;
                    }
                    const destination = arrowKeySquare(square, event.key, orientation);
                    if (destination) {
                      event.preventDefault();
                      const targetName = formatSquare(destination);
                      setKeyboardFocusSquare(destination);
                      event.currentTarget.closest(".board")?.querySelector<HTMLButtonElement>(`[data-square="${targetName}"]`)?.focus();
                    }
                  }}
                  onClick={() => selectSquare(square)}
                  disabled={pendingPromotion !== null || (gameOver && !replaying)}
                >
                  {col === 0 && <span className="rank-coordinate" aria-hidden="true">{square.rank}</span>}
                  {row === 7 && <span className="file-coordinate" aria-hidden="true">{square.file}</span>}
                  {contents && <span className={`piece ${piece!.color}`} aria-hidden="true">{contents}</span>}
                </button>;
              })}
            </div>
          </div>
          <p className="sr-only" role="status" aria-live="polite">{selectedSquare && pieceAt(position, selectedSquare)
            ? `${label(pieceAt(position, selectedSquare)!.color)} ${label(pieceAt(position, selectedSquare)!.kind)} on ${formatSquare(selectedSquare)} selected. ${replaying ? "Legal-move hints" : "Legal destinations"}: ${Array.from(legalTargets).join(", ") || "none"}. ${replaying ? "Review is read-only. " : ""}Press Escape to clear selection.`
            : ""}</p>
          <div className="board-caption"><span>{orientation === "white" ? "White at bottom" : "Black at bottom"}</span><span>{position.fullmoveNumber === 1 && position.activeColor === "white" ? "Ready to begin" : `Move ${position.fullmoveNumber}`}</span></div>
        </div>
      </section>

      {pendingPromotion && <div className="promotion-backdrop">
        <section ref={promotionDialogRef} className="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-title" onKeyDown={handlePromotionKeyDown}>
          <h2 id="promotion-title">Choose a promotion</h2>
          <p>Promote your pawn to:</p>
          <div className="promotion-options">
            {PROMOTION_OPTIONS.map((promotion) => <button key={promotion} type="button" onClick={() => finishMove({ ...pendingPromotion, promotion })}>
              <span aria-hidden="true">{GLYPHS[`${position.activeColor}-${promotion}`]}</span>{label(promotion)}
            </button>)}
          </div>
          <button className="cancel-promotion" type="button" onClick={cancelPromotion}>Cancel</button>
        </section>
      </div>}
      <footer><span>Local-first by design</span><span>Rules, sessions, and outcomes from chess-core</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
