# Bằng chứng kiểm chứng

Chạy lại toàn bộ: `npm ci && npm test` ở tag tương ứng. Mỗi AC (định nghĩa ở
[`phase-1-assumptions.md`](../notes/phase-1-assumptions.md) và [`phase-2-assumptions.md`](../notes/phase-2-assumptions.md) §4) là một test chạy **CLI headless thật**
(`tests/helpers.ts#runCli`) và kiểm tra dòng JSONL; tên test bắt đầu bằng mã AC.

## Phase 1

| Yêu cầu | AC | Kiểm chứng (file › describe) | Kết quả |
|---|---|---|---|
| `game.contract.json` đủ trường, `tuning` khớp code | — | `contract.test.ts` | Đạt |
| Snapshot tick 0, `--snapshot-every`, dòng `end` cuối; mô hình tick k → k+1 | — | `headless.test.ts` › output shape, tick model | Đạt |
| Xoay `move` theo `cam_yaw_deg`, chuẩn hóa, giữ giá trị cũ | — | `inputs.test.ts` | Đạt |
| Scenario dựng không phát event/điểm; sai định dạng → exit 2 | — | `headless.test.ts` › scenario setup, error handling | Đạt |
| Nhặt đom đóm (tự động, bán kính bao gồm biên, túi đầy) | AC1–AC3 | `rules.test.ts` › R1 pickup | Đạt |
| Nạp đèn, thắp đèn, kích hoạt theo cạnh, chọn đèn gần nhất | AC4–AC6 | `rules.test.ts` › R2/R3 | Đạt |
| Thắng (+ thưởng thời gian/lửa), đèn đặt sẵn không cộng điểm | AC16–AC17 | `rules.test.ts` › R10 win | Đạt |
| Bóng Mực đuổi, sợ đèn đã thắp, sinh ở rìa mỗi 30 s, id không trùng | AC7, AC15, AC18 | `rules.test.ts` › R4/R5/R6 | Đạt |
| Bị chạm: mất lửa, rơi đom đóm (nhặt lại được), bất tử 90 tick, thua `no_flames` | AC8–AC10 | `rules.test.ts` › R7/R11 | Đạt |
| Tỏa sáng: tốn đom đóm, choáng + đẩy, hồi chiêu, choáng hết hạn | AC11–AC14 | `rules.test.ts` › R8/R9 | Đạt |
| Thua `dawn` khi hết giờ | AC19 | `headless.test.ts` › tick model | Đạt |
| Tất định byte-identical trên một đêm đầy đủ luật | AC20 | `rules.test.ts` › AC20 | Đạt |
| Bản 3D: thua và chơi lại (R) | AC21 | Kiểm tra trên Chrome: đứng yên ~14 s → bị bắt 3 lần → màn "Mây đã hết lửa", R chơi lại; không lỗi console | Đạt |
| Phong cách PRD-0: Mây đội nón lá treo đèn lồng nhỏ; ấm = an toàn, tím = nguy hiểm; đèn tìm thấy được từ xa | AC21 | Trước: [`phase-1/visual-before.jpg`](phase-1/visual-before.jpg) (nhân vật trông như cây nấm, cột đèn chưa thắp gần như vô hình). Sau: [`phase-1/visual-after.jpg`](phase-1/visual-after.jpg), [`phase-1/visual-after-character.png`](phase-1/visual-after-character.png) | Đạt |
| Đêm 1 thắng được từ đầu đến cuối (bot chơi qua sim thật; inputs của bot chạy qua CLI ra cùng kết quả) | AC21 | `autoplay.test.ts` (seed 1, 7, 42) | Đạt |
| Bản 3D: nhặt → nạp → thắp đèn → thắng, chơi lại | AC21 | Phát lại inputs của bot trên web (`?seed=7&replay=replays/seed7-win.inputs.json&speed=2`): [`start`](phase-1/replay-seed7-1-start.jpg) → [`đèn đầu tiên`](phase-1/replay-seed7-2-first-lantern.jpg) → [`Bóng Mực đuổi`](phase-1/replay-seed7-3-shades-chasing.jpg) → [`tại đèn`](phase-1/replay-seed7-4-at-lantern.jpg) → [`thắng 1517 điểm`](phase-1/replay-seed7-5-won.jpg). Điểm trên màn hình = dòng `end` headless: [`replay-seed7-headless-end.txt`](phase-1/replay-seed7-headless-end.txt) | Đạt |

