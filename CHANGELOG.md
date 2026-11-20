# Changelog

Mọi thay đổi đáng chú ý qua 4 phase. Mỗi phase có một tag git; ticket gốc chép lại ở `docs/notes/ticket-0N.md`.

## [1.0.0] Phase 4 — Ticket-04 "Bình minh: phát hành v1.0.0" (tag `phase-4`, Test Contract v1.3)

Lý do và quyết định thiết kế: [`docs/notes/phase-4-assumptions.md`](docs/notes/phase-4-assumptions.md) (ADR-004).

### Contract

- `contract_version` `"1.2"` → `"1.3"`; thêm `bench_cmd` và `soak_cmd`.
- `run_cmd` `npm start` → `node dist-headless/app/run.js` (npm nuốt cờ `--export-leaderboard`; `npm start` vẫn chạy
  cùng lệnh). **Đầu ra headless không đổi** so với v1.2 (replay Phase 3 cho kết quả giống từng byte).

### Thêm

- **Benchmark** (`bench_cmd`): mở Chrome/Chromium có sẵn thành cửa sổ 1280×720, tắt vsync, cảnh chuẩn 200 Bóng Mực +
  100 đom đóm seed 42, camera bay vòng, 3 s khởi động, ghi `bench.json` (`avg_fps`, `p1_low_fps`, `frame_ms_p95`,
  `frames`, `load_ms`, `peak_mem_mb`, `vsync_off`, `renderer`, `os`). Không thêm dependency nào.
- Cờ `bench` trong sim: tắt sinh quái, sát thương, nhặt đom đóm, hao dầu và kết thúc Đêm; Bóng Mực chỉ lang thang.
- **Soak test** (`soak_cmd`): N Đêm liên tiếp trong một tiến trình với input ngẫu nhiên theo seed, ghi `soak.json`;
  `--trace 1` in RSS/heap sau từng Đêm.
- **Bảng xếp hạng** cục bộ: nhập tên sau khi thua hoặc tới Bình Minh (3–12 ký tự, có dấu tiếng Việt), top 10, điểm
  giảm dần rồi ai đạt trước đứng trên, lưu file JSON trên đĩa; màn hình từ menu; `run_cmd --export-leaderboard`.
- `run_cmd`: server tĩnh nhỏ (127.0.0.1) phục vụ game + API bảng xếp hạng, tự mở trình duyệt.
- **Trợ năng**: đổi phím 9 hành động (báo phím trùng, khôi phục mặc định, được lưu); phụ đề + mũi tên mép màn hình cho
  Bóng Mực mới, cảnh báo gió, 10 giây cuối, đèn dưới 30 dầu; giảm chuyển động (không rung camera, không chớp đỏ, không
  lóe sáng, đồng hồ không nhấp nháy); chữ UI tối thiểu 18 px (đơn vị rem) và tùy chọn chữ lớn ×1.25.
- Rung camera nhẹ khi bị trúng đòn (tắt được bằng giảm chuyển động).
- Đóng gói Release: `npm run package` → `release/dao-den-long-v1.0.0-web.zip` (`node run.js` để chơi).
- `scripts/proof-phase4.sh` tái tạo `bench.json`, `soak.json` và bằng chứng trong `docs/proof/phase-4/`.

### Sửa

- `scripts/proof-headless.sh` trỏ tới file replay `n3-seed1` đã bị xóa ở Phase 3 → dùng `n3-seed7`.
- Màn Cài đặt: checkbox không còn bị kéo giãn hết chiều ngang.

### Đã biết

- `soak.json`: 0 crash nhưng RSS cuối/đầu 1.37 (> 1.2). Heap JS phẳng, RSS gần như đi ngang từ Đêm 3: phần tăng chủ yếu là JIT của V8
  khởi động một lần, không phải rò rỉ (số liệu: `docs/proof/phase-4/soak-trace-30-nights.txt`).
