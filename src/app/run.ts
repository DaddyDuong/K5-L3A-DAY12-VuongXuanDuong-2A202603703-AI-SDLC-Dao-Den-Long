#!/usr/bin/env node
// `run_cmd` (Test Contract v1.3): serves the built game and opens it in the browser; the leaderboard lives in a JSON
// file on the local disk (Ticket-04 §3, P4-A16).
//   node dist-headless/app/run.js [--port 4173] [--no-open]
//   node dist-headless/app/run.js --export-leaderboard out.json     → {"entries": [...]} top 10 in order, exit 0
// Exit codes: 0 ok, 1 bad arguments / IO error.
import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leaderboardApi, leaderboardFile, readLeaderboard, startServer, webDir } from "./server.js";

const USAGE = "usage: run [--port <int>] [--no-open] | run --export-leaderboard <out.json>";

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    const p = spawn(cmd, args, { stdio: "ignore", detached: true });
    p.on("error", () => console.log(`Mở trình duyệt tại: ${url}`));
    p.unref();
  } catch {
    console.log(`Mở trình duyệt tại: ${url}`);
  }
}

async function main(argv: string[]): Promise<number> {
  let exportTo: string | undefined;
  let port = 4173;
  let open = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--export-leaderboard") {
      exportTo = argv[++i];
      if (!exportTo) return usage("--export-leaderboard needs a file name");
    } else if (a === "--port") {
      port = Number(argv[++i]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return usage("--port must be 1–65535");
    } else if (a === "--no-open") open = false;
    else return usage(`unexpected argument '${a}'`);
  }

  if (exportTo !== undefined) {
    try {
      writeFileSync(exportTo, JSON.stringify({ entries: readLeaderboard() }, null, 2) + "\n");
    } catch (e) {
      process.stderr.write(`error: cannot write '${exportTo}': ${(e as Error).message}\n`);
      return 1;
    }
    return 0;
  }

  if (!existsSync(join(webDir(), "index.html"))) {
    process.stderr.write(`error: ${webDir()} has no index.html — run "npm run build" first\n`);
    return 1;
  }
  const { url } = await startServer({ "/api/leaderboard": leaderboardApi }, port);
  console.log(`Đảo Đèn Lồng đang chạy tại ${url}  (Ctrl+C để tắt)`);
  console.log(`Bảng xếp hạng lưu ở ${leaderboardFile()}`);
  if (open) openBrowser(url);
  return -1; // keep serving
}

function usage(msg: string): number {
  process.stderr.write(`error: ${msg}\n${USAGE}\n`);
  return 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exitCode = code;
  },
  (e: Error) => {
    process.stderr.write(`error: ${e.message}\n`);
    process.exitCode = 1;
  },
);
