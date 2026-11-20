# Phase 3 — Giả định, quyết định thiết kế và tiêu chí nghiệm thu (Ticket-03, Contract v1.2)

Nguồn: [`ticket-03.md`](ticket-03.md) (chép từ lab board). Trích dẫn ticket in nghiêng. Số chuẩn ở `src/sim/tuning.ts`
(`TUNING` = `tuning` trong `game.contract.json`). Thay đổi phá vỡ tương thích: [`CHANGELOG.md`](../../CHANGELOG.md).

## 1. Luật cũ bị ticket thay và test bị ảnh hưởng (sửa kèm lý do, không skip)

| Luật cũ | Ticket-03 (trích) | Test cũ → xử lý |
|---|---|---|
| R2/R3: đèn đã sáng không nhận đom đóm; *"Chỉ xét đèn chưa sáng"* | *"[THAY THẾ] luật 'đèn đã sáng không nhận thêm đom đóm'"*; *"Chỉ xét đèn nhận được (chưa sáng, hoặc sáng nhưng chưa đầy dầu)"* | `rules` "nearest unlit lantern wins; lit lanterns are skipped" → đổi thành "đèn sáng chưa đầy được châm dầu" (L1 đã hao 1/60 ở bước 2 nên nhận 1 đom đóm) + thêm test "giữa các đèn chưa sáng, đèn gần nhất thắng" |
| R6/A11: Bóng Mực không bao giờ vào vùng an toàn | *"[THAY THẾ] … Đèn có `fuel < 30` mất vùng an toàn. Đúng 30 thì vẫn còn"* | Không test cũ nào sai (đèn scenario có dầu 100, các test < 70 s). Thêm AC53 |
| R10: *"thắng ngay khi tất cả đèn sáng"* (`all_lit`) | *"[THAY THẾ] … Thắp đủ đèn không kết thúc Đêm"*; thắng = *"còn sống khi hết giờ và số đèn đang sáng tại tick cuối ≥ ceil(0.6 × tổng đèn)"* (`dawn_survived`); *"`all_lit` không còn dùng"* | `rules` AC16, AC17: giữ kịch bản, đổi kỳ vọng thành "không kết thúc Đêm, không có `all_lit`". Thắng lúc bình minh ở AC56 |
| Điểm Ticket-02 (+10 mỗi đom đóm, thưởng thời gian) | *"[THAY THẾ] toàn bộ công thức điểm cũ"*: +5 mỗi đom đóm nạp, *"Thưởng thời gian: Bỏ"* | `rules` AC4 (30 → 15), AC5 (200 → 150), `phase2` AC26 (170 → 135) |
| Thời lượng 300 / 330 / 360 s | *"Thời gian Đêm 1 / 2 / 3: 240 / 270 / 300 s"* | `phase2` AC23 (thời lượng), AC41 (`time_left_s` 299.833 → 239.833), `contract` (bảng số) |
| Contract v1.1 | *"`contract_version: "1.2"`"*, 8 khóa `tuning` mới, snapshot `player.capacity`, `lanterns[].{fuel, ever_lit, relit_count}` | `contract` (v1.2 + bảng số mới), `headless` AC24 (thêm `capacity: 10`) |
| AC43 (một Đêm 21 600 tick): người chơi đứng trong vùng an toàn của 1 đèn | Đèn nay cạn dầu: sau 70 s mất vùng an toàn, người chơi đứng yên bị đánh và thua ở tick 4872 | Giữ mục đích (đo thời gian chạy đủ 21 600 tick, mọi Bóng Mực đã sinh): scenario cho `flames: 1000`. Script bằng chứng làm giống vậy |
| Bot (autoplay) thắng bằng cách thắp hết đèn | Mục tiêu đổi sang *"giữ đảo sáng tới bình minh"* | Viết lại chiến thuật bot (§6) và `autoplay.test.ts` kiểm `dawn_survived` |

## 2. Quyết định thiết kế (ADR-003: mô hình trạng thái đèn và luật thắng)

**Bối cảnh.** Phase 1–2 coi đèn là "thanh tiến độ một chiều": `deposited` tăng tới 10 thì `lit = true` mãi mãi, và Đêm
kết thúc ngay khi mọi đèn sáng. Ticket-03 biến đèn thành tài nguyên phải duy trì: dầu hao theo thời gian và bị hút,
đèn tắt rồi thắp lại được, thắng chỉ xét lúc bình minh.