- Chrome trên Wayland bỏ qua `--force-device-scale-factor`: cửa sổ 1280×720 CSS px, canvas vẫn vẽ 1280×720.
- `peak_mem_mb` là `null` trên Windows (không có `ps`).

## Phase 3 — Ticket-03 "Đèn cạn dầu" (tag `phase-3`, Test Contract v1.2)

Lý do và quyết định thiết kế: [`docs/notes/phase-3-assumptions.md`](docs/notes/phase-3-assumptions.md) (ADR-003).

### Thay đổi phá vỡ tương thích (breaking changes)

- **Contract** `contract_version` `"1.1"` → `"1.2"`.
- **Thời lượng Đêm** 300 / 330 / 360 s → **240 / 270 / 300 s** (`tuning.night{1,2,3}_duration_s`).
- **Luật thắng**: thắp hết đèn **không còn** kết thúc Đêm. Thắng chỉ lúc bình minh khi còn Ngọn Lửa và số đèn đang sáng
  ≥ `ceil(0.6 × tổng đèn)` (3/5, 4/6, 5/7). `game_over.reason` `all_lit` bị bỏ, thêm `dawn_survived`.
- **Đèn đã sáng nhận đom đóm** (châm dầu): bấm Tương tác ở đèn sáng chưa đầy dầu là châm dầu, không còn bị bỏ qua.
  Đèn được chọn = đèn "nhận được" gần nhất (chưa sáng, hoặc sáng nhưng `fuel < 100`).
- **Đèn tắt được**: dầu hao 1/s và bị Bóng Mực hút; `fuel ≤ 0` thì đèn tắt, `deposited` về 0.
- **Vùng an toàn** chỉ còn ở đèn có `fuel ≥ 30` (trước đây: mọi đèn đã sáng).
- **Công thức điểm** thay toàn bộ: +5 mỗi đom đóm nạp (trước +10), +100 thắp lần đầu, +40 thắp lại, Tỏa Sáng +5 mỗi
  con (+15 tổng nếu con đó đang `drain`), lúc thắng +50 + `floor(fuel)` mỗi đèn sáng và +50 mỗi Ngọn Lửa;
  **bỏ thưởng thời gian** (`tuning.score.per_second_left` = 0).
- **Sức chứa** không còn cố định 10: `10 + 2 × successful_lights`, tối đa 20.
- **Bóng Mực** có thêm trạng thái `drain`; bóng `wander` đi về đèn yếu (`fuel < 30`) gần nhất, nếu không có thì về đèn
  chưa sáng gần nhất (thay việc đi tới điểm sinh đom đóm ngẫu nhiên của Phase 2). Hết choáng thì về `wander`.

### Thêm vào contract

- `tuning`: `fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`,
  `low_fuel_threshold`, `capacity_max`; `score`: `per_relight`, `per_stun_drain`, `per_lit_at_dawn`.
- Snapshot: `lanterns[].{fuel, ever_lit, relit_count}`, `player.capacity`.
- Scenario: `lanterns[].{fuel, ever_lit}`, `player.successful_lights`, `shades[].target_lantern_id`, `shades[].state: "drain"`.
- Sự kiện: `refuel {lantern_id, amount, fuel}`, `lantern_out {lantern_id}`, `fuel_drain {lantern_id, shade_id, fuel}`
  (mỗi 60 tick hút), `lantern_lit.relight`.

### Bản web

- Thanh dầu trên đèn sáng, đèn và thanh dầu nhấp nháy 1 Hz khi dầu < 30; đèn tắt xẹp 20% và có vết rách.
- HUD: đèn sáng `k/n (cần m)`, `đang mang / sức chứa`, gợi ý E: nạp / thắp lại / châm dầu.
- Cài đặt **"Bảng màu dễ phân biệt"** (được lưu): viền và mắt Bóng Mực `#00B3FF`, màu cảnh báo `#FFFFFF` kèm ⚠.
- Màn kết quả: thưởng bình minh thay thưởng thời gian.

