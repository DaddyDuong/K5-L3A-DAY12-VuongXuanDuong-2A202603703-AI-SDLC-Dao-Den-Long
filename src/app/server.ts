// Small zero-dependency HTTP server for the built web game (dist-web), used by `run_cmd` (play + leaderboard on disk)
// and by `bench_cmd` (receives the frame times). Node built-ins only, so the release needs nothing but Node ≥ 18.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEntry, insertEntry, isoLocal, parseStored, type LeaderboardEntry } from "./leaderboard.js";

/** dist-web next to dist-headless (repo and release layout); `DDL_WEB_DIR` overrides. */
export function webDir(): string {
  return process.env.DDL_WEB_DIR ?? fileURLToPath(new URL("../../dist-web/", import.meta.url));
}

/** P4-A16: per-user data directory on the local disk; `DDL_DATA_DIR` overrides (tests). */
export function dataDir(): string {
  if (process.env.DDL_DATA_DIR) return process.env.DDL_DATA_DIR;
  const home = homedir();
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "dao-den-long");
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "dao-den-long");
  return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "dao-den-long");
}

export const leaderboardFile = () => join(dataDir(), "leaderboard.json");

export function readLeaderboard(): LeaderboardEntry[] {
  let text: string;
  try {
    text = readFileSync(leaderboardFile(), "utf8");
  } catch {
    return []; // no file yet
  }
  try {
    return parseStored(JSON.parse(text));
  } catch {
    return []; // unreadable file: start a fresh board (the next save overwrites it)
  }
}

function writeLeaderboard(entries: LeaderboardEntry[]): void {
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${leaderboardFile()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ entries }, null, 2) + "\n");
  renameSync(tmp, leaderboardFile()); // atomic replace: a crash never leaves half a file
}

/** Saves a score. `achieved_at` is set by the server clock (P4-A21). */
export function saveScore(body: unknown): { entries: LeaderboardEntry[]; entry: LeaderboardEntry } | string {
  const e = checkEntry({ ...(body as object), achieved_at: isoLocal() });
  if (typeof e === "string") return e;
  const entries = insertEntry(readLeaderboard(), e);
  writeLeaderboard(entries);
  return { entries, entry: e };
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function readBody(req: IncomingMessage, limit = 8 << 20): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        fail(new Error("body too large"));
        req.destroy();
      } else parts.push(c);
    });
    req.on("end", () => ok(Buffer.concat(parts).toString("utf8")));
    req.on("error", fail);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Leaderboard API: GET → {entries, storage}; POST {name, score, nights_won, seed} → {entries, entry}. */
export async function leaderboardApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET") return sendJson(res, 200, { entries: readLeaderboard(), storage: leaderboardFile() });
  if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" });
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req, 1 << 16));
  } catch {
    return sendJson(res, 400, { error: "invalid JSON" });
  }
  const r = saveScore(body);
  if (typeof r === "string") return sendJson(res, 400, { error: r });
  sendJson(res, 200, r);
}

export type Route = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

/** Static files from dist-web plus extra API routes. Listens on 127.0.0.1, trying `port`, port+1, … */
export async function startServer(routes: Record<string, Route>, port: number): Promise<{ server: Server; url: string }> {
  const root = resolve(webDir());
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    const route = routes[path];
    if (route) {
      Promise.resolve(route(req, res)).catch((e: Error) => sendJson(res, 500, { error: e.message }));
      return;
    }
    const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = readFileSync(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });
  for (let p = port; p < port + 20; p++) {
    const ok = await new Promise<boolean>((done) => {
      server.once("error", () => done(false));
      server.listen(p, "127.0.0.1", () => done(true));
    });
    if (ok) return { server, url: `http://127.0.0.1:${p}/` };
  }
  throw new Error(`no free port in ${port}–${port + 19}`);
}
