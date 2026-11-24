# Chess V2 Modernization Migration Plan

**Status:** Approved for migration execution. This plan is limited to modernizing and migrating agreed V1 capabilities; the separate V2 product feature roadmap remains paused.

## Purpose and scope

Rebuild the existing V1 product baseline on V2's TypeScript/pnpm monorepo, in small tested slices, without carrying forward V1's implementation structure. This is not the new feature plan: it does not advance the V1 roadmap's “57 complete / 43 remaining” count, add its remaining features, or change feature priorities. After the agreed V1 baseline has been migrated and reviewed, resume the separate V2 product feature plan.

The migration target is the behavior users can currently rely on: chess rules and outcomes; move/session state, history, undo/redo and replay; FEN and PGN workflows; local save/resume; chess clock; board orientation; accessible keyboard/touch interaction; responsive layout; and optional sound. Where a behavior is only present in code and not established by tests or product documentation, record it as an explicit decision rather than silently treating it as a requirement.

## Current position

V2 is on `main` at `15597fc64fd25862305d109af69acc87c80a9b37`, descended from the V1 release. The V2 source tree is a fresh monorepo tree; the V1 tag and branch remain available as references.

Completed setup includes `apps/web` (React/Vite TypeScript), `packages/chess-core` (framework-independent TypeScript), strict shared compiler settings, pnpm workspace scripts, and a tested square-coordinate helper. The web app is only a starter shell and is not yet playable. No V1 gameplay has been migrated.

The six-area V1 code/test audit is complete. `src/Game.js` is 1,647 lines and combines chess rules, session state, DOM access, history/replay, clocks, persistence, and FEN/PGN controls. Other behavior is spread across `Piece.js`, individual piece classes, `chess-clock.js`, `board-orientation.js`, `fen.js`, `pgn.js`, `game-save.js`, `game-persistence.js`, and `replay-cursor.js`. Existing tests use Node's test runner; some load classic-script globals in a VM, and the responsive layout test is Python-based. The V1 baseline passes **142 Node tests** and **9 responsive/integration checks** (five viewport cases and four interaction/recovery flows).

## M0 decisions and behavior inventory

### Rules-engine approach

**Decision:** implement V2-owned chess-domain logic in strict TypeScript in `packages/chess-core`, re-expressing the characterized V1 behavior through explicit typed state and pure/deterministic operations. Do not introduce a third-party rules engine as the initial implementation and do not port V1's `Game`/`Piece` class architecture. Keep any legacy coordinate, piece-identity, or save-shape translation at an adapter boundary. This avoids making the app depend on V1's DOM-driven state model while keeping the rules directly testable and under the project's control.

The tradeoff is that V2 must re-establish and test every required rule; existing V1 code and tests are evidence, not proof of complete chess-standard conformance. No such conformance claim should be made without a broader independent oracle suite.

### Capability inventory

| V1 capability | Evidence and migration boundary | Open compatibility questions |
| --- | --- | --- |
| Piece movement, legal moves, special moves, and outcomes | `tests/piece-movement.test.js` covers piece movement, blockers, pins, king safety, checkmate/stalemate, castling, en passant, promotion, and insufficient material. Re-express positions and rule transitions in `chess-core`; keep DOM-free. | Choose a canonical square encoding. Clarify castling rights and promoted-piece identity. Characterize repetition and 50-move edges. A V1 pawn-blocking path appears to concatenate arrays with `+`; preserve or correct only deliberately. |
| Session, history, undo/redo, and replay | `tests/replay-cursor.test.js` covers cursor bounds, copied history, synchronization, and replay controls. `Game.js` also implements snapshots, atomic promotion completion, redo invalidation, and replay restoration. Put structured move/session state outside the UI; render replay in `apps/web`. | V1 test coverage does not fully establish undo/redo, branch-after-undo, restore atomicity, or imported histories without snapshots. Decide whether formatted move strings must remain byte-identical or can derive from structured moves. |
| FEN and PGN | `fen-parsing.test.js`, `fen-serialization.test.js`, `game-fen.test.js`, and `pgn-export.test.js` cover validation, round trips, results, headers, and controls. Put typed parsers/serializers in `chess-core`; keep confirmation, clipboard, and preview in `apps/web`. | Confirm strict V1 FEN acceptance, castling/en-passant representation, and PGN formatting subset. PGN import is currently preview-only, not playable-game loading. |
| Local persistence and recovery | `game-save.test.js` covers versioned snapshots, validation, the 256 KiB cap, and transitional-state rejection. `game-persistence.test.js` covers local storage outcomes, malformed data, legacy optional fields, and storage failures. Keep browser storage and resume UI in `apps/web`; use a portable snapshot adapter. | Decide whether to import existing V1 `2d-chess-game:save:v1` browser saves. Clarify cleanup/preservation of unsupported saves, restore atomicity, and offline clock semantics. |
| Chess clock and orientation | `chess-clock.js` has injected time/timer dependencies and clock rules; `README.md` describes lifecycle coverage. `board-orientation.js` couples orientation, animation, and coordinates to the DOM. Put clock state logic in a typed module and orientation/animation in `apps/web`. | Obtain/port exact clock and orientation tests. Confirm rounding/tick semantics, saved running-clock behavior, and whether orientation persists. |
| Web interaction, accessibility, responsive layout, and sound | `tests/responsive-layout.py` checks five viewport classes, square-board/no-overflow invariants, mobile action sizes, and several controls. `Game.js`, `index.html`, `assets/chess.css`, and README document keyboard, touch, accessible names/announcements, reduced motion/contrast, and optional sound. Rebuild these in `apps/web`; core returns typed move/outcome facts only. | Dedicated automated accessibility and sound coverage is not established. Decide whether drag/drop and exact sound preference/tone behavior are compatibility requirements; verify orientation semantics. |