Kết quả `npm test` tại commit cuối Phase 1: **61/61 đạt** (3 file test + contract).

> Ảnh Phase 1 dùng file `seed7-win.inputs.json` theo luật Phase 1; file này đã bỏ ở Phase 2 vì luật/số liệu đổi
> (xem ở tag `phase-1`).

## Phase 2 (Ticket-02, Contract v1.1)

| Yêu cầu | AC | Kiểm chứng | Kết quả |
|---|---|---|---|
| `contract_version "1.1"`, `tuning` = số chuẩn + 5 khóa mới, khớp code | AC22 | `contract.test.ts` | Đạt |
| `--night 1/2/3`, đèn/điểm sinh/xuất phát/thời lượng chuẩn từng Đêm; `--night 4` → mã 1 | AC23 | `phase2.test.ts` › AC23; `headless.test.ts` › AC23 | Đạt |
| Snapshot v1.1 (`night`, `wind`, `player.*` mới, `motes/drifters/charms`); `night_start` ở tick 1 | AC24, AC42 | `headless.test.ts` › output shape | Đạt |
| Nhặt theo XZ ≤ 1 m và chênh cao ≤ 1.5 m (nhảy với tới; tầng khác không nhặt) | AC25 | `phase2.test.ts` › AC25 | Đạt |
| Nạp `min(mang, còn thiếu)`, điểm khi nạp | AC26 | `phase2.test.ts` › AC26; `rules.test.ts` › R2/R3 | Đạt |
| Đom đóm sinh thêm mỗi 240 tick, trần 30 / hết điểm trống | AC27 | `phase2.test.ts` › AC27 | Đạt |
| Lịch sinh Bóng Mực (300 + khoảng sinh từng Đêm, tối đa), `spawning` 30 tick, cách ≥ 15 m | AC28 | `phase2.test.ts` › AC28 | Đạt |
| `wander` / `chase` 12 m / bỏ đuổi 18 m | AC29 | `phase2.test.ts` › AC29 | Đạt |
| Hit: `recoil` 2 m/60 tick, đom đóm rơi sống 480 tick, chênh cao > 1.5 m không hit | AC30 | `phase2.test.ts` › AC30; `rules.test.ts` › R7/R11 | Đạt |
| Hết lửa xét trước thắng | AC31 | `phase2.test.ts` › AC31 | Đạt |
| Tỏa Sáng 3D từ chân + 0.8 m, đẩy 4 m/15 tick dừng ở vật cản, +5 kể cả con đang choáng | AC32 | `phase2.test.ts` › AC32; `rules.test.ts` › R8/R9 | Đạt |
| Vùng an toàn 6 m; bóng bên trong khi đèn vừa thắp bị đẩy ra ≤ 30 tick, không gây sát thương | AC33 | `phase2.test.ts` › AC33; `rules.test.ts` › AC15 | Đạt |
| Lướt 14 m/s × 12 tick, hồi 90 tick, hướng mặt khi đứng yên, giữ độ cao trên không; **không bất tử khi lướt** (slide CP2) | AC34 | `phase2.test.ts` › AC34 | Đạt |
| Rơi khỏi đảo: 1 lần, bỏ qua bất tử, mất toàn bộ, chờ 60 tick, hồi sinh bất tử | AC35 | `phase2.test.ts` › AC35 | Đạt |
| Đêm 2: cầu tre, rơi khỏi mép cầu, bục nhảy đáp đảo B (~1.4 s), phím không ghi đè, **vẫn lướt được khi đang bay** (ghi chú slide 14) | AC36 | `phase2.test.ts` › AC36 | Đạt |
| Đêm 3: vách tầng, dốc 30°, bục lên tầng 2, tháp chuông chặn, bước xuống tầng không phải "rơi" | AC37 | `phase2.test.ts` › AC37 | Đạt |
| Gió Lạc: idle → chase (≥ 5, ≤ 15 m) → cướp 3 → flee 240 tick → removed; tỏa sáng lúc chase/flee; bỏ qua bất tử/vùng an toàn; sinh ở tick 1200 | AC38 | `phase2.test.ts` › AC38 | Đạt |
| Bùa Gió: `charm_picked`, 7.2 m/s, lướt không hồi chiêu, xuất hiện lại sau 2700 tick, nhặt lại làm mới | AC39 | `phase2.test.ts` › AC39 | Đạt |
| Gió mạnh Đêm 3: tick 1800–2099 đẩy 2 m/s (10 m), `wind_enabled:false` tắt; Đêm 1–2 không gió | AC40 | `phase2.test.ts` › AC40 | Đạt |
| Tạm dừng: `paused`/`resumed`, `tick` tăng, `sim_tick`/giờ/vị trí đứng yên, nút bị bỏ qua, `end` ghi `paused` | AC41 | `phase2.test.ts` › AC41 | Đạt |
| Một Đêm 21 600 tick < 30 s; tất định byte-identical (Đêm 2, 3 với mọi luật mới) | AC43 | `phase2.test.ts` › AC43; [`headless/timing.txt`](phase-2/headless/timing.txt) (≈ 0.6–1.1 s/Đêm), [`headless/determinism.txt`](phase-2/headless/determinism.txt) | Đạt |
| Regression Phase 1 với số chuẩn | AC44 | `rules.test.ts`, `headless.test.ts`, `inputs.test.ts` (lý do đổi kỳ vọng: assumptions §1) | Đạt |
| Cả 3 Đêm thắng được (bot qua sim thật; inputs của bot qua CLI ra cùng kết quả) | — | `autoplay.test.ts` (Đêm 1–2 seed 1/7/42, Đêm 3 seed 2/3/7) | Đạt |