**Quyết định.**
1. Đèn có 5 trường: `lit`, `deposited` (tiến độ thắp khi chưa sáng), `fuel` (số nguyên đơn vị 1/60, 6000 = 100),
   `everLit`, `relitCount`. Hai trạng thái thật: **tắt** (`lit=false`, `fuel=0`, nhận đom đóm vào `deposited` tới giá
   10 hoặc 5 nếu `everLit`) và **sáng** (`fuel` 1..6000; nhận đom đóm như châm dầu, 10 dầu mỗi con). "Yếu" (`fuel < 30`)
   là thuộc tính suy ra, không phải trạng thái lưu: mất vùng an toàn và hút Bóng Mực.
2. Dầu là **số nguyên 1/60** (ticket: *"Nên tính dầu theo đơn vị nguyên 1/60"*): hao 1 đơn vị/tick, mỗi Bóng Mực hút
   5 đơn vị/tick, mỗi đom đóm châm 600. Không có sai số số thực; chỉ làm tròn 1 chữ số khi xuất (`fuelOut`).
3. Bước 2 có thêm `burnFuel` (hao + hút, rồi đèn `fuel ≤ 0` tắt và phát `lantern_out`) đúng chỗ ticket chỉ: *"ở bước 2
   trừ dầu (hao + bị hút); ngay sau bước 2, đèn có `fuel ≤ 0` tắt"*. Mọi chỗ dùng "đèn sáng = vùng an toàn" (đẩy ra ở
   bước 6, chặn khi di chuyển, chặn gây hit, điểm sinh hợp lệ) đổi sang một hàm duy nhất `hasSafeZone(l)` =
   `lit && fuel ≥ 30`.
4. Bóng Mực thêm trạng thái `drain` (đứng yên, không gây hit) và một trường `targetLanternId`. Các lối ra khỏi `drain`
   xét ở đầu bước 8, trước khi bóng di chuyển.
5. Luật thắng chuyển hẳn sang bước 11 lúc bình minh: `no_flames` (mọi tick) → nếu còn giờ thì chơi tiếp → hết giờ thì
   `dawn_survived` khi số đèn sáng ≥ `ceil(0.6 × n)`, ngược lại `dawn`. `all_lit` bị bỏ khỏi code.
6. Sức chứa không lưu riêng mà tính từ `successfulLights` (`capacity(w)`), nên scenario chỉ cần đặt
   `player.successful_lights`.

**Hệ quả.** Snapshot đèn lớn hơn (thêm 3 trường). Một đèn đang sáng gần như không bao giờ "đầy" lúc bấm Tương tác
(bước 2 đã hao 1/60 trước bước 5), nên đứng gần đèn sáng và bấm E sẽ châm dầu. Bot phải đổi chiến thuật (§6). Phía web
chỉ đọc `World`, không có luật riêng.

**Phương án bị loại.** (a) Dầu số thực: dễ lệch 1 tick ở ngưỡng 30 / 0 giữa các máy. (b) Thêm trạng thái lưu
`weak`: trùng với `fuel < 30`, dễ lệch khi châm dầu.

## 3. Chỗ ticket chưa nói rõ (P3-A1…A15)

| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| P3-A1 | Đèn vừa thắp có hao ngay tick đó không | Không: thắp ở bước 5, hao từ bước 2 của tick sau. Snapshot tick thắp có `fuel: 100` |
| P3-A2 | Làm tròn `fuel` | 1 chữ số thập phân, làm tròn gần nhất. Đèn tắt luôn `fuel: 0` |
| P3-A3 | Khi nào bắt đầu hút | Bóng `wander` chọn đèn yếu; nếu cách ≤ 2 m (XZ) trước hoặc sau bước đi của nó ở bước 8 thì chuyển `drain`. Hút bắt đầu ở bước 2 của tick sau |
| P3-A4 | *"`fuel_drain` … ghi mỗi 60 tick khi đang hút"* | Mỗi bóng đếm số tick hút liên tục; phát ở tick hút thứ 60, 120, … (sau khi trừ dầu của tick đó, `fuel` không âm). Rời `drain` thì đếm lại từ 0 |
| P3-A5 | *"Đèn đầy dầu (`used = 0`) không được chọn"* | Đèn sáng chỉ "nhận được" khi `fuel < 100`. Vì hao ở bước 2 đi trước, thực tế đèn sáng luôn nhận được ở bước 5 (trừ trường hợp không có) |
| P3-A6 | Scenario v1.2 | `lanterns[].fuel` là số trong [0, 100], chỉ dùng khi `lit: true` (mặc định 100); `ever_lit` mặc định = `lit`; `player.successful_lights` số nguyên ≥ 0; `shades[].target_lantern_id` phải thuộc L1…Ln; `state: "drain"` hợp lệ. Sai kiểu → mã 2 |
| P3-A7 | Bóng `wander` chọn đèn yếu khi nào | Giữ mục tiêu hiện tại khi đèn đó vẫn yếu, ngược lại chọn đèn yếu gần nhất (bằng nhau → id nhỏ hơn). *"Không có thì đi về đèn tắt gần nhất như trước"*: đi tới đèn chưa sáng gần nhất. Nếu mọi đèn đều sáng và ≥ 30 thì lang thang như A9 (điểm sinh đom đóm ngẫu nhiên). Thay A9 của Phase 2 |
| P3-A8 | Nhiều lối ra `drain` cùng lúc | Lý do về đèn trước (tắt, được châm ≥ 30, cách > 2 m → `wander`), rồi mới tới Mây ≤ 6 m → `chase`. Châm dầu luôn xảy ra khi Mây ≤ 4 m, nên nếu xét `chase` trước thì vế *"sang wander nếu fuel được châm lên ≥ 30"* không bao giờ xảy ra |
| P3-A9 | Bóng `drain` có gây hit không | Không (đứng yên hút). Nó gây hit sau khi chuyển `chase`, như mọi bóng khác |
| P3-A10 | Khóa điểm trong `tuning.score` | `per_mote 5, per_lantern 100, per_relight 40, per_stun 5, per_stun_drain 15` (tổng, không cộng thêm 5), `per_lit_at_dawn 50` (+ `floor(fuel)`), `per_flame_left 50`, `per_second_left 0` (thưởng thời gian bỏ) |
| P3-A11 | *"Hết choáng thì về wander"* | Hết choáng → `wander`, rồi ngay tick đó kiểm tra 12 m như mọi bóng `wander` (có thể `chase`). Hết `recoil` / `spawning` giữ A13 |
| P3-A12 | *"Khi đèn được châm dầu lên ≥ 30 lúc có Bóng Mực trong vùng 6 m"* | Dùng đúng cơ chế A11 (đẩy 0.2 m/tick, tối đa 30 tick, không gây hit), áp dụng mỗi khi một đèn có vùng an toàn chứa bóng |
| P3-A13 | Sức chứa và `carried` từ scenario | Không cắt `carried` về sức chứa; chỉ không nhặt thêm khi `carried ≥ capacity` |
| P3-A14 | Chế độ mù màu: *"đèn tắt bị xẹp 20% và giấy có vết rách; đèn sắp hết dầu nhấp nháy"* | Hình dạng (xẹp, vết rách) và nhấp nháy 1 Hz luôn bật, vì vô hại và ticket §1 yêu cầu nhấp nháy ở mọi chế độ. Cài đặt chỉ đổi màu: viền + mắt Bóng Mực `#00B3FF`, màu cảnh báo UI `#FFFFFF` kèm ⚠ |
| P3-A15 | Kiểm tra hiệu năng Contract v1.1 (21 600 tick ≤ 30 s) | Giữ nguyên (Đêm dài nhất nay 18 000 tick, nên 21 600 là mức an toàn hơn) |

## 4. Luật mới (R29–R35) và tiêu chí nghiệm thu (mỗi dòng có ít nhất một test headless kiểm JSONL)

| # | Luật |
|---|---|
| R29 | Dầu đèn: 100 khi thắp; −1/s; châm `min(mang, ceil((100−fuel)/10))`, +10 mỗi con, tối đa 100 |
| R30 | Đèn tắt khi `fuel ≤ 0` (ngay sau bước 2), `lantern_out`; thắp lại 5 nếu `ever_lit` |
| R31 | Đèn `fuel < 30` mất vùng an toàn |
| R32 | Bóng Mực `wander` → đèn yếu → `drain` (5/s, cộng dồn) → lối ra theo P3-A8; Tỏa Sáng trúng bóng `drain` +15 |
| R33 | Thắng chỉ lúc bình minh: còn Ngọn Lửa và ≥ `ceil(0.6 n)` đèn sáng (`dawn_survived`), điểm bình minh `50 + floor(fuel)` mỗi đèn sáng + 50 mỗi Ngọn Lửa |
| R34 | Sức chứa `10 + 2 × successful_lights`, tối đa 20 |
| R35 | Contract v1.2 (tuning, snapshot, scenario, event) + chế độ mù màu (web) |

