#!/usr/bin/env node
// Builds the GitHub Release asset (Ticket-04 §5, P4-A27): release/dao-den-long-v<version>-web.zip
//   dao-den-long-v<version>/run.js          → `node run.js` serves the game, opens the browser, leaderboard on disk
//   dao-den-long-v<version>/dist-web/       → the static web game (any static server also works)
//   dao-den-long-v<version>/dist-headless/  → headless CLI, soak, bench, run server (Node ≥ 18, no dependencies)
// Run `npm run build` first. Zip writer: Node zlib only (deflate + CRC-32), no external `zip` needed.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";

const version = process.argv[2] ?? "1.0.0";
const root = `dao-den-long-v${version}`;
const files = new Map(); // zip path -> Buffer

const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
for (const dir of ["dist-web", "dist-headless"]) {
  for (const f of walk(dir)) files.set(`${root}/${relative(".", f).split("\\").join("/")}`, readFileSync(f));
}
for (const f of ["LICENSE", "CREDITS.md", "CHANGELOG.md", "game.contract.json"]) files.set(`${root}/${f}`, readFileSync(f));
files.set(`${root}/package.json`, Buffer.from(JSON.stringify({ name: "dao-den-long", version, private: true, type: "module" }, null, 2) + "\n"));
files.set(`${root}/run.js`, Buffer.from(`#!/usr/bin/env node\n// Đảo Đèn Lồng v${version}: node run.js [--port 4173] [--no-open] | node run.js --export-leaderboard out.json\nimport "./dist-headless/app/run.js";\n`));
files.set(
  `${root}/HUONG-DAN.txt`,
  Buffer.from(`Đảo Đèn Lồng v${version} — bản web tĩnh

Yêu cầu: Node.js 18 trở lên, một trình duyệt có WebGL2 (Chrome, Edge, Firefox, Safari).

Chơi:
  node run.js                      mở http://127.0.0.1:4173 (tự mở trình duyệt; Ctrl+C để tắt)
  node run.js --export-leaderboard out.json     xuất Bảng xếp hạng (top 10) ra JSON

Bảng xếp hạng lưu trên đĩa: ~/.local/share/dao-den-long/leaderboard.json (Linux),
~/Library/Application Support/dao-den-long (macOS), %APPDATA%\\dao-den-long (Windows).
Thư mục dist-web/ cũng chạy được với bất kỳ server tĩnh nào (vd. "python3 -m http.server -d dist-web"),
khi đó bảng xếp hạng được lưu trong trình duyệt.

Headless (Test Contract v1.3):
  node dist-headless/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl
  node --expose-gc dist-headless/headless/soak.js --seed 7 --nights 10 --out soak.json
  node dist-headless/app/bench.js --seed 42 --duration 30 --out bench.json   (cần Chrome/Chromium; CHROME_PATH)

Mã nguồn, điều khiển và luật chơi: xem README trên GitHub.
`),
);

// --- minimal ZIP (PKZIP 2.0, deflate) ---
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const d = new Date();
const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

const local = [];
const central = [];
let offset = 0;
for (const [name, data] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
  const nameBuf = Buffer.from(name, "utf8");
  const comp = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);
  h.writeUInt16LE(0x0800, 6); // UTF-8 names
  h.writeUInt16LE(8, 8); // deflate
  h.writeUInt16LE(dosTime, 10);
  h.writeUInt16LE(dosDate, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(comp.length, 18);
  h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(nameBuf.length, 26);
  local.push(h, nameBuf, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0);
  c.writeUInt16LE(0x0314, 4); // made by Unix, v2.0
  c.writeUInt16LE(20, 6);
  c.writeUInt16LE(0x0800, 8);
  c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime, 12);
  c.writeUInt16LE(dosDate, 14);
  c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(comp.length, 20);
  c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(nameBuf.length, 28);
  c.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
  c.writeUInt32LE(offset, 42);
  central.push(c, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.size, 8);
end.writeUInt16LE(files.size, 10);
end.writeUInt32LE(cd.length, 12);
end.writeUInt32LE(offset, 16);
mkdirSync("release", { recursive: true });
const out = `release/${root}-web.zip`;
writeFileSync(out, Buffer.concat([...local, cd, end]));
console.log(`${out}: ${files.size} files, ${(statSync(out).size / 1024).toFixed(0)} KB`);
