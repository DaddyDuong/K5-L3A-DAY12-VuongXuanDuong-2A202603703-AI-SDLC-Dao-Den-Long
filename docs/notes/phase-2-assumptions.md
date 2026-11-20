# Phase 2 — Giả định và tiêu chí nghiệm thu (Ticket-02, Contract v1.1)

Nguồn: [`ticket-02.md`](ticket-02.md) (chép từ lab board) + Test Contract v1.0 (Phase 1). Trích dẫn ticket in nghiêng.
Số chuẩn nằm ở `src/sim/tuning.ts` (`TUNING` = `tuning` trong `game.contract.json`; `WORLD` = hằng số nội bộ).

## 1. Luật Phase 1 bị ticket thay (sửa test cũ kèm lý do)

Ticket: *"Số liệu chuẩn (bắt buộc, thay mọi giá trị tự chọn)"*. Mọi giả định Phase 1 dưới đây bị bỏ; test Phase 1 tương ứng
được sửa kỳ vọng theo số mới (không phải để "cho xanh", mà vì yêu cầu đổi).

| Phase 1 | Phase 2 (trích ticket) | Test bị ảnh hưởng |
|---|---|---|
| W1 đèn trên vòng 25 m cách đều 72° | Đèn Đêm 1 ở toạ độ cố định *"L1 (0,0,25) · L2 (23.8,0,7.7) …"* | headless (tọa độ đèn) |
| W2 không rơi, tường vô hình | *"Rơi khỏi đảo (Y < −10)"* → `fall_enabled: true` | — (luật mới R20) |
| W3 40 đom đóm ngẫu nhiên, không sinh thêm | *"20 lúc bắt đầu tại 20 điểm khác nhau; trần 30; tại các tick 240, 480, … sinh thêm 1"* trên các điểm sinh cố định | determinism, seed khác nhau |
| R1 nhặt 1.5 m, mang 5, +10 khi nhặt | *"XZ ≤ 1.0 m và chênh cao … ≤ 1.5 m"*, sức chứa 10; điểm *"+10 mỗi đom đóm nạp"* (không cộng khi nhặt) | AC1–AC3 |
| R2/R3 tương tác 2.5 m, thắp 5 | 2.0 m, thắp 10 | AC4–AC6 |
| R4 3 con sẵn, mỗi 30 s, tối đa 8, ở rìa 38 m | *"2 con tại tick 300, sau đó 1 con mỗi khoảng sinh"*, 12 điểm 37 m, *"cách người chơi ≥ 15 m"*, tối đa 6 | AC18 |
| R5 chỉ `chase`, 3.5 m/s | 4.0 m/s; trạng thái *"spawning, wander, chase, recoil, stunned"*; phát hiện 12 m / bỏ đuổi 18 m | AC7 |
| R6 vùng an toàn 5 m, đẩy ra ngay | 6 m, *"bị đẩy ra mép trong tối đa 30 tick và không gây sát thương trong lúc đó"* | AC15 |
| R7 rơi đom đóm trên vòng 3 m | *"vành 1.5–2.5 m … tồn tại 480 tick"*; bóng gây hit *"lùi 2 m trong 60 tick (recoil)"*; chạm cần chênh cao ≤ 1.5 m | AC8 |
| R8 tốn 1, bán kính 6 m (XZ), hồi 1 s, choáng 3 s, đẩy 4 m ngay | Tốn 3, *"khoảng cách 3D tới tâm Bóng Mực ≤ 5 m"* từ *"chân Mây + 0.8 m"*, hồi 3 s, choáng 120 tick, đẩy 4 m *"trong 15 tick đầu"* | AC11–AC14 |
| R9 +25 chỉ khi chưa choáng | *"+5 mỗi Bóng Mực trúng Tỏa Sáng (mỗi con mỗi lần, kể cả con đang choáng)"* | "re-stun no extra score" → đảo kỳ vọng |
| R12 thứ tự tick của tôi, **thắng xét trước** | Thứ tự 12 bước bắt buộc; *"hết Ngọn Lửa → luôn thua"* xét **trước** thắng | — (AC mới AC30) |
| AC20 input đi hình sin 40 s quanh đảo | Rơi khỏi đảo nay là luật (W2) nên đường hình sin rơi xuống biển mây và ván kết thúc sớm | AC20: đổi sang đi vòng tròn ~12 m trong đảo, bắt đầu với túi đầy để Tỏa Sáng chắc chắn xảy ra; vẫn kiểm byte-identical và đủ các event |
| `r.lines[1]` là snapshot tick kế | Event `night_start` ở tick 1 (*"night_start"*) nằm trước snapshot tick 1 | headless: tìm snapshot theo `tick` thay vì theo chỉ số dòng |