### Test

- Test cũ bị luật mới làm sai được **sửa kèm lý do** (không skip): xem bảng §1 trong `phase-3-assumptions.md`.
- Test mới AC48–AC57: `tests/phase3.test.ts`. Bot (`autoplay`) viết lại cho luật bình minh.

## Phase 2 — Ticket-02 "Ba hòn đảo" (tag `phase-2`, Test Contract v1.1)

Lý do và quyết định: [`docs/notes/phase-2-assumptions.md`](docs/notes/phase-2-assumptions.md).

### Thay đổi phá vỡ tương thích

- **Số liệu chuẩn** của ticket thay mọi số tự chọn ở Phase 1: nhặt trong 1.0 m (chênh cao ≤ 1.5 m), sức chứa 10, tương
  tác 2.0 m, thắp cần 10 đom đóm, Bóng Mực 4.0 m/s, vùng an toàn 6 m, Tỏa Sáng tốn 3 / bán kính 5 m 3D / hồi 3 s /
  choáng 120 tick, +10 mỗi đom đóm nạp (không cộng khi nhặt).
- **Thứ tự tick 12 bước** bắt buộc; hết Ngọn Lửa luôn thua, xét trước thắng.
- Đèn Đêm 1 ở tọa độ cố định; 20 đom đóm ở 20 điểm sinh cố định, trần 30, sinh thêm mỗi 240 tick.
- Bóng Mực có trạng thái `spawning, wander, chase, recoil, stunned`; sinh 2 con ở tick 300 rồi theo khoảng, cách người
  chơi ≥ 15 m, tối đa 6; phát hiện 12 m, bỏ đuổi 18 m.

### Thêm

- **Ba Đêm, ba bản đồ**: Đảo Bến (5 đèn), Đảo Cau (6 đèn, hai đảo, cầu tre, bục nhảy), Đảo Chuông (7 đèn, 3 tầng,
  dốc, tháp chuông); `--night 1|2|3`.
- **Lướt** (14 m/s, 0.2 s, hồi 1.5 s), **rơi khỏi đảo** (Y < −10: mất 1 lửa và toàn bộ đom đóm, hồi sinh).
- **Gió Lạc** cướp 3 đom đóm, **Bùa Gió** (tăng tốc, lướt không hồi chiêu), **gió mạnh** Đêm 3 có báo trước.
- **Tạm dừng** (input `pause` trong contract), màn Tạm dừng / Cài đặt (âm lượng, độ nhạy chuột) trên web.
- Contract v1.1: `tuning` mở rộng, scenario mới, sự kiện `dash`, `charm_picked`, `drifter_steal`, `drifter_drop`,
  `night_start`, `paused`, `resumed`.
- Bot tự chơi thắng cả 3 Đêm; replay trên web; bảng màu theo Ticket-02.

## Phase 1 — PRD-0 (tag `phase-1`, Test Contract v1.0)

Lý do và quyết định: [`docs/notes/phase-1-assumptions.md`](docs/notes/phase-1-assumptions.md).

### Thêm

- Game 3D góc nhìn thứ ba bằng TypeScript + Three.js + Vite: Mây di chuyển, nhảy, nhặt đom đóm, thắp đèn, Tỏa Sáng
  xua Bóng Mực, 3 Ngọn Lửa, đồng hồ đếm ngược, màn menu / giới thiệu / kết quả, âm thanh WebAudio.
- Logic thuần trong `src/sim` (bước cố định 1/60 s, RNG có seed) dùng chung cho web và headless.
- **Chế độ headless** (Test Contract v1.0): `--seed --night --ticks --out [--inputs] [--scenario]`, đầu ra JSONL
  (snapshot, sự kiện, dòng `end`), mã thoát 0/1/2, tất định theo seed.
- `game.contract.json`, bộ test vitest chạy CLI end-to-end, CI GitHub Actions, hook Stop chặn kết thúc khi test đỏ.
