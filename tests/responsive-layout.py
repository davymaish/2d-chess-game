#!/usr/bin/env python3
"""Browser-level responsive layout and persistence checks for representative devices."""

import asyncio
import os
import shutil
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE_URL = (ROOT / "index.html").as_uri()
VIEWPORTS = [
    ("small phone portrait", 320, 568, "portrait"),
    ("large phone portrait", 390, 844, "portrait"),
    ("phone landscape", 844, 390, "landscape"),
    ("tablet portrait", 768, 1024, "portrait"),
    ("tablet landscape", 820, 500, "landscape"),
]


def fail_if(condition, message):
    if condition:
        raise AssertionError(message)


async def main():
    async with async_playwright() as playwright:
        launch_options = {"headless": True, "args": ["--no-sandbox"]}
        executable = os.environ.get("CHROMIUM_EXECUTABLE_PATH") or next(
            (shutil.which(name) for name in ("chromium", "chromium-browser", "google-chrome") if shutil.which(name)),
            None,
        )
        if executable:
            launch_options["executable_path"] = executable
        browser = await playwright.chromium.launch(**launch_options)
        page = await browser.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        try:
            for label, width, height, orientation in VIEWPORTS:
                await page.set_viewport_size({"width": width, "height": height})
                await page.goto(PAGE_URL, wait_until="load")
                metrics = await page.evaluate(
                    """() => {
                        const rect = selector => {
                            const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect();
                            return { x, y, width, height, right, bottom };
                        };
                        return {
                            viewportWidth: window.innerWidth,
                            documentWidth: document.documentElement.scrollWidth,
                            bodyWidth: document.body.scrollWidth,
                            board: rect('#board'),
                            controls: rect('.game-controls'),
                            clock: rect('.chess-clock'),
                            history: rect('.move-history'),
                            boardDisplay: getComputedStyle(document.querySelector('#board')).display,
                            squareCount: document.querySelectorAll('#board .square').length,
                            squareSizes: Array.from(document.querySelectorAll('#board .square')).map(square => {
                                const box = square.getBoundingClientRect();
                                return { width: box.width, height: box.height };
                            }),
                        };
                    }"""
                )

                fail_if(metrics["documentWidth"] > width or metrics["bodyWidth"] > width,
                        f"{label}: horizontal overflow (document={metrics['documentWidth']}, body={metrics['bodyWidth']}, viewport={width})")
                fail_if(abs(metrics["board"]["width"] - metrics["board"]["height"]) > 1,
                        f"{label}: board is not square ({metrics['board']['width']}×{metrics['board']['height']})")
                fail_if(metrics["board"]["x"] < 0 or metrics["board"]["right"] > width,
                        f"{label}: board exceeds the viewport")
                fail_if(metrics["squareCount"] != 64,
                        f"{label}: expected 64 board squares, found {metrics['squareCount']}")
                for index, square in enumerate(metrics["squareSizes"]):
                    fail_if(abs(square["width"] - square["height"]) > 1,
                            f"{label}: board square {index + 1} is not square ({square['width']}×{square['height']})")
                for name in ("controls", "clock", "history"):
                    panel = metrics[name]
                    fail_if(panel["x"] < 0 or panel["right"] > width,
                            f"{label}: {name} panel exceeds the viewport")

                if orientation == "portrait":
                    fail_if(metrics["clock"]["y"] <= metrics["board"]["bottom"],
                            f"{label}: clock should follow the board in portrait layout")
                    fail_if(metrics["history"]["y"] <= metrics["clock"]["y"],
                            f"{label}: move history should follow the clock in portrait layout")
                else:
                    fail_if(metrics["history"]["x"] <= metrics["clock"]["x"],
                            f"{label}: move history should sit beside the clock")
                    fail_if(abs(metrics["history"]["y"] - metrics["clock"]["y"]) > 1,
                            f"{label}: clock and history should share a landscape row")
                    fail_if(metrics["controls"]["x"] <= metrics["board"]["x"],
                            f"{label}: status controls should sit beside the board")

                print(f"PASS {label} ({width}×{height}): square board, 64 square cells, panels fit, no horizontal overflow")

            await page.evaluate("localStorage.clear()")
            await page.reload(wait_until="load")
            await page.locator("#whitePawn5").click()
            await page.locator('[id="45"]').click()
            saved = await page.evaluate(
                """() => {
                    const raw = localStorage.getItem('2d-chess-game:save:v1');
                    return raw ? JSON.parse(raw) : null;
                }"""
            )
            fail_if(saved is None, "A completed move was not saved to browser storage")
            fail_if(saved["state"]["turn"] != "black", "Saved state did not record the next side to move")
            fail_if(not any(piece["name"] == "whitePawn5" and piece["position"] == 45 for piece in saved["state"]["pieces"]),
                    "Saved state did not record the pawn's moved position")

            await page.reload(wait_until="load")
            await page.locator("#resume-saved-game").click()
            restored = await page.evaluate(
                """() => ({
                    turn: document.querySelector('#turn').textContent.trim(),
                    pawnRestored: Boolean(document.querySelector('[id="45"] img#whitePawn5')),
                    moveCount: document.querySelectorAll('#move-list > div').length,
                })"""
            )
            fail_if(restored["turn"] != "Black's Turn", "Refresh did not restore the side to move")
            fail_if(not restored["pawnRestored"], "Refresh did not restore the moved piece to its saved square")
            fail_if(restored["moveCount"] != 1, "Refresh did not restore the move history")

            await page.locator("#blackPawn5").click()
            await page.locator('[id="55"]').click()
            replayed = await page.evaluate(
                """() => JSON.parse(localStorage.getItem('2d-chess-game:save:v1'))"""
            )
            fail_if(replayed["state"]["turn"] != "white", "A move after refresh did not advance the saved turn")
            fail_if(len(replayed["state"]["moveHistory"]) != 2, "A move after refresh did not extend saved history")

            await page.evaluate("window.confirm = () => true")
            await page.locator("#new-game").click()
            await page.wait_for_load_state("load")
            saved_after_reset = await page.evaluate("localStorage.getItem('2d-chess-game:save:v1')")
            fail_if(saved_after_reset is not None, "Starting a new game did not clear the saved in-progress game")
            print("PASS autosave and refresh restore: board, turn, and history survive reload and continue")

            await page.evaluate(
                """() => {
                    const positionKey = JSON.stringify([
                        'white',
                        'black:king:85,white:king:15,white:queen:81',
                        'white:-,black:-',
                        null,
                    ]);
                    const save = {
                        schema: '2d-chess-game',
                        version: 1,
                        savedAt: new Date().toISOString(),
                        state: {
                            turn: 'white',
                            pieces: [
                                { name: 'whiteKing', rank: 'king', color: 'white', position: 15, ableToCastle: false },
                                { name: 'blackKing', rank: 'king', color: 'black', position: 85, ableToCastle: false },
                                { name: 'whiteQueenPromoted1', rank: 'queen', color: 'white', position: 81 },
                            ],
                            enPassantTarget: null,
                            enPassantPawn: null,
                            halfmoveClock: 0,
                            moveHistory: ['1. a8=Q'],
                            positionCounts: [[positionKey, 1]],
                            lastMove: [71, 81],
                            clock: {
                                whiteMilliseconds: 120000,
                                blackMilliseconds: 90000,
                                incrementMilliseconds: 1000,
                                activeColor: 'white',
                                running: false,
                                flaggedColor: null,
                            },
                        },
                    };
                    localStorage.setItem('2d-chess-game:save:v1', JSON.stringify(save));
                }"""
            )
            await page.reload(wait_until="load")
            await page.locator("#resume-saved-game").click()
            promoted_restore = await page.evaluate(
                """() => ({
                    promotedRank: game.pieces.find(piece => piece.name === 'whiteQueenPromoted1')?.rank,
                    promotedImage: document.querySelector('[id="81"] img#whiteQueenPromoted1')?.getAttribute('src'),
                    capturedInTray: Boolean(document.querySelector('#whiteSematary .rook img#whiteRook1')),
                    whiteClock: document.querySelector('#white-clock').textContent,
                    activeClock: game.clock?.activeColor,
                })"""
            )
            fail_if(promoted_restore["promotedRank"] != "queen", "Refresh did not restore the promoted piece type")
            fail_if(not promoted_restore["promotedImage"].endswith("whiteQueen.png"), "Refresh did not restore the promoted piece image")
            fail_if(not promoted_restore["capturedInTray"], "Refresh did not restore a captured piece to its graveyard tray")
            fail_if(promoted_restore["whiteClock"] != "2:00", "Refresh did not restore the saved clock time")
            fail_if(promoted_restore["activeClock"] != "white", "Refresh did not restore the clock's active side")
            await page.locator("#clear-saved-game").click()
            cleared_snapshot = await page.evaluate("localStorage.getItem('2d-chess-game:save:v1')")
            fail_if(cleared_snapshot is not None, "Clear Saved Game did not remove browser storage")
            fail_if(await page.locator('[id="81"] img#whiteQueenPromoted1').count() != 1,
                    "Clearing a save should not discard the currently restored game")

            await page.evaluate("localStorage.setItem('2d-chess-game:save:v1', serializeGameSave(game))")
            await page.reload(wait_until="load")
            await page.locator("#start-new-from-save").click()
            fresh_snapshot = await page.evaluate("localStorage.getItem('2d-chess-game:save:v1')")
            fail_if(fresh_snapshot is not None, "Start New Game from the resume prompt did not clear the saved game")
            fail_if(await page.locator('[id="15"] img#whiteKing').count() != 1,
                    "Start New Game from the resume prompt did not leave a fresh board")

            await page.evaluate("localStorage.setItem('2d-chess-game:save:v1', '{broken')")
            await page.reload(wait_until="load")
            corrupt_recovery = await page.evaluate("""() => ({
                status: document.querySelector('#save-status').textContent,
                save: localStorage.getItem('2d-chess-game:save:v1'),
            })""")
            fail_if(corrupt_recovery["save"] is not None, "Corrupt save was not removed")
            fail_if("unreadable" not in corrupt_recovery["status"].lower(), "Corrupt save recovery was not announced")
            await page.locator("#whitePawn5").click()
            await page.locator('[id="45"]').click()
            fail_if(await page.locator('[id="45"] img#whitePawn5').count() != 1,
                    "Corrupt saved data prevented a new move")

            await page.evaluate("localStorage.setItem('2d-chess-game:save:v1', JSON.stringify({schema:'2d-chess-game',version:0}))")
            await page.reload(wait_until="load")
            outdated_recovery = await page.evaluate("""() => ({
                status: document.querySelector('#save-status').textContent,
                save: localStorage.getItem('2d-chess-game:save:v1'),
            })""")
            fail_if(outdated_recovery["save"] is not None, "Outdated save was not removed")
            fail_if("unsupported" not in outdated_recovery["status"].lower(), "Outdated save recovery was not announced")

            fen_position = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 42"
            fen_loaded = await page.evaluate("fen => game.loadFEN(fen)", fen_position)
            fail_if(not fen_loaded, "A valid FEN position could not initialize the board")
            loaded_fen_state = await page.evaluate("""() => ({
                fen: game.toFEN(),
                turn: document.querySelector('#turn').textContent.trim(),
                pieceCount: game.pieces.length,
                enPassantPawn: game.enPassantPawn?.name,
            })""")
            fail_if(loaded_fen_state["fen"] != fen_position, "Imported FEN fields did not survive board initialization")
            fail_if(loaded_fen_state["turn"] != "Black's Turn", "Imported FEN active color did not update the board")
            fail_if(loaded_fen_state["pieceCount"] != 32, "Imported FEN did not restore all pieces")
            fail_if(loaded_fen_state["enPassantPawn"] != "whitePawn5", "Imported FEN did not link the en-passant pawn")
            invalid_fen_result = await page.evaluate("""() => {
                const before = game.toFEN();
                return { accepted: game.loadFEN('not a FEN'), before, after: game.toFEN() };
            }""")
            fail_if(invalid_fen_result["accepted"], "Malformed FEN should not load")
            fail_if(invalid_fen_result["before"] != invalid_fen_result["after"], "Failed FEN parsing replaced the current board")
            print("PASS valid FEN initializes board, active side, rights, en-passant, and counters safely")
            await page.evaluate("localStorage.removeItem('2d-chess-game:save:v1')")
            await page.reload(wait_until="load")

            await page.evaluate("Storage.prototype.setItem = function() { throw new DOMException('blocked', 'QuotaExceededError'); }; true")
            await page.locator("#whitePawn5").click()
            await page.locator('[id="45"]').click()
            write_warning = await page.locator("#save-status").text_content()
            fail_if("could not save" not in write_warning.lower(), "Unavailable write did not announce the autosave failure")
            fail_if(await page.locator('[id="45"] img#whitePawn5').count() != 1,
                    "Unavailable storage interrupted the current move")
            print("PASS promoted-piece, clock, recovery, explicit resume, clear-save, and start-new behavior")

            fail_if(page_errors, "Browser reported page errors: " + "; ".join(page_errors))
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
