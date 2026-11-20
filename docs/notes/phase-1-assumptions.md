# Phase 1 — Giả định và tiêu chí nghiệm thu

Nguồn: PRD-0 + Test Contract v1.0 (lab board, tab Phase 1). Các con số nằm ở `src/sim/tuning.ts`
(khai báo trong `game.contract.json`) và `WORLD` (hằng số nội bộ, không thuộc contract).

## 1. Quyết định kỹ thuật
- TypeScript; logic thuần trong `src/sim` dùng chung cho web và headless → headless không cần GPU, tất định.
- PRNG mulberry32 seed từ `--seed`; không dùng `Math.random`/`Date` trong logic.
- Mọi khoảng cách đo trên mặt phẳng XZ, "trong bán kính r" là `≤ r` (contract §B). Nhảy không ảnh hưởng nhặt/va chạm.

## 2. Thế giới

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| W1 | Kích thước đảo | Bán kính 40 m. 5 đèn trên vòng 25 m, L1 ở +Z, các đèn cách đều 72° |
| W2 | Rơi khỏi đảo | Không rơi (`fall_enabled: false`). Rìa đảo là tường vô hình, không có event `player_hit` loại `fall` |
| W3 | Số đom đóm mặc định | 40 con (cần 25 để thắp đủ 5 đèn, dư 15 cho tỏa sáng và bị rơi). Rải ngẫu nhiên theo seed, cách tâm ≥ 3 m. Không tự sinh thêm |
| W4 | Hết thời gian Đêm 1 (300 s) | Thua: `game_over {result: lost, reason: dawn}` |
| W5 | `move` có thành phần ngoài [−1, 1] | Kẹp về [−1, 1], không coi là sai định dạng |
| W6 | Thiếu tham số bắt buộc / `--night` ≠ 1 | Thoát mã 1 (mã 2 dành cho file inputs/scenario sai định dạng) |
| W7 | `dash` | Không có trong Phase 1, input `dash` bị bỏ qua |

## 3. Luật chơi

| # | Luật | Giả định chi tiết |
|---|---|---|
| R1 | **Nhặt đom đóm** | Tự động, không cần bấm phím: mọi đom đóm trong `pickup_radius` (1.5 m) được nhặt, theo thứ tự id, cho đến khi `carried = carry_capacity` (5). Túi đầy thì đom đóm nằm yên. Mỗi con: event `mote_picked {carried}`, `+per_mote` (10) |
| R2 | **Nạp đèn** | Bấm `interact` (cạnh false→true) khi có đèn **chưa thắp** trong `interact_radius` (2.5 m) và `carried > 0`. Nhiều đèn trong tầm thì chọn đèn gần nhất (bằng nhau → id nhỏ hơn). Nạp `amount = min(carried, lantern_cost − deposited)`, phần dư giữ lại. Event `deposit {lantern_id, amount, deposited}`. Không đủ điều kiện thì không có gì xảy ra, không event |
| R3 | **Thắp đèn** | Khi `deposited ≥ lantern_cost` (5): `lit = true`, event `lantern_lit {lantern_id}`, `+per_lantern` (100) |
| R4 | **Bóng Mực xuất hiện** | Khi `random_shades` khác false: lúc dựng màn có sẵn 3 con chia đều quanh rìa (cách nhau 120°, bắt đầu từ phía đối diện người chơi; không phát event, vì dựng màn không phát event). Sau đó cứ 30 s (1800 tick) sinh thêm 1 con nếu đang có < 8 con: event `shade_spawned {id}`. Vị trí sinh ở rìa đảo (bán kính 38 m), phía đối diện người chơi, lệch ngẫu nhiên ±45° theo seed. Id `S1, S2, …` không trùng id do scenario đặt. Tâm Bóng Mực ở `y = 1` |
| R5 | **Bóng Mực đuổi** | Trạng thái `chase`: đi thẳng về phía người chơi với `shade_speed` (3.5 m/s) trên XZ |
| R6 | **Sợ đèn** | Bóng Mực không vào được vùng `safe_radius` (5 m) quanh **đèn đã thắp**. Nếu bước đi đưa nó vào trong vùng (hoặc nó đang ở trong vùng lúc đèn vừa sáng) thì bị đẩy ra mép vùng. Đèn chưa thắp không bảo vệ |
| R7 | **Bị chạm** | Bóng Mực không bị choáng, cách người chơi ≤ `shade_hit_radius` (1 m), và người chơi không đang bất tử → mất 1 lửa; rơi `floor(carried × hit_drop_ratio)` đom đóm (0.5). Đom đóm rơi thành đom đóm mới trên mặt đất, xếp đều trên vòng 3 m quanh người chơi (ngoài tầm nhặt, nhặt lại được). Bất tử `invuln_s` (1.5 s = 90 tick). Tối đa 1 lần trúng mỗi tick. Event `player_hit {by: "shade", flames, dropped}` |
| R8 | **Tỏa sáng** | Bấm `pulse` (cạnh false→true) khi `carried ≥ pulse_cost` (1) và đã hết hồi chiêu `pulse_cooldown_s` (1 s = 60 tick, tính từ lần tỏa sáng thành công trước). Tốn 1 đom đóm đang mang. Mọi Bóng Mực trong `pulse_radius` (6 m): trạng thái `stunned` trong `pulse_stun_s` (3 s), bị đẩy ra xa người chơi `pulse_push_m` (4 m) trên XZ (trùng vị trí → đẩy theo +X), vẫn bị tường đảo và vùng an toàn giới hạn. Event `pulse {stunned_ids}` (có thể rỗng). Không đủ điều kiện → không có gì xảy ra, không event |
| R9 | **Choáng** | Bóng Mực `stunned` không di chuyển và không gây sát thương. Hết thời gian → quay lại `chase`. `+per_stun` (25) chỉ cộng khi con đó **chưa** bị choáng (tỏa sáng lại để kéo dài thời gian choáng không cộng điểm thêm) |
| R10 | **Thắng** | Cả 5 đèn đều `lit` (kể cả đèn đặt sẵn `lit: true` trong scenario) → `won`, `game_over {result: won, reason: all_lit}`. Cộng thưởng `per_second_left × floor(time_left_s)` + `per_flame_left × flames` |
| R11 | **Thua** | `flames = 0` → `lost`, reason `no_flames`. Hết giờ → `lost`, reason `dawn` |
| R12 | **Thứ tự trong một tick** | 1. di chuyển + nhảy người chơi → 2. nhặt (R1) → 3. nạp/thắp (R2, R3) → 4. tỏa sáng (R8) → 5. cập nhật choáng, Bóng Mực di chuyển + vùng an toàn (R5, R6, R9) → 6. va chạm (R7) → 7. sinh Bóng Mực (R4) → 8. tăng bộ đếm tick → 9. kiểm tra kết thúc: **thắng trước** (all_lit), rồi `no_flames`, rồi `dawn`. Như vậy trong cùng một tick vừa thắp đèn cuối vừa mất lửa cuối thì tính là thắng |
| R13 | **Điểm** | Chỉ cộng qua R1, R3, R9, R10. Dựng scenario không cộng điểm. Không bao giờ trừ điểm |

