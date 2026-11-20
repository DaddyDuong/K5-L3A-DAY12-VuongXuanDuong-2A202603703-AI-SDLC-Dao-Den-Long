# Changelog

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

Ba Đêm, số liệu chuẩn, lướt, rơi khỏi đảo, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng. Xem `docs/notes/phase-2-assumptions.md`.

## Phase 1 — PRD-0 (tag `phase-1`, Test Contract v1.0)

Đêm 1 chơi được và chế độ headless. Xem `docs/notes/phase-1-assumptions.md`.