### Bằng chứng headless dạng file (slide 19: input + output log + kết quả; chạy 2 lần cùng seed rồi so diff)

Sinh lại bằng `scripts/proof-headless.sh` (build headless rồi chạy CLI thật; máy/commit ghi ở `env.txt`):

| Yêu cầu | Cách kiểm chứng | File bằng chứng | Kết quả |
|---|---|---|---|
| Cả 3 Đêm thắng được qua CLI chấm | inputs của bot → `--ticks 21600` | [`replays-end.txt`](phase-2/headless/replays-end.txt) | Đạt (Đêm 1: 1446, Đêm 2: 1476, Đêm 3: 1580; đều `won`) |
| Tính tất định | chạy 2 lần cùng seed 7 + cùng inputs, `cmp` | [`determinism.txt`](phase-2/headless/determinism.txt) | Đạt (IDENTICAL cả 3 Đêm) |
| 1 Đêm 21 600 tick ≤ 30 s | đứng trong vùng an toàn, Bóng Mực sinh tới trần, đo thời gian thực | [`timing.txt`](phase-2/headless/timing.txt) | Đạt (≈ 0.6 / 0.9 / 1.1 s) |
| Mẫu output đầy đủ | Đêm 3 seed 7, snapshot mỗi 600 tick | [`n3-seed7-every600.jsonl`](phase-2/headless/n3-seed7-every600.jsonl) | — |

### Bản web (AC45) — phát lại inputs của bot qua cùng `step()`

Lệnh: `npm run autoplay -- --seed 7 --night N` rồi mở `?seed=7&replay=replays/n{night}-seed7-win.inputs.json&speed=40`.
Điểm trên màn hình **bằng** dòng `end` của headless (`node dist-headless/headless/cli.js --seed 7 --night N --ticks 21600 --inputs public/replays/nN-seed7-win.inputs.json`):

| Đêm | Headless `end` | Màn kết quả web |
|---|---|---|
| 1 | `{"ticks":9089,"state":"won","score":1446}` | [1446](phase-2/07-result-night1.jpg) |
| 2 | `{"ticks":16009,"state":"won","score":1476}` | [1476](phase-2/09-result-night2.jpg) |
| 3 | `{"ticks":20665,"state":"won","score":1580}` | [1580](phase-2/13-result-night3.jpg) |
| Bình Minh | 1446 + 1476 + 1580 = 4502 | [4502](phase-2/14-dawn-total.jpg) |

