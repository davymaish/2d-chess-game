import { describe, expect, it } from "vitest";
import { parsePGN, serializePGN } from "../src/index.js";

describe("PGN import preview and export", () => {
  it("parses escaped headers and a numbered SAN main line", () => {
    const parsed = parsePGN('[Event "Club"]\n[White "Ada \\\"Ace\\\""]\n[Result "1-0"]\n\n1.e4 e5 2.Nf3 Nc6 1-0');
    expect(parsed.headers).toMatchObject({ Event: "Club", White: 'Ada "Ace"', Result: "1-0" });
    expect(parsed.moves).toEqual(["1. e4", "1... e5", "2. Nf3", "2... Nc6"]);
    expect(parsed.result).toBe("1-0");
  });

  it("starts move numbering and color from the FEN tag", () => {
    const parsed = parsePGN('[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 42"]\n\n42...e5 43.Nf3 *');
    expect(parsed.moves).toEqual(["42... e5", "43. Nf3"]);
    expect(parsed.startingPosition.fullmoveNumber).toBe(42);
    expect(parsed.startingPosition.activeColor).toBe("black");
  });

  it("ignores comments, annotations, NAGs, and side variations while retaining mainline", () => {
    const parsed = parsePGN("1. e4! {King's pawn} e5\n2. Nf3 $1 Nc6 ; ignored tail\n3. Bb5!? (3. Bc4 Nf6 (3... Bc5)) 3...a6 1/2-1/2");
    expect(parsed.moves).toEqual(["1. e4", "1... e5", "2. Nf3", "2... Nc6", "3. Bb5", "3... a6"]);
    expect(parsed.result).toBe("1/2-1/2");
  });

  it("rejects malformed tags, invalid SAN tokens, numbering, result conflicts, and unclosed comments", () => {
    expect(() => parsePGN("[Event Bad]\n\n1. e4 *")).toThrow(/Invalid PGN tag pair/i);
    expect(() => parsePGN("1. e2e4 *")).toThrow(/Invalid SAN token/i);
    expect(() => parsePGN("1. e4 2... e5 *")).toThrow(/do not follow/i);
    expect(() => parsePGN('[Result "1-0"]\n\n1. e4 0-1')).toThrow(/does not match/i);
    expect(() => parsePGN("1. e4 xyz *")).toThrow(/Invalid SAN token/i);
    expect(() => parsePGN("1. e4 {unfinished *")).toThrow(/unterminated brace comment/i);
    expect(() => parsePGN("1. e4 (1. d4 *")).toThrow(/unterminated variation/i);
    expect(() => parsePGN("1. e4 * extra")).toThrow(/after the result/i);
  });

  it("exports the standard tag roster, numbered moves, and unfinished result", () => {
    const output = serializePGN({ moveHistory: [] });
    expect(output).toBe([
      '[Event "Casual Game"]', '[Site "Local"]', '[Date "????.??.??"]', '[Round "-"]',
      '[White "White"]', '[Black "Black"]', '[Result "*"]', "", "*",
    ].join("\n"));
    expect(serializePGN({ moveHistory: ["1. e4", "1... e5", "2. Nf3", "2... Nc6"], resultToken: "1-0" }, { White: "Ada", Event: "Open" }))
      .toContain('[Event "Open"]');
  });

  it("round-trips special SAN strings and all supported result markers", () => {
    const moves = ["1. exd6", "1... Nbc4", "2. O-O", "2... O-O-O", "3. gxh8=Q+", "3... Qh4#"];
    for (const resultToken of ["1-0", "0-1", "1/2-1/2", "*"] as const) {
      const text = serializePGN({ moveHistory: moves, resultToken }, { Event: "Notation fixture" });
      const imported = parsePGN(text);
      expect(imported.moves).toEqual(moves);
      expect(imported.result).toBe(resultToken);
      expect(imported.headers.Event).toBe("Notation fixture");
    }
  });

  it("escapes header values and wraps long movetext at word boundaries", () => {
    const text = serializePGN({ moveHistory: [] }, { White: 'Ada "Ace" \\ Player', Annotator: "A\nReviewer" });
    expect(text).toContain('[White "Ada \\\"Ace\\\" \\\\ Player"]');
    expect(text).toContain('[Annotator "A Reviewer"]');
    const longHistory = Array.from({ length: 80 }, (_, index) => {
      const number = Math.floor(index / 2) + 1;
      return index % 2 === 0 ? `${number}. Nf3` : `${number}... Nc6`;
    });
    const movetext = serializePGN({ moveHistory: longHistory }).split("\n\n")[1]!;
    expect(movetext.split("\n").every((line) => line.length <= 80)).toBe(true);
    expect(movetext.endsWith(" *")).toBe(true);
  });

  it("rejects malformed move histories, result tokens, and tag names", () => {
    expect(() => serializePGN({ moveHistory: ["e4"] })).toThrow(/numbered SAN notation/i);
    expect(() => serializePGN({ moveHistory: ["1. e2e4"] })).toThrow(/invalid SAN token/i);
    expect(() => serializePGN({ moveHistory: ["1. e4", "2... e5"] })).toThrow(/does not follow/i);
    expect(() => serializePGN({ moveHistory: [], resultToken: "win" as never })).toThrow(/PGN result/i);
    expect(() => serializePGN({ moveHistory: [] }, { "Bad Tag": "x" })).toThrow(/Invalid PGN header name/i);
  });

  it("parses preview data without pretending to play or apply the imported moves", () => {
    const parsed = parsePGN("1. e4 e5 *");
    expect(parsed.moves).toEqual(["1. e4", "1... e5"]);
    expect(parsed.startingPosition.fullmoveNumber).toBe(1);
    expect(parsed.startingPosition.pieces).toHaveLength(32);
  });
});