## 2. Quyết định cho chỗ ticket chưa nói rõ

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A1 | Gia tốc *"tăng tốc/dừng trong ≤ 0.1 s"* | Vận tốc đổi tức thì (0 s ≤ 0.1 s). Giữ nguyên mô hình tick Phase 1: `move [0,1]` 60 tick → đúng 6 m |
| A2 | Điểm xuất phát Đêm 2, Đêm 3 (ticket chỉ nêu Đêm 1) | Đêm 2: (0,0,0) (tâm đảo A). Đêm 3: tâm (0,0,0) là tầng 2 + tháp chuông nên chọn **(0,0,−30)** (tầng 0, nửa z < 0), quay mặt về +Z. **Cần hỏi trợ giảng** |
| A3 | Góc *"đo từ +X, ngược chiều kim đồng hồ khi nhìn từ trên xuống"* | `x = r·cos θ, z = r·sin θ`. Kiểm tra chéo: Đêm 3 tầng 1 (*"nửa có z > 0"*) chứa các điểm sinh 20°…160° và dốc 30°/150° → khớp |
| A4 | Địa hình | Bản đồ độ cao (heightfield): mỗi điểm XZ có một mặt đất (hoặc trống = biển mây). Đi lên tối đa 0.5 m/tick (dốc được, vách đứng và tháp chuông chặn); đi xuống bậc nhỏ ≤ 0.5 m thì bám đất, lớn hơn thì rơi tự do |
| A5 | Bục nhảy | Kích hoạt khi Mây **đang chạm đất** và chân trong 1 m (XZ) quanh tâm bục; bắn ở bước di chuyển của tick kế tiếp. Trong lúc bay: vận tốc ngang = vận tốc phóng (phím di chuyển bị bỏ qua); lướt thay vận tốc ngang trong 12 tick rồi trả lại vận tốc phóng; trạng thái phóng hết khi chạm đất |
| A6 | Lướt | 12 tick × 14 m/s. Hướng = hướng `move` (đã xoay camera) nếu khác 0, nếu không = hướng mặt (hướng di chuyển gần nhất, ban đầu +Z). Trên không: giữ độ cao (vy = 0) trong lúc lướt. Bị vách chặn như đi bộ. Hồi chiêu đếm từ tick bắt đầu lướt (90 tick) |
| A7 | Rơi khỏi đảo | Phát `player_hit {by:"fall", flames, dropped: 0, lost: n}` đúng 1 lần ở tick Y < −10. Trong 60 tick chờ Mây đứng yên tại chỗ rơi (vận tốc 0), không nhặt / nạp / tỏa sáng / lướt / bị chạm / bị cướp. Tick thứ 60 hồi sinh ở điểm xuất phát, bất tử 90 tick |
| A8 | Trạng thái `spawning` | 30 tick (0.5 s): không di chuyển, không gây sát thương. Bóng do scenario đặt bắt đầu hoạt động ngay (*"ở trạng thái hoạt động bình thường"*): `chase` nếu cách ≤ 12 m, ngược lại `wander` |
| A9 | `wander` | Đi 1.5 m/s về một điểm sinh đom đóm chọn ngẫu nhiên theo seed, đổi điểm khi tới nơi hoặc sau 240 tick |
| A10 | Bóng Mực và địa hình | Không bay qua biển mây, không leo vách / tháp (trượt theo trục X hoặc Z nếu bị chặn), được nhảy xuống tầng thấp và đi dốc. `pos.y` = mặt đất + độ lơ lửng (1 m với bóng tự sinh; bóng scenario giữ độ lơ lửng ban đầu, ví dụ đặt y = 0 thì giữ y = 0 trên đất phẳng). Chênh cao khi chạm = `|chân Mây − mặt đất dưới bóng|` |
| A11 | Vùng an toàn | Bóng ở ngoài bị chặn ở 6 m + 0.01. Bóng đang ở trong (≤ 6 m) một đèn đã sáng: mỗi tick bị đẩy ra 0.2 m theo hướng xa đèn (tối đa 30 tick cho mọi vị trí), không tự di chuyển và không gây sát thương cho tới khi ra khỏi vùng |
| A12 | Đẩy lùi / recoil gặp vật cản | Biển mây, vách, tháp, mép vùng an toàn là vật cản: dừng phần đẩy còn lại |
| A13 | Hết `stunned` / `recoil` / `spawning` | Chuyển `chase` nếu cách ≤ 12 m, ngược lại `wander`. `stunned` 120 tick tính cả tick bị tỏa sáng; `recoil` gồm 60 tick lùi (2/60 m mỗi tick), tick lùi thứ 60 chuyển trạng thái |
| A14 | Điểm sinh Bóng Mực "hợp lệ" | Cách người chơi ≥ 15 m (XZ) và không nằm trong vùng an toàn của đèn đã sáng. Áp dụng cho cả 3 Đêm. Chọn ngẫu nhiên theo seed; sinh 2 con cùng lúc thì 2 điểm khác nhau |
| A15 | Trần 30 đom đóm | Đếm mọi đom đóm đang có (kể cả đom đóm rơi). Đom đóm rơi không bị giới hạn bởi trần. "Điểm trống" = điểm sinh không có đom đóm `random` nào đứng |
| A16 | Đom đóm rơi vào biển mây | Vị trí trên vành 1.5–2.5 m (góc đều, xoay ngẫu nhiên, bán kính ngẫu nhiên theo seed) mà dưới là biển mây thì con đó mất. `dropped` trong event vẫn = `floor(carried/2)`. Đom đóm rơi đặt trên mặt đất tại XZ đó |
| A17 | Gió Lạc cướp khi nào | Ở trạng thái `idle` hoặc `chase`, chưa cướp lần nào, XZ ≤ 1.2 m, Mây đang mang > 0 (không xét bất tử, không xét độ cao: Gió Lạc bay). Ticket ghi *"min(3, đang mang)"* nên cho phép cướp cả khi mang < 5 |
| A18 | Gió Lạc di chuyển | `idle`: 2 m/s về một điểm sinh đom đóm ngẫu nhiên (như A9). `chase`: 7 m/s thẳng tới Mây. `flee`: 7 m/s ra xa Mây. Bay ở y = mặt đất điểm sinh + 1.5, bỏ qua địa hình và vùng an toàn. `removed` vẫn nằm trong mảng `drifters` (để test đọc được trạng thái); *"tối đa 2 con"* = số con chưa `removed` |
| A19 | Tỏa Sáng trúng Gió Lạc | Cùng điều kiện 3D ≤ 5 m. `idle` không bị ảnh hưởng. Không tính vào `stunned_ids` và không cộng điểm. `drifter_drop` phát sau event `pulse` |
| A20 | Đêm có Gió Lạc / Bùa / gió | Tự sinh Gió Lạc chỉ Đêm 2, 3 (`random_drifters` khác false). Gió chỉ Đêm 3 (`wind_enabled` khác false). Bùa mặc định theo bản đồ (Đêm 1 không có). Scenario `drifters` / `charms` dùng được ở mọi Đêm |
| A21 | Lịch gió | Cơn gió bắt đầu ở `sim_tick` 1800, 3600, … kéo dài 300 tick; hướng chọn theo seed lúc báo trước (120 tick trước). `wind.dir_deg` luôn là số (hướng cơn gió gần nhất, 0 trước cơn đầu tiên) |
| A22 | Tạm dừng | `pause` lật trạng thái. Vừa tạm dừng → phát `paused {}` và dừng bước. Vừa tiếp tục → phát `resumed {}` và tick đó chạy đủ. Trong lúc dừng: `tick` tăng, `sim_tick` / giờ / hồi chiêu / spawn / TTL đứng yên. Cạnh nút được tính trên input thô mỗi tick (kể cả khi dừng). Dòng `end` khi đang dừng có `state: "paused"` |
| A23 | `night_start` | Phát ở bước đầu tiên (tick 1), trước mọi event khác của bước đó. Dựng màn (tick 0) không phát event (contract v1.0) |
| A24 | Snapshot `player.invuln` | Boolean (`true` khi còn bất tử). Các trường `_s` là số giây còn lại (làm tròn 3 chữ số). `motes[].ttl_s` = `null` với đom đóm `random` |
| A25 | Snapshot chỉ ghi đúng các trường contract | `charms` = `{id, available, respawn_s}`, `drifters` = `{id, pos, state, stolen}` (không thêm trường) |
| A26 | Scenario mới | `player.{invuln_ticks, dash_cd_ticks, pulse_cd_ticks, charm_ticks}` là số nguyên ≥ 0; `shades[].state` thuộc 5 tên chuẩn, `state_ticks_left` cho trạng thái có hạn; `drifters[]` = `{id?, pos, state? (idle/chase/flee/removed), stolen?, state_ticks_left?}`; `charms[]` = `{id?, pos, available?, respawn_ticks?}`; `lanterns[].id` phải thuộc L1…Ln của Đêm đó |
| A27 | Tâm Tỏa Sáng | Chân Mây + 0.8 m; đẩy lùi theo phương ngang từ XZ của Mây, hướng chốt ở tick kích hoạt |
| A28 | Tốc độ Bóng Mực Đêm 3 (4.5 m/s) | `tuning.shade_speed` = 4 (giá trị Đêm 1, 2); 4.5 là hằng số theo Đêm, ghi trong README |