| Mục ticket | Ảnh |
|---|---|
| 3. Menu chính → giới thiệu Đêm (tên đảo, lời Ông Đăng) → chơi → kết quả → Đêm kế → Bình Minh; thua thì chơi lại Đêm | [menu](phase-2/01-menu.jpg), [giới thiệu Đêm 2](phase-2/03-intro-night2.jpg), [giới thiệu Đêm 3](phase-2/10-intro-night3.jpg), [kết quả](phase-2/07-result-night1.jpg), [Bình Minh](phase-2/14-dawn-total.jpg), [thua → "Chơi lại Đêm 1"](phase-2/15-lost-replay-night.jpg) (bấm nút → về giới thiệu Đảo Bến, đã kiểm tra) |
| 4. Tạm dừng (Esc/P), logic dừng hẳn, 4 lựa chọn | [tạm dừng](phase-2/05-pause.jpg): đồng hồ giữ nguyên `05:29` sau 4 s tạm dừng (đọc DOM) |
| 5. Cài đặt âm lượng + độ nhạy chuột, lưu giữa các lần mở | [cài đặt](phase-2/02-settings.jpg): đặt âm lượng 29 → tải lại trang → vẫn 29 (`localStorage` `{"volume":0.29,...}`) |
| 6. Âm thanh | WebAudio tổng hợp (`src/web/audio.ts`): nhạc nền đêm + nhặt, nạp, thắp, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10 s, gió, bùa, bị cướp. Không kiểm chứng được bằng ảnh; cần nghe thử |
| 7. HUD đủ 8 mục | [HUD Đêm 2](phase-2/04-hud-night2.jpg) (lửa, `mm:ss`, đèn k/n + điểm, thanh 10 ô, hồi chiêu Shift/F, mũi tên đèn ngoài màn hình), [nhắc "E — Nạp ánh sáng (0/10)" + thanh đầy](phase-2/16-deposit-prompt.jpg) (bắt khung bằng cách gửi phím P khi nhắc hiện rồi ẩn lớp phủ tạm dừng để chụp), [vùng an toàn quanh đèn đã sáng](phase-2/06-night1-all-lit.jpg), [Gió Lạc cướp](phase-2/08-night2-drifter-steal.jpg) |
| 8. Bảng màu chuẩn, ánh sáng 0.15 + 0.55 × tỉ lệ | `src/web/palette.ts` (hex đúng bảng); so sánh [0/5 đèn](phase-2/04-hud-night2.jpg) với [5/5 đèn](phase-2/06-night1-all-lit.jpg) |
| Đêm 3: tầng, dốc, gió (lá bay + cảnh báo), Bùa Gió | [dốc + cảnh báo gió](phase-2/11-night3-wind-warning-ramp.jpg), [lá bay](phase-2/11b-night3-wind-leaves.jpg), [Bùa Gió](phase-2/12-night3-charm.jpg) |

### FPS (AC46)

Máy: AMD Radeon 780M (iGPU, Mesa radeonsi), Chrome, Linux. Trong phiên tự động, cửa sổ Chrome bị che nên trình duyệt
**bóp `requestAnimationFrame` còn 2–4 lần/giây kể cả với trang JSON tĩnh**, đồng hồ FPS khi đó không phản ánh game.
Vì vậy đo chi phí thật mỗi khung bằng `__bench(n)` (`?fps=1`): render liên tiếp ở bộ đệm 1280×720 và chờ GPU xong từng khung (`readPixels`).

| Cảnh | Khung | ms/khung TB | p95 | ≈ FPS tương đương |
|---|---|---:|---:|---:|
| Đêm 3 đầu đêm (4 bóng, 0 đèn) | 120 | 2.92 | 3.60 | 342 |
| Đêm 3 cuối đêm (10 bóng, 7 đèn sáng, 186 draw call, 23k tam giác) | 180 | 4.17 | 5.70 | 240 |

Kết luận: ≥ 30 FPS ở 1280×720 với dư địa lớn. **Cần người chơi xác nhận thêm** bằng đồng hồ `?fps=1` trong cửa sổ đang mở
phía trước (số "TB" là trung bình 30 s gần nhất).