### Behaviors to handle cautiously

- Existing V1 tests characterize selected cases but do not prove comprehensive chess-rule correctness. Add explicit tests for state invariants and every special-move transition as V2 rules land.
- V1 `Piece` methods reach into a global `game`, piece constructors query the DOM, and legality checks mutate live piece objects temporarily. V2 must use explicit state and avoid these couplings.
- V1 FEN/PGN helpers are classic-script globals. FEN identities and castling rights are inferred from legacy names/flags. Keep any compatibility conversion at the boundary.
- V1 save restoration rebuilds DOM objects from serialized legacy fields. V2 persistence should use versioned, portable snapshots and a separately tested converter if V1 save import is retained.
- UI-specific behavior, such as accessible announcements and sound, belongs in the web layer, not in chess rules.

## Desired V2 architecture

- `packages/chess-core` owns explicit chess-domain types, positions, legal-move/rule operations, outcomes, and portable notation/data functions. It must not depend on React, DOM APIs, browser storage, CSS, or audio.
- `apps/web` owns board rendering, input/focus/accessibility, dialogs, visual state, orientation, sound, browser storage adapters, and user-facing import/export controls.
- Introduce a small typed session/application layer only where it coordinates domain transitions, history, clocks, or persistence. Avoid a monolithic controller and avoid unnecessary package fragmentation.
- Put legacy FEN/save/coordinate conversion behind explicit adapters only when compatibility requires it. Do not leak legacy object shapes into the V2 core API.

## Migration sequence

### M0 — Behavior inventory and migration decisions — Complete

The six-subsystem inventory and initial rules-engine decision above are recorded. Open compatibility items remain tracked at the relevant phase and must be resolved before implementing those affected contracts.

### M1 — Core domain vocabulary and position model

Expand the existing square helper into explicit types for color/side, piece kind, piece, position, and move input/result. Define initial-position construction, board invariants, and clear rejected-input behavior. Keep conversions at boundaries; do not expose V1 piece objects or mailbox coordinates.

**Exit condition:** public domain types compile under strict settings and have tests for coordinate conversion, initial position, valid construction, and invalid states.

### M2 — Rules and legal move behavior

Build rules in focused steps: basic movement and occupancy; captures, turns, and king safety; then castling, en passant, promotion, check/mate/stalemate, and required draw conditions. Port suitable V1 named cases as state-based tests. Add invariant/transition tests and explicitly resolve any questionable V1 behavior before adopting a different result.

**Exit condition:** all rules in the agreed migration baseline have meaningful tests; `chess-core` remains DOM-free. Do not claim full chess-standard conformance absent a comprehensive oracle suite.

### M3 — First playable vertical slice

Render an initial position in `apps/web`, select a current-side piece, show legal destinations, submit a move, and display the updated board/turn/status using `chess-core`. Add promotion and terminal states as their core behaviors land. Include keyboard and touch operation, useful accessible names/announcements, reduced-motion support, and responsive layout as part of the vertical slice.

**Exit condition:** a user can complete a local two-player game in V2 with core rules authoritative and UI state synchronized.

### M4 — Session, history, replay, clock, and orientation

Move state coordination into a small typed session boundary. Migrate structured move history, notation display, undo/redo, results, replay indexing and snapshots, board orientation, and clock lifecycle as separate testable behaviors. Viewing a replay must not mutate the active game. Keep browser timers and presentation state out of core rule functions.

**Exit condition:** agreed V1 baseline behavior for session/history/replay/clock/orientation works with tested edge cases and no monolithic coordinator.

### M5 — FEN, PGN, and local persistence

Migrate FEN and PGN parsers/serializers with typed input/output and tests for supported validation/formatting. Define a V2 versioned save schema and safe restore contract. Resolve the V1-save import question before implementation; if supported, use a separate converter and never discard source data until a converted save validates and restores successfully.

**Exit condition:** agreed V1 interchange/save behavior works through V2 APIs, failure leaves valid current data untouched, and any V1 compatibility path is explicit and tested.

### M6 — Parity review and migration closeout

Compare V2 behavior against the M0 inventory, close only migration gaps, remove scaffolding, document intentional differences, and confirm clean install/typecheck/test/build instructions. Do not pull in new work from the separate feature plan.

**Exit condition:** every in-scope capability is evidenced in V2 or explicitly excluded by an agreed decision; the app installs, typechecks, tests, builds, and is ready to resume the separate feature roadmap.

## Working rules

- Keep V1 branch/tag as a read-only reference; never transplant its whole controller or DOM architecture.
- Make each PR a coherent, reviewable migration increment. Do not inflate PR counts by artificial splits.
- For each slice, state the behavior being preserved or intentionally changed. Add regression and invariant tests, run workspace typecheck/test/build, and keep commit timestamps real.
- Add dependencies only after a concrete reviewed need; do not introduce backend, accounts, online play, or computer-opponent work as part of this migration.
- Keep the separate product feature plan paused until M6 passes and migration closeout is reviewed.

## Current progress

| Work | Status |
| --- | --- |
| V2 pnpm/TypeScript monorepo and app/core boundaries | Complete |
| Minimal square-coordinate helper and three core tests | Complete |
| V1 six-area behavior inventory and initial rules-engine strategy | Complete |
| M1 core model beyond square coordinates | Not started |
| M2 rules migration | Not started |
| M3 playable V2 game | Not started |
| M4 session/history/replay/clock/orientation migration | Not started |
| M5 notation and persistence migration | Not started |
| M6 parity/closeout review | Not started |
