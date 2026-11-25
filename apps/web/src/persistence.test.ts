import { describe, expect, it } from "vitest";
import { parseFEN, parseSquare } from "@2d-chess/chess-core";
import { createChessClock, startClock } from "./clock.js";
import { createGameSession, playSessionMove } from "./session.js";
import {
  GAME_SAVE_MAX_BYTES,
  GAME_SAVE_STORAGE_KEY,
  GAME_SAVE_VERSION,
  LEGACY_V1_SAVE_STORAGE_KEY,
  createGameSaveSnapshot,
  inspectGameSaveStorage,
  parseGameSave,
  saveGameToStorage,
  serializeGameSave,
} from "./persistence.js";
import type { StorageLike } from "./persistence.js";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function advance(session: ReturnType<typeof createGameSession>, from: string, to: string) {
  const result = playSessionMove(session, { from: parseSquare(from)!, to: parseSquare(to)! });
  if (result.kind !== "accepted") throw new Error(`Expected legal test move; got ${result.reason}`);
  return result.session;
}

describe("versioned V2 local save", () => {
  it("round-trips a validated position, structured history, and clock state", () => {
    const session = advance(advance(createGameSession(), "e2", "e4"), "e7", "e5");
    const snapshot = createGameSaveSnapshot(session, "blitz-5-0", createChessClock("blitz-5-0", "white"), "2026-11-25T06:00:00.000Z");
    expect(snapshot.schema).toBe("2d-chess-game-v2");
    expect(snapshot.version).toBe(GAME_SAVE_VERSION);
    const restored = parseGameSave(serializeGameSave(snapshot));
    expect(restored.session.cursor).toBe(2);
    expect(restored.session.snapshots).toHaveLength(3);
    expect(restored.session.snapshots[2]!.position.activeColor).toBe("white");
    expect(restored.clock.running).toBe(false);
    expect(restored.clock.lastTickAt).toBeNull();
  });

  it("checkpoints a running clock at the save time and restores it paused without offline deduction", () => {
    const running = startClock(createChessClock("blitz-5-0"), 1000);
    const storage = new MemoryStorage();
    expect(saveGameToStorage(createGameSession(), "blitz-5-0", running, storage, 6100).status).toBe("saved");
    const restored = inspectGameSaveStorage(storage);
    expect(restored.status).toBe("available");
    if (restored.status === "available") {
      expect(restored.save.clock.whiteMilliseconds).toBe(294900);
      expect(restored.save.clock.running).toBe(false);
      expect(restored.save.clock.started).toBe(true);
    }
  });

  it("saves to a separate V2 key and detects legacy V1 data without modifying it", () => {
    const storage = new MemoryStorage();
    const legacy = '{"schema":"2d-chess-game","version":1}';
    storage.setItem(LEGACY_V1_SAVE_STORAGE_KEY, legacy);
    const inspection = inspectGameSaveStorage(storage);
    expect(inspection.status).toBe("legacy");
    expect(storage.getItem(LEGACY_V1_SAVE_STORAGE_KEY)).toBe(legacy);
    expect(storage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });

  it("preserves malformed or unsupported V2 data instead of deleting or overwriting it", () => {
    const storage = new MemoryStorage();
    const corrupt = "{broken";
    storage.setItem(GAME_SAVE_STORAGE_KEY, corrupt);
    expect(inspectGameSaveStorage(storage).status).toBe("invalid");
    expect(saveGameToStorage(createGameSession(), "blitz-5-0", createChessClock(), storage).status).toBe("preserved");
    expect(storage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(corrupt);
    storage.setItem(GAME_SAVE_STORAGE_KEY, JSON.stringify({ schema: "2d-chess-game-v2", version: 99 }));
    expect(inspectGameSaveStorage(storage).status).toBe("outdated");
  });

  it("rejects invalid position histories and completed games", () => {
    const bad = JSON.parse(serializeGameSave(createGameSaveSnapshot(createGameSession(), "blitz-5-0", createChessClock()))) as Record<string, unknown>;
    const state = bad.state as Record<string, unknown>;
    state.moveHistory = [{ from: { file: "e", rank: 2 }, to: { file: "e", rank: 5 }, piece: { color: "white", kind: "pawn" } }];
    expect(() => parseGameSave(JSON.stringify(bad))).toThrow(/cannot be replayed|does not match/i);
    const stalemate = createGameSession(parseFEN("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"));
    expect(() => createGameSaveSnapshot(stalemate, "blitz-5-0", createChessClock("blitz-5-0", "black"))).toThrow(/Completed games/);
    const storage = new MemoryStorage();
    expect(saveGameToStorage(createGameSession(), "blitz-5-0", createChessClock(), storage).status).toBe("saved");
    expect(saveGameToStorage(stalemate, "blitz-5-0", createChessClock("blitz-5-0", "black"), storage).status).toBe("cleared");
    expect(storage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });

  it("reports blocked storage without throwing or removing saved data", () => {
    const blockedRead: StorageLike = {
      getItem() { throw new Error("storage blocked"); },
      setItem() { throw new Error("storage blocked"); },
      removeItem() { throw new Error("storage blocked"); },
    };
    expect(inspectGameSaveStorage(blockedRead).status).toBe("unavailable");
    expect(saveGameToStorage(createGameSession(), "blitz-5-0", createChessClock(), blockedRead).status).toBe("unavailable");
    const blockedWrite: StorageLike = {
      getItem() { return null; },
      setItem() { throw new Error("quota exceeded"); },
      removeItem() {},
    };
    expect(saveGameToStorage(createGameSession(), "blitz-5-0", createChessClock(), blockedWrite).status).toBe("unavailable");
  });

  it("enforces the UTF-8 256 KiB save limit", () => {
    expect(() => parseGameSave("x".repeat(GAME_SAVE_MAX_BYTES + 1))).toThrow(/256 KiB/);
    expect(() => parseGameSave("é".repeat(131073))).toThrow(/256 KiB/);
  });
});
