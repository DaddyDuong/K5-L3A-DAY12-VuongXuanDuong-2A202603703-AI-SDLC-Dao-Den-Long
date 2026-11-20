// Ticket-04 §3 local leaderboard: pure rules shared by the web game, the Node server and the export command.
export interface LeaderboardEntry {
  name: string;
  score: number;
  nights_won: number;
  /** ISO 8601 with a timezone offset, e.g. 2026-11-20T21:30:05+07:00 (P4-A21). */
  achieved_at: string;
  seed: number;
}

export const LEADERBOARD_SIZE = 10;

/**
 * P4-A20: 3–12 characters after NFC: A–Z a–z 0–9 _ and (bonus) Latin letters with Vietnamese diacritics.
 * Returns the normalised name, or null when invalid.
 */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC");
  const chars = [...name];
  if (chars.length < 3 || chars.length > 12) return null;
  return chars.every((c) => /^[A-Za-z0-9_]$/.test(c) || /^\p{Script=Latin}$/u.test(c)) ? name : null;
}

/** Validates an entry from outside (request body or file). Returns the cleaned entry or an error message. */
export function checkEntry(e: unknown): LeaderboardEntry | string {
  if (typeof e !== "object" || e === null) return "entry must be an object";
  const o = e as Record<string, unknown>;
  const name = normalizeName(o.name);
  if (name === null) return "name must be 3–12 characters: letters, digits or _";
  if (!Number.isInteger(o.score) || (o.score as number) < 0) return "score must be a non-negative integer";
  if (!Number.isInteger(o.nights_won) || (o.nights_won as number) < 0 || (o.nights_won as number) > 3) return "nights_won must be 0–3";
  if (!Number.isInteger(o.seed)) return "seed must be an integer";
  if (typeof o.achieved_at !== "string" || !ISO_TZ.test(o.achieved_at) || Number.isNaN(Date.parse(o.achieved_at))) {
    return "achieved_at must be ISO 8601 with a timezone";
  }
  return { name, score: o.score as number, nights_won: o.nights_won as number, achieved_at: o.achieved_at, seed: o.seed as number };
}

const ISO_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Inserts `entry` and keeps the top 10: score descending; equal scores → earlier `achieved_at` first; equal times →
 * the entry saved first stays above (stable sort, the new entry goes after the existing ones).
 */
export function insertEntry(list: readonly LeaderboardEntry[], entry: LeaderboardEntry): LeaderboardEntry[] {
  return sortEntries([...list, entry]).slice(0, LEADERBOARD_SIZE);
}

export function sortEntries(list: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return list
    .map((e, i) => ({ e, i, t: Date.parse(e.achieved_at) }))
    .sort((a, b) => b.e.score - a.e.score || a.t - b.t || a.i - b.i)
    .map(({ e }) => e);
}

/** Local time as ISO 8601 with the machine's offset, to the second. */
export function isoLocal(d = new Date()): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  );
}

/** Reads a stored document ({"entries": [...]}) leniently: drops invalid entries, re-sorts, keeps 10. */
export function parseStored(raw: unknown): LeaderboardEntry[] {
  const list = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return [];
  const ok = list.map(checkEntry).filter((e): e is LeaderboardEntry => typeof e !== "string");
  return sortEntries(ok).slice(0, LEADERBOARD_SIZE);
}