| ID | Làm A | Thấy B | Test |
|---|---|---|---|
| AC47 | Đọc `game.contract.json` | `contract_version "1.2"`, 8 khóa mới, thời lượng 240/270/300, điểm mới | `contract.test.ts` |
| AC48 | Đèn sáng 60 tick; thắp bằng E | `fuel` 100 → 99; đèn tắt `fuel 0`; `lantern_lit {relight:false}`; 1 chữ số thập phân | `phase3` AC48 |
| AC49 | Đèn `fuel 0.5` | `lantern_out` ở tick 30; `lit false, deposited 0, fuel 0, ever_lit true` | `phase3` AC49 |
| AC50 | Châm dầu đèn 50 / đèn 20 | `refuel {amount 6, fuel 100}`, +30 / `{amount 3, fuel 50}` | `phase3` AC50 |
| AC51 | Đèn `ever_lit` tắt, nạp 5 | `lantern_lit {relight:true}`, `relit_count 1`, +65; đèn chưa từng sáng vẫn cần 10; tắt rồi thắp lại | `phase3` AC51 |
| AC52 | `successful_lights` 0 / 1 / 5 / 7; thắp + thắp lại | Sức chứa 10 / 12 / 20 / 20 và nhặt đúng chừng đó; 12 → 14 | `phase3` AC52 |
| AC53 | Đèn 30.75 dầu, bóng đuổi Mây ở trong vùng | Bóng dừng ở mép tới tick 45 (dầu đúng 30.0), tick 46 đi vào và gây hit | `phase3` AC53 |
| AC54 | Bóng `wander` gần đèn 20 dầu | `drain` ở tick 1; `fuel_drain` ở tick 61/121/181 (14/8/2); `lantern_out` tick 201; 2 bóng cộng dồn; chọn đèn yếu gần nhất (bằng nhau → id nhỏ); không có thì về đèn tắt gần nhất; bóng `chase` không đổi | `phase3` AC54 |
| AC55 | Lối ra `drain` | Mây 5.5 m → `chase`, 7 m → vẫn `drain`; châm lên 100 → `wander`, bị đẩy ra ≥ 6 m trong 30 tick, không hit; Tỏa Sáng → `stunned`, +15; hết choáng → `wander` | `phase3` AC55 |
| AC56 | Bình minh | Đêm 1 3/5 → thắng 597 điểm; 2/5 → `dawn`; đèn tắt đúng tick bình minh không tính; Đêm 2 cần 4/6, Đêm 3 cần 5/7; mất lửa cuối ở tick bình minh → `no_flames` | `phase3` AC56 |
| AC57 | Scenario v1.2 | Nhận `fuel/ever_lit/successful_lights/target_lantern_id/drain`; sai kiểu → mã 2 | `phase3` AC57 |
| AC58 | Thắp hết đèn | Không kết thúc Đêm, không có `all_lit` | `rules` AC16, AC17 |
| AC59 | Mỗi Đêm thắng được theo luật mới | Bot thắng và bản phát lại qua CLI kết thúc giống hệt (`dawn_survived`) | `autoplay.test.ts` |
| AC60 | Web: thanh dầu, nhấp nháy < 30, đèn tắt xẹp + rách, HUD `mang/sức chứa`, mù màu (lưu) | Ảnh chụp trong `docs/proof/phase-3/` | thủ công |

## 5. Cần hỏi trợ giảng Phase 3

- P3-A4: thời điểm phát `fuel_drain` (tick hút thứ 60 hay ngay tick bắt đầu hút).
- P3-A7: bóng `wander` có giữ mục tiêu đèn yếu hay chọn lại mỗi tick.
- P3-A8: thứ tự lối ra `drain` khi vừa châm dầu (Mây luôn ở gần).
- P3-A9: bóng `drain` có gây hit không.
- P3-A10: tên khóa điểm trong `tuning.score` (ticket không ghi tên).

## 6. Bot (autoplay) với luật mới

Thắp lại chỉ tốn 5 đom đóm cho 100 dầu, còn châm dầu tốn 1 đom đóm cho 10 dầu. Vì vậy bot không giữ đèn sáng cả đêm:
(1) đầu đêm thắp các đèn chưa từng sáng (+100 điểm, +2 sức chứa) rồi để chúng tự cạn; (2) sau đó gửi đom đóm vào đèn
đã tắt (tối đa giá − 1, đèn giữ phần đã nạp), để không mang ≥ 5 con (Gió Lạc) và bị đánh thì rơi ít hơn; (3) trong 69 s
cuối, làm cho đủ `ceil(0.6 n) + 1` đèn "an toàn tới bình minh" (`fuel ≥ thời gian còn + 31`, tức vẫn ≥ 30 lúc bình
minh nên không bao giờ bị hút) bằng việc rẻ nhất ở gần: thắp lại, thắp, hoặc châm dầu. Tỏa Sáng khi có ≥ 3 Bóng Mực
trong tầm. Kết quả quét seed ghi ở `docs/notes/ai-log.md`.
