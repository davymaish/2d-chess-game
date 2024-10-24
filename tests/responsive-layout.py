#!/usr/bin/env python3
"""Browser-level responsive layout smoke checks for representative devices."""

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

            fail_if(page_errors, "Browser reported page errors: " + "; ".join(page_errors))
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
