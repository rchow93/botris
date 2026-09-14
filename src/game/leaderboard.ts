/**
 * All-time leaderboard — top N scores. Pure functions only; persistence
 * (a local JSON file) lives in the Electron main process.
 */
export interface ScoreEntry {
  name: string; // player name, up to 12 chars (A–Z and spaces)
  score: number;
  lines: number;
  level: number;
  date: string; // ISO timestamp of the game
}

export const LEADERBOARD_SIZE = 10;

/** Does this score make the board, given the current entries? */
export function qualifies(entries: ScoreEntry[], score: number): boolean {
  if (score <= 0) return false;
  if (entries.length < LEADERBOARD_SIZE) return true;
  return score > entries[entries.length - 1].score;
}

/**
 * Insert a score and return the top LEADERBOARD_SIZE entries plus the
 * 0-based rank it achieved (-1 when it misses the board).
 */
export function insertScore(
  entries: ScoreEntry[],
  entry: ScoreEntry
): { entries: ScoreEntry[]; rank: number } {
  if (!qualifies(entries, entry.score)) return { entries, rank: -1 };
  const merged = [...entries, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, LEADERBOARD_SIZE);
  return { entries: merged, rank: merged.indexOf(entry) };
}

/**
 * Normalise free-form text into a player name: letters and spaces only,
 * uppercased, single-spaced, capped at 12 characters.
 */
export function cleanName(raw: string): string {
  return raw
    .replace(/[^a-zA-Z ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 12);
}
