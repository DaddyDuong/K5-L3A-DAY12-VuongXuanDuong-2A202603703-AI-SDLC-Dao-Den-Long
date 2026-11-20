# Phase 4 — Giả định, quyết định và tiêu chí nghiệm thu (Ticket-04, Contract v1.3)

Ticket chép lại ở [`ticket-04.md`](ticket-04.md). Ticket-04 là yêu cầu phi chức năng + phát hành: **không đổi luật,
số liệu hay đầu ra headless** ("Mọi yêu cầu của v1.0–v1.2 vẫn giữ nguyên"). Mọi giả định dưới đây trích câu ticket mà
nó giải thích.

## 1. Test cũ bị yêu cầu mới làm sai (sửa kèm lý do, không skip)

| Test | Kỳ vọng cũ | Kỳ vọng mới | Lý do |
|---|---|---|---|
| `contract.test.ts` › "has the required top-level fields" | `contract_version` = `"1.2"` | `"1.3"`, thêm `bench_cmd`, `soak_cmd` là chuỗi khác rỗng | §6: "`contract_version: "1.3"`" và "`game.contract.json` thêm `bench_cmd` và `soak_cmd`" |

`run_cmd` đổi từ `npm start` (Vite preview) sang `node dist-headless/app/run.js`: §3 yêu cầu
"`<run_cmd> --export-leaderboard out.json`", mà `npm start --export-leaderboard out.json` thì npm tự nuốt cờ
`--export-leaderboard` (cờ cấu hình của npm), không chuyển cho game. `npm start` vẫn còn và gọi cùng lệnh đó.
Không test nào khác đổi: luật, `tuning`, snapshot, sự kiện giữ nguyên.

## 2. Quyết định thiết kế (ADR-004: đo hiệu năng một game web)

Bối cảnh: game là web (Three.js/WebGL), không có file thực thi. Ticket cho phép điều đó ("ghi `null` nếu là bản web
không đo được và giải thích", Release "thư mục web tĩnh"). Cần một `bench_cmd` tự mở cửa sổ, tự đo, tự thoát mã 0.

Phương án đã cân nhắc:
1. **Electron** (cửa sổ thật, đo RSS bằng `app.getAppMetrics`) — bị loại: thêm ~100 MB tải về khi `npm ci`, và
   công cụ agent không được phép cài gói mới trong phiên này.
2. **Playwright/Puppeteer** — cũng là phụ thuộc mới, còn cần tải trình duyệt riêng (thêm một lệnh cài đặt).
3. **Chọn: trình chạy Node không phụ thuộc gì** (`src/app/bench.ts`). Nó phục vụ `dist-web` qua HTTP cục bộ, mở
   **Chrome/Chromium có sẵn trên máy** ở chế độ `--app` (cửa sổ không thanh địa chỉ) cỡ 1280×720 với
   `--disable-gpu-vsync --disable-frame-rate-limit`, trang chạy cảnh bench và gửi thời gian từng khung về server
   (`POST /api/bench`), trình chạy tính số đo, ghi `bench.json`, đóng trình duyệt, thoát mã 0. Cùng mã render như lúc
   chơi (`dist-web`, `NightView`), cùng `step()` như headless.

Hệ quả: cần Chrome hoặc Chromium (hoặc Edge/Brave) trên máy đo; đường dẫn tự dò, hoặc đặt `CHROME_PATH`. Không tìm thấy
trình duyệt → thoát mã 1 kèm thông báo. RSS đo được trên Linux/macOS (`ps`), trên Windows ghi `null`.

## 3. Chỗ ticket chưa nói rõ (P4-A1…A25)

### Benchmark (§1)
- **P4-A1 Cửa sổ.** "Mở cửa sổ 1280×720, không toàn màn hình": `--app=<url> --window-size=1280,720
  --force-device-scale-factor=1`; canvas luôn vẽ đúng **1280×720 px** (pixel ratio 1) dù trình quản lý cửa sổ có
  trừ thanh tiêu đề, nên khối lượng GPU đúng như cửa sổ 1280×720. Kích thước thật của vùng trang được ghi vào bằng chứng.
- **P4-A2 Vsync.** "tắt vsync nếu engine cho phép": Chromium cho phép bằng `--disable-gpu-vsync
  --disable-frame-rate-limit` → `vsync_off: true`. Bằng chứng: FPS đo được vượt tần số quét màn hình.
  Thêm `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`
  để cửa sổ bị che không bị hạ FPS.
- **P4-A3 `dt_i`.** Khoảng thời gian giữa hai callback `requestAnimationFrame` liên tiếp (`performance.now()`), mỗi
  callback = một khung (cập nhật sim + render). Khung đầu tiên của cảnh là mốc 0; khung có thời điểm < 3000 ms là khởi
  động; đo các khung tiếp theo cho tới khi `Σ dt_i ≥ duration × 1000`. `frames` = N khung đã đo.
- **P4-A4 `load_ms`.** "Từ lúc tiến trình bắt đầu": thời điểm tiến trình `bench_cmd` (Node) khởi động
  (`performance.timeOrigin`) tới khung hình đầu tiên của cảnh bench (đồng hồ epoch của trang). Gồm cả mở trình duyệt.
- **P4-A5 `peak_mem_mb`.** RSS lớn nhất, lấy mẫu mỗi 250 ms trong lúc đo, của **cả cây tiến trình** `bench_cmd`
  (Node + mọi tiến trình Chrome: browser, GPU, renderer…), cộng dồn. Cộng RSS đếm trùng trang nhớ dùng chung, nên số này
  là cận trên (thận trọng). Windows: `null` (không có `ps`), ghi lý do trong README.
- **P4-A6 Bóng Mực trong bench.** "Sinh đúng 200 Bóng Mực ở trạng thái `wander`, rải đều trên đảo (seed 42)": vị trí
  đều theo diện tích trên đĩa bán kính 38 m (cách mép đảo 40 m 2 m), sinh bằng `Rng(42)`. "Bóng Mực vẫn di chuyển theo
  luật `wander` bình thường": chúng giữ trạng thái `wander` (không chuyển `chase` vì không có người chơi, sát thương
  tắt) và đi theo luật wander của Ticket-03: tới đèn yếu (`fuel < 30`) gần nhất, không có thì tới đèn chưa sáng gần
  nhất (L4/L5). Vùng an toàn quanh L1–L3 vẫn đẩy chúng ra như luật thường.