## 3. Luật mới (R14–R28)

| # | Luật |
|---|---|
| R14 | **Ba Đêm**: `--night 1/2/3` dựng bản đồ chuẩn (Phần 2 ticket): đảo, đèn, điểm sinh, thời lượng 300 / 330 / 360 s, khoảng sinh Bóng Mực 480 / 420 / 360 tick, tối đa 6 / 8 / 10 |
| R15 | **Địa hình** (A4): Đêm 2 hai đảo + cầu tre không lan can; Đêm 3 ba tầng, vách đứng, 2 dốc, tháp chuông |
| R16 | **Bục nhảy** (A5): Đêm 2 vy 14, ngang 24 m/s về tâm đảo kia; Đêm 3 vy 12, ngang 8 m/s hướng −Z |
| R17 | **Lướt** (A6): 14 m/s, 12 tick, hồi 90 tick; event `dash {}` |
| R18 | **Nhặt có độ cao**: XZ ≤ 1.0 và chênh cao ≤ 1.5; mang tối đa 10 |
| R19 | **Đom đóm**: 20 lúc đầu trên điểm sinh cố định, sinh thêm 1 mỗi 240 tick nếu < 30; đom đóm rơi sống 480 tick |
| R20 | **Rơi khỏi đảo** (A7) |
| R21 | **Bóng Mực có trạng thái** (A8–A13): sinh 2 con ở tick 300 rồi theo khoảng sinh; chase/wander theo 12 / 18 m; recoil sau khi gây hit |
| R22 | **Tỏa Sáng v1.1**: tốn 3, 3D ≤ 5 m, hồi 180 tick, choáng 120 tick, đẩy 4 m trong 15 tick, +5 mỗi con mỗi lần |
| R23 | **Thứ tự 12 bước** của ticket, thua `no_flames` xét trước thắng |
| R24 | **Gió Lạc** (A17–A19), sinh ở tick 1200, 2400, … trên điểm sinh Bóng Mực |
| R25 | **Bùa Gió**: hiệu lực 600 tick (nhặt lại làm mới), chạy 7.2 m/s, lướt không hồi chiêu, xuất hiện lại sau 2700 tick |
| R26 | **Gió mạnh** Đêm 3 (A21): đẩy Mây 2 m/s |
| R27 | **Tạm dừng** (A22) |
| R28 | **Contract v1.1**: snapshot / scenario / input / event mới; một Đêm đầy đủ chạy headless ≤ 30 s |

