import React from "react";
import { createRoot } from "react-dom/client";
import { allSquares, formatSquare } from "@2d-chess/chess-core";
import "./style.css";

function App() {
  const squares = allSquares();

  return (
    <main className="shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Chess home">CHESS<span> / 02</span></a>
        <span className="edition">A new foundation</span>
      </header>
      <section className="intro" aria-labelledby="page-title">
        <div className="copy">
          <p className="eyebrow">VERSION TWO · BUILT TO EVOLVE</p>
          <h1 id="page-title">A clearer way<br />to think ahead.</h1>
          <p className="lede">The next chapter starts with a clean, typed chess core and a flexible web experience. Your V1 game remains preserved while V2 grows on its own terms.</p>
          <div className="status"><span className="status-dot" /> Foundation is in place</div>
        </div>
        <div className="board-frame" aria-label="Chessboard coordinate preview">
          <div className="board" role="img" aria-label="An empty chessboard with coordinate labels">
            {squares.map((square) => {
              const isLight = (square.file.charCodeAt(0) - 97 + square.rank) % 2 === 0;
              return <div className={`cell ${isLight ? "light" : "dark"}`} key={formatSquare(square)} />;
            })}
          </div>
          <div className="board-caption"><span>64 squares</span><span>Typed coordinates</span></div>
        </div>
      </section>
      <footer><span>V2 foundation</span><span>Local-first by design</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