- **P4-A7 Đom đóm bench.** 100 con, rải đều trên đĩa 38 m bằng cùng `Rng(42)` (sau Bóng Mực). Không nhặt được.
- **P4-A8 Tắt trong bench.** Bước 2 (hao dầu), 4 (nhặt), 9 (chạm), 10 (sinh), 11 (thắng/thua) không chạy; không có
  input nên bước 3/5/7 không làm gì. Đồng hồ Đêm vẫn chạy nhưng không kết thúc Đêm. Cờ `bench` chỉ bật trong cảnh bench,
  không đổi gì ở headless.
- **P4-A9 Camera.** Vòng tròn tâm (0,0,0), r 30, Y 15, nhìn (0,0,0), góc θ = 2π·t/15 s (t = thời gian thật từ khung
  đầu của cảnh), vị trí `(30 cos θ, 15, 30 sin θ)`. "Ngược chiều kim đồng hồ khi nhìn từ trên xuống" theo đúng quy ước
  góc của bản đồ chuẩn Ticket-02 (đèn Đêm 1 ở góc 90° là `(0, 0, 25)`: `x = r cos θ, z = r sin θ`, A3).
- **P4-A10 "Đầy đủ hiệu ứng và ánh sáng".** Cùng `NightView` lúc chơi (đèn điểm, quầng sáng, sương, sao, biển mây),
  HUD hiện như lúc chơi; âm thanh tắt (không có thao tác người dùng để mở WebAudio). Game không có thực thể sáng tạo
  thêm, nên không có gì phải tắt thêm.

### Soak (§2)
- **P4-A11 Seed.** "Đêm thứ i dùng seed `7 + i`" với i đếm từ 0: Đêm đầu dùng đúng `--seed`, rồi 8, 9, … (`--seed 7
  --nights 10` → 7…16). Đêm thứ i là Đêm `(i mod 3) + 1`.
- **P4-A12 Input ngẫu nhiên.** Một `Rng` riêng cho input, seed từ seed của Đêm. Tick chia hết cho 30: hướng mới
  `[sin a, cos a]`, `a` đều trong [0, 2π). Mỗi tick, mỗi nút một phép thử độc lập: nhảy 5%, lướt 3%, tỏa sáng 2%, tương
  tác 10%. Nút trong contract là kích theo cạnh nhấn, nên hai tick liền nhau cùng "nhấn" tính một lần. Không bấm tạm dừng.
- **P4-A13 Chạy tới đâu.** Tới khi Đêm kết thúc, tối đa thời lượng chuẩn × 60 tick (luật bình minh luôn kết thúc Đêm
  ở tick đó). Mỗi tick vẫn tạo dòng sự kiện và snapshot mỗi 10 tick (như CLI) để chạy cả đường xuất JSONL, nhưng
  không giữ lại.