## 4. Tiêu chí nghiệm thu (mỗi dòng = ít nhất một test headless kiểm tra JSONL)

| ID | Làm A | Thấy B |
|---|---|---|
| AC22 | Đọc `game.contract.json` | `contract_version "1.1"`, `tuning` = số chuẩn + 5 khóa mới, khớp code |
| AC23 | `--night 1/2/3`, 0 tick | Snapshot 0 có `night`, `wind`, đèn đúng tọa độ chuẩn (5 / 6 / 7), 20 đom đóm trên các điểm sinh khác nhau; `--night 4` → mã 1 |
| AC24 | Snapshot v1.1 | `player` có `vel, grounded, invuln, dash_cd_s, pulse_cd_s, charm_s`; có mảng `motes` (kind, ttl_s), `drifters`, `charms` |
| AC25 | Đom đóm cách 1.0 m (biên) / 1.1 m / cao hơn 1.6 m | Nhặt / không / không. Mang 10 thì không nhặt |
| AC26 | Nạp: mang 12, đèn thiếu 10 | Nạp 10, giữ 2, thắp, điểm 100 + 10·10 |
| AC27 | Đom đóm tự sinh | Tick 240 có thêm 1 (21), không vượt 30; `random_motes:false` không sinh |
| AC28 | Bóng Mực mặc định | `shade_spawned` S1, S2 ở tick 300, S3 ở tick 780 (Đêm 1), cách người chơi ≥ 15 m, trạng thái `spawning` rồi hoạt động; không quá 6 |
| AC29 | Bóng chase / wander | Bóng cách 10 m đuổi 4 m/s; bóng cách 20 m `wander`; bóng chase bị bỏ xa > 18 m về `wander` |
| AC30 | Hit + recoil | Chạm: `player_hit {shade, flames, dropped}`, đom đóm rơi ở 1.5–2.5 m, `kind dropped`, TTL 480 tick rồi biến mất; bóng `recoil` lùi 2 m trong 60 tick; bất tử 90 tick; chênh cao > 1.5 không hit |
| AC31 | Thua xét trước thắng | Cùng tick thắp đèn cuối và mất lửa cuối → `lost no_flames` |
| AC32 | Tỏa Sáng v1.1 | Tốn 3, trúng bóng 3D ≤ 5 m (ngang 4.9 m, tâm y = 1 → trúng; ngang 5 m → 5.004 m không trúng), +5 mỗi con, kể cả con đang choáng; đẩy 4 m sau 15 tick; choáng 120 tick; hồi 180 tick; mang 2 thì không kích hoạt |
| AC33 | Vùng an toàn 6 m | Bóng ngoài không vào được; bóng trong lúc đèn vừa sáng ra mép trong ≤ 30 tick, không hit |
| AC34 | Lướt | `dash {}`; 12 tick đi 2.8 m; hồi 90 tick; đứng yên thì lướt theo hướng mặt; trên không giữ độ cao |
| AC35 | Rơi khỏi đảo | Đi ra ngoài 40 m: `player_hit {fall, flames 2, dropped 0, lost n}` 1 lần; 60 tick sau ở điểm xuất phát, bất tử; lửa cuối → `no_flames` |
| AC36 | Đêm 2 | Cầu tre đi qua được; bước ra ngoài mép cầu thì rơi; bục nhảy (20,0,18) đưa Mây sang đảo B |
| AC37 | Đêm 3 | Vách tầng 1 chặn; lên tầng 1 bằng dốc 30°; bục (0,3,13) đưa lên tầng 2; tháp chuông chặn; nhặt đom đóm tầng trên phải đứng cùng tầng |
| AC38 | Gió Lạc | Mang ≥ 5 trong 15 m → `chase`; chạm → `drifter_steal {amount 3, carried}` rồi `flee` 240 tick → `removed`; tỏa sáng lúc chase → `flee` không cướp; tỏa sáng lúc flee có đồ → `drifter_drop`, đom đóm rơi tại chỗ; sinh mặc định ở tick 1200 Đêm 2 |
| AC39 | Bùa Gió | Nhặt → `charm_picked {C1, 600}`; chạy 7.2 m/s; lướt liên tiếp không hồi chiêu; bùa trở lại sau 2700 tick |
| AC40 | Gió mạnh | Đêm 3 tick 1800–2099: `wind.active`, Mây đứng yên bị đẩy 2 m/s; `wind_enabled:false` thì không |
| AC41 | Tạm dừng | `paused {}`; `tick` tăng, `sim_tick`/giờ/vị trí đứng yên, `state "paused"`; `resumed {}` chạy tiếp |
| AC42 | `night_start` | Event `night_start {night}` ở tick 1 |
| AC43 | Hiệu năng | Một Đêm đầy đủ 21 600 tick (mỗi Đêm) chạy < 30 s; tất định byte-identical với mọi luật mới |
| AC44 | Regression | Mọi kiểm tra Phase 1 (định dạng, mô hình tick, scenario, mã lỗi) vẫn đạt với số chuẩn |
| AC45 | Bản web | Menu → giới thiệu Đêm → chơi → kết quả → Đêm kế; Bình Minh sau Đêm 3; tạm dừng (Esc/P) với 4 lựa chọn; cài đặt lưu localStorage; âm thanh; HUD đủ 8 mục; bảng màu chuẩn; ánh sáng 0.15 + 0.55·tỉ lệ đèn. Bằng chứng: ảnh chụp |
| AC46 | FPS | ≥ 30 FPS trung bình ở 1280×720, ghi cấu hình máy |

