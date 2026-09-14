import { describe, it, expect } from "vitest";
import {
  LEADERBOARD_SIZE,
  ScoreEntry,
  qualifies,
  insertScore,
  cleanName,
} from "./leaderboard";

const entry = (score: number, name = "AAA"): ScoreEntry => ({
  name,
  score,
  lines: 0,
  level: 1,
  date: "2026-01-01T00:00:00.000Z",
});

describe("qualifies", () => {
  it("rejects a score of zero", () => {
    expect(qualifies([], 0)).toBe(false);
  });

  it("accepts any positive score while the board has fewer than 10 entries", () => {
    expect(qualifies([entry(100000)], 1)).toBe(true);
  });

  it("only accepts a score beating the 10th place on a full board", () => {
    const full = Array.from({ length: LEADERBOARD_SIZE }, (_, i) =>
      entry((LEADERBOARD_SIZE - i) * 100)
    ); // 1000 … 100
    expect(qualifies(full, 100)).toBe(false);
    expect(qualifies(full, 101)).toBe(true);
  });
});

describe("insertScore", () => {
  it("returns rank -1 and leaves the board untouched when not qualifying", () => {
    const full = Array.from({ length: LEADERBOARD_SIZE }, (_, i) =>
      entry((LEADERBOARD_SIZE - i) * 100)
    );
    const { entries, rank } = insertScore(full, entry(50));
    expect(rank).toBe(-1);
    expect(entries).toBe(full);
  });

  it("sorts scores descending and reports the new rank", () => {
    const { entries, rank } = insertScore(
      [entry(500, "BBB"), entry(100, "CCC")],
      entry(300, "DDD")
    );
    expect(rank).toBe(1);
    expect(entries.map((e) => e.name)).toEqual(["BBB", "DDD", "CCC"]);
  });

  it("keeps only the top 10", () => {
    const ten = Array.from({ length: LEADERBOARD_SIZE }, (_, i) =>
      entry((LEADERBOARD_SIZE - i) * 100)
    );
    const { entries, rank } = insertScore(ten, entry(99999, "NEW"));
    expect(rank).toBe(0);
    expect(entries).toHaveLength(LEADERBOARD_SIZE);
    expect(entries.map((e) => e.name)).toEqual([
      "NEW",
      ...ten.map((e) => e.name).slice(0, LEADERBOARD_SIZE - 1),
    ]);
  });

  it("does not mutate the input", () => {
    const board = [entry(100)];
    insertScore(board, entry(200));
    expect(board).toEqual([entry(100)]);
  });
});

describe("cleanName", () => {
  it("keeps letters and spaces, uppercases, and caps at 12 characters", () => {
    expect(cleanName("ab12c d!")).toBe("ABC D");
    expect(cleanName("123")).toBe("");
    expect(cleanName("x")).toBe("X");
    expect(cleanName("alice")).toBe("ALICE");
  });

  it("collapses runs of spaces and trims the ends", () => {
    expect(cleanName("  bo b  smith  ")).toBe("BO B SMITH");
  });
});