- **P4-A14 Crash.** Một ngoại lệ ném ra trong một Đêm = 1 crash; ghi `"crash"` vào `results` và chạy tiếp Đêm sau.
- **P4-A15 Bộ nhớ.** RSS (`process.memoryUsage().rss`) đo sau một lần GC đầy đủ (`soak_cmd` chạy Node với
  `--expose-gc`): `mem_start_mb` sau khi tạo xong thế giới Đêm đầu; `mem_end_mb` sau khi Đêm cuối kết thúc và thế giới
  được bỏ đi ("reset xong"). GC trước khi đo để rác chưa dọn không bị tính là rò rỉ; nếu thiếu `--expose-gc` vẫn chạy.
  MB = 2²⁰ byte, làm tròn 0.1. `duration_s` = thời gian thật, làm tròn 0.1.

### Bảng xếp hạng (§3)
- **P4-A16 "Lưu trên đĩa cục bộ".** File `leaderboard.json` trong thư mục dữ liệu người dùng: Linux
  `$XDG_DATA_HOME/dao-den-long` (mặc định `~/.local/share/dao-den-long`), macOS `~/Library/Application Support/dao-den-long`,
  Windows `%APPDATA%\dao-den-long`; biến `DDL_DATA_DIR` đổi được (test dùng thư mục tạm). Game chạy qua `run_cmd` (server
  Node) đọc/ghi file này qua `GET/POST /api/leaderboard`; `npm run dev` cũng có cùng API. Nếu trang được phục vụ bởi
  server khác (thư mục web tĩnh), game dùng `localStorage` và báo rõ trên màn Bảng xếp hạng.
- **P4-A17 `score` và `nights_won`.** "tổng điểm các Đêm đã thắng" trong lượt chơi hiện tại (như tổng ở màn Bình
  Minh; chơi lại và thắng một Đêm thì lấy điểm cao nhất của Đêm đó). `nights_won` = số Đêm khác nhau đã thắng (0–3).
- **P4-A18 `seed`.** Một lượt chơi dùng một seed cho mọi Đêm (chọn khi bấm "Bắt đầu hành trình" hoặc chọn Đêm từ menu;
  `?seed=` ghi đè). Mục lưu ghi seed đó (số nguyên). Với `?seed=a,b,c` ghi seed của Đêm đầu tiên của lượt.
- **P4-A19 Khi nào cho nhập tên.** Ở màn kết quả thua (mọi Đêm) và màn Bình Minh; mỗi màn lưu được một lần. Không có ở
  chế độ phát lại (replay) để bot không ghi vào bảng.
- **P4-A20 Tên.** 3–12 ký tự sau chuẩn hóa NFC, gồm `A–Z a–z 0–9 _` và (điểm cộng) chữ Latin có dấu tiếng Việt
  (`Đức_99` hợp lệ). Không có khoảng trắng. Server kiểm lại.
- **P4-A21 `achieved_at`.** Giờ máy chạy server lúc lưu, ISO 8601 có múi giờ tới giây, ví dụ `2026-11-20T21:30:05+07:00`.
  Bằng điểm: `achieved_at` sớm hơn đứng trên; cùng thời điểm thì mục lưu trước đứng trên. Giữ 10 mục.
- **P4-A22 Lệnh xuất.** `node dist-headless/app/run.js --export-leaderboard out.json` ghi `{"entries":[…]}` (mỗi mục
  đúng 5 trường, đúng thứ tự), thoát 0, không mở server. Bảng rỗng → `{"entries":[]}`. Lỗi đọc/ghi → mã 1.

### Dễ tiếp cận (§4)
- **P4-A23 Đổi phím.** 9 hành động: tiến, lùi, trái, phải, nhảy, lướt, tương tác, tỏa sáng, tạm dừng. Bấm một phím đã
  gán cho hành động khác → không gán, hiện "Phím X đang dùng cho Y". Esc hủy khi đang chờ phím và luôn là phím
  tạm dừng/quay lại (phím hệ thống, không gán được); ← → xoay camera và chuột không nằm trong danh sách của ticket nên
  giữ cố định. Lưu cùng cài đặt (`localStorage`); nút "Khôi phục mặc định".
- **P4-A24 Phụ đề / chỉ báo.** Dòng phụ đề (bật mặc định, tắt được) cho: Bóng Mực xuất hiện (+ mũi tên ở mép màn hình
  chỉ về con đó 4 s khi nó ngoài màn hình), gió mạnh sắp thổi, 10 s cuối (đếm từng giây), đèn có `fuel < 30` (khi dầu
  vừa xuống dưới 30, + mũi tên mép màn hình tới đèn đó khi nó ngoài màn hình).
