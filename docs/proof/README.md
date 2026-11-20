# Bằng chứng kiểm chứng

Chạy lại toàn bộ: `npm ci && npm test` ở tag tương ứng. Mỗi AC (định nghĩa ở
[`docs/notes/phase-1-assumptions.md`](../notes/phase-1-assumptions.md)) là một test chạy **CLI headless thật**
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
| Bản 3D chơi được: HUD, thua, chơi lại (R) | AC21 | Kiểm tra tay trên Chrome: đứng yên ~14 s → bị bắt 3 lần → màn "Mây đã hết lửa", R chơi lại; không lỗi console | Đạt một phần |
| Phong cách PRD-0: Mây đội nón lá treo đèn lồng nhỏ; ấm = an toàn, tím = nguy hiểm; đèn tìm thấy được từ xa | AC21 | Trước: [`phase-1/visual-before.jpg`](phase-1/visual-before.jpg) (nhân vật trông như cây nấm, cột đèn chưa thắp gần như vô hình). Sau: [`phase-1/visual-after.jpg`](phase-1/visual-after.jpg), [`phase-1/visual-after-character.png`](phase-1/visual-after-character.png) | Đạt |
| Bản 3D: nhặt → nạp → thắp đèn → thắng | AC21 | Logic đã có test headless; **chưa có ảnh/clip chơi tay đến khi thắng** | Chưa có bằng chứng hình ảnh |

Kết quả `npm test` tại commit cuối Phase 1: **58/58 đạt** (3 file test + contract).