## 5. Cần hỏi trợ giảng Phase 2

- A2: điểm xuất phát Đêm 2 và Đêm 3 (tâm Đêm 3 là tầng 2 có tháp).
- A8: thời lượng `spawning`.
- A17: Gió Lạc có cướp khi đang `idle` không.
- A22: dòng `end` khi đang tạm dừng ghi `state` gì.
- A23: `night_start` ở tick 0 hay tick 1.
- A24: `player.invuln` là boolean hay số giây.

Ghi câu trả lời vào đây trước khi sửa code.

## 6. Ghi chú kiểm thử bot (autoplay)

Bot chỉ để chứng minh mỗi Đêm thắng được (và sinh replay cho bằng chứng), không phải người chơi tối ưu. Đo trên 12 seed
(1–10, 13, 42) với bot hiện tại: Đêm 1 thắng 12/12, Đêm 2 10/12, Đêm 3 9/12. Đêm 3 khan đom đóm theo đúng số ticket
(20 + 1 mỗi 240 tick ≈ 110 con trong 360 s cho 70 cần thắp, trừ Gió Lạc cướp), nên bot không Tỏa Sáng vào Gió Lạc
(bị cướp tối đa 3 = đúng giá một lần Tỏa Sáng) và chỉ Tỏa Sáng cứu Ngọn Lửa cuối. `tests/autoplay.test.ts` dùng seed
1/7/42 cho Đêm 1–2 và 2/3/7 cho Đêm 3 (các seed bot thắng).