- **P4-A25 Giảm chuyển động.** Tắt rung camera (thêm ở Phase 4: rung nhẹ khi bị chạm/rơi), viền đỏ chớp khi bị chạm,
  chớp sáng khi thắp đèn, nhấp nháy đồng hồ 30 s cuối và nhấp nháy Mây khi bất tử (thay bằng bán trong suốt). Nhấp nháy
  1 Hz của đèn dầu < 30 giữ nguyên vì là yêu cầu Ticket-03.
- **P4-A26 Cỡ chữ.** Mọi chữ UI ≥ 18 px (chữ gốc 18 px, tính theo `rem`); "Chữ lớn" nhân 1.25 (22.5 px).

### Đóng gói (§5)
- **P4-A27 Release.** `dao-den-long-v1.0.0-web.zip`: thư mục web tĩnh `dist-web/` + `run.js` (server Node ≥ 18, không
  phụ thuộc) + hướng dẫn. Chơi: giải nén, `node run.js`. Thư mục `dist-web/` cũng chạy được với server tĩnh bất kỳ
  (khi đó bảng xếp hạng nằm trong trình duyệt).

## 4. Tiêu chí nghiệm thu (AC61–AC75) và cách kiểm

| AC | Yêu cầu | Kiểm bằng |
|---|---|---|
| AC61 | `game.contract.json`: `contract_version` "1.3", `bench_cmd`, `soak_cmd`, `run_cmd` trỏ tới file đã build | `contract.test.ts` |
| AC62 | Cảnh bench (sim): đúng 200 Bóng Mực `wander`, 100 đom đóm, L1–L3 sáng fuel 100, Mây ở (0,0,0), tất định theo seed | `phase4.test.ts` |
| AC63 | Cảnh bench chạy 30 s sim: không sinh thêm, không sát thương, không nhặt, dầu giữ 100, không kết thúc, Bóng Mực vẫn `wander` và có di chuyển | `phase4.test.ts` |
| AC64 | Công thức `avg_fps`, `p1_low_fps`, `frame_ms_p95` đúng định nghĩa (dữ liệu tay) | `phase4.test.ts` |
| AC65 | `bench_cmd` thật: `bench.json` đủ 10 trường, `frames` > 0, `vsync_off`, thoát 0 | chạy tay → `bench.json` commit |
| AC66 | `soak_cmd`: JSON đúng 6 trường, `nights` 10, 10 kết quả, thoát 0; seed/Đêm xoay vòng | `phase4.test.ts` (3 Đêm) + `soak.json` (10 Đêm) |
| AC67 | Soak: `crashes = 0`, `mem_end_mb ≤ 1.2 × mem_start_mb` | `soak.json` commit |
| AC68 | Soak tất định: cùng seed → cùng `results` | `phase4.test.ts` |
| AC69 | Bảng xếp hạng: kiểm tên, sắp điểm giảm dần, bằng điểm ai trước đứng trên, giữ 10 | `phase4.test.ts` (đơn vị) |
| AC70 | `run_cmd --export-leaderboard out.json`: `{"entries":[…]}` đúng thứ tự, file đĩa còn sau khi tắt server | `phase4.test.ts` (chạy lệnh thật + API) |
| AC71 | Màn nhập tên (thua / Bình Minh), màn Bảng xếp hạng từ menu | ảnh `docs/proof/phase-4/` |
| AC72 | Đổi phím: trùng phím bị báo, khôi phục mặc định, được lưu | `phase4.test.ts` (logic) + ảnh |
| AC73 | Phụ đề + mũi tên mép màn hình cho Bóng Mực, gió, 10 s cuối, đèn < 30 | ảnh |
| AC74 | Giảm chuyển động; chữ ≥ 18 px ở 1280×720, chữ lớn ×1.25 | ảnh + đo `getComputedStyle` |
| AC75 | Mọi test Phase 1–3 vẫn đạt; đầu ra headless không đổi (bằng chứng Phase 3 chạy lại khớp) | `npm test`, `scripts/proof-headless.sh` |

## 5. Cần hỏi trợ giảng Phase 4

1. Soak "Đêm thứ i dùng seed `7 + i`": i bắt đầu từ 0 hay 1? (Đang chọn 0, P4-A11.)
2. Bench: Bóng Mực có được chuyển `chase` khi lại gần Mây không? (Đang giữ `wander`, P4-A6.)
3. Bản web: chấp nhận `bench_cmd` cần Chrome/Chromium có sẵn trên máy chấm không?
