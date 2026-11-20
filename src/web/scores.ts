// Ticket-04 §3 leaderboard client. With `run_cmd` (or `npm run dev`) the board lives in a JSON file on the local disk
// behind /api/leaderboard; when the page is served by another static server it falls back to this browser's storage
// (P4-A16) and says so on screen.
import { insertEntry, isoLocal, normalizeName, parseStored, type LeaderboardEntry } from "../app/leaderboard.js";

export type Where = "disk" | "browser";
export interface Board {
  entries: LeaderboardEntry[];
  where: Where;
  storage?: string;
}

const LOCAL_KEY = "dao-den-long.leaderboard.v1";

function readLocal(): LeaderboardEntry[] {
  try {
    return parseStored(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}"));
  } catch {
    return [];
  }
}

export async function loadBoard(): Promise<Board> {
  try {
    const r = await fetch("api/leaderboard", { cache: "no-store" });
    if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) {
      const j = (await r.json()) as { entries: unknown; storage?: string };
      return { entries: parseStored(j), where: "disk", storage: j.storage };
    }
  } catch {
    /* no server API */
  }
  return { entries: readLocal(), where: "browser" };
}

export type SaveResult = { ok: true; entries: LeaderboardEntry[]; entry: LeaderboardEntry; where: Where } | { ok: false; error: string };

export async function saveScore(e: { name: string; score: number; nights_won: number; seed: number }): Promise<SaveResult> {
  const name = normalizeName(e.name);
  if (name === null) return { ok: false, error: "Tên cần 3–12 ký tự: chữ, số hoặc _ (không dấu cách)." };
  try {
    const r = await fetch("api/leaderboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...e, name }),
    });
    if ((r.headers.get("content-type") ?? "").includes("json")) {
      const j = (await r.json()) as { entries?: LeaderboardEntry[]; entry?: LeaderboardEntry; error?: string };
      if (r.ok && j.entries && j.entry) return { ok: true, entries: j.entries, entry: j.entry, where: "disk" };
      if (r.status === 400) return { ok: false, error: j.error ?? "Không lưu được." };
    }
  } catch {
    /* fall back to the browser */
  }
  const entry: LeaderboardEntry = { ...e, name, achieved_at: isoLocal() };
  const entries = insertEntry(readLocal(), entry);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ entries }));
  } catch {
    return { ok: false, error: "Trình duyệt không cho lưu dữ liệu." };
  }
  return { ok: true, entries, entry, where: "browser" };
}