## 4. Tiêu chí nghiệm thu (mỗi dòng = một test headless trong bước 3)

Ký hiệu: scenario đặt `random_motes: false, random_shades: false` trừ khi ghi khác.

| ID | Làm A | Thấy B |
|---|---|---|
| AC1 | 1 đom đóm ở (0,0,1), người chơi đứng yên, chạy 1 tick | event `mote_picked {carried:1}` ở tick 1; snapshot: `carried 1`, `motes_active 0`, `score 10` |
| AC2 | Đom đóm ở (0,0,1.6) (ngoài 1.5 m), chạy 10 tick | Không có `mote_picked` |
| AC3 | `carried: 5`, đom đóm ở (0,0,1), chạy 1 tick | Không nhặt, `motes_active 1` |
| AC4 | `carried: 3`, L1 ở (0,0,2), bấm interact ở tick 0 | `deposit {L1, amount 3, deposited 3}` ở tick 1, `carried 0`, đèn chưa sáng |
| AC5 | `carried: 5`, L1 ở (0,0,2), bấm interact | `deposit` amount 5 rồi `lantern_lit {L1}` cùng tick, `score 100` |
| AC6 | Giữ interact `true` liên tục 10 tick | Chỉ nạp 1 lần (kích hoạt theo cạnh) |
| AC7 | Bóng Mực ở (10,0,0), chạy 60 tick | Bóng Mực tiến lại gần người chơi đúng 3.5 m |
| AC8 | Bóng Mực ở (0.5,1,0), `flames 3`, `carried 4` | `player_hit {shade, flames 2, dropped 2}` ở tick 1; 2 đom đóm mới cách người chơi 3 m |
| AC9 | Như AC8, chạy 89 tick | Chỉ 1 `player_hit` (bất tử 90 tick) |
| AC10 | `flames 1`, Bóng Mực chạm | `game_over {lost, no_flames}`, dòng `end` state `lost` |
| AC11 | `carried 2`, Bóng Mực ở (5,1,0), bấm pulse | `pulse {stunned_ids:[...]}`, `carried 1`, Bóng Mực `stunned` bị đẩy tới ≈ 9 m, `score 25` |
| AC12 | Pulse 2 lần cách nhau 30 tick | Chỉ 1 event `pulse` (hồi chiêu) |
| AC13 | `carried 0`, bấm pulse | Không có event `pulse` |
| AC14 | Bóng Mực bị choáng nằm sát người chơi | Không `player_hit` trong 180 tick; sau đó trạng thái lại `chase` |
| AC15 | L1 `lit: true` ở (0,0,10), Bóng Mực ở (0,1,20), người chơi đứng ở (0,0,10) | Bóng Mực không bao giờ vào trong 5 m quanh L1, không `player_hit` |
| AC16 | L1–L4 `lit: true`, L5 cạnh người chơi, `carried 5`, bấm interact | `lantern_lit L5` rồi `game_over {won, all_lit}`; điểm = 100 + 2·floor(time_left) + 50·flames |
| AC17 | Scenario đặt cả 5 đèn `lit: true` | Thắng ở tick 1, không cộng `per_lantern` |
| AC18 | Mặc định (`random_shades` true), chạy 1801 tick | Snapshot 0 có 3 Bóng Mực, có `shade_spawned` ở tick 1800 |
| AC19 | `time_left_s: 1` | `game_over {lost, dawn}` ở tick 60 *(đã có test)* |
| AC20 | Chạy 2 lần cùng seed và inputs (có Bóng Mực, nhặt, tỏa sáng) | Output giống nhau từng byte *(mở rộng test đã có)* |
| AC21 | Bản web: chơi từ đầu đến thắng/thua, bấm R | Chơi lại được; HUD hiện giờ, điểm, lửa, đom đóm, số đèn. Bằng chứng: ảnh chụp/GIF |

## 5. Cần xác nhận với trợ giảng Phase 1 (nếu có thời gian)
- R6: "Bóng Mực sợ những chiếc đèn" — chỉ đèn đã thắp, hay mọi đèn? (đang chọn: đã thắp)
- R7: đom đóm bị rơi có nhặt lại được không? (đang chọn: có)
- R10: công thức thưởng khi thắng có cần làm tròn `time_left_s` không? (đang chọn: `floor`)

Ghi câu trả lời và mọi thay đổi vào đây trước khi sửa code.
