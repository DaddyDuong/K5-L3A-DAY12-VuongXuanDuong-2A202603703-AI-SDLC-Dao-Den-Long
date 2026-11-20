# Phase 1 — Giả định và tiêu chí nghiệm thu

Nguồn: PRD-0 + Test Contract v1.0 (lab board, tab Phase 1).

## Quyết định kỹ thuật
- TypeScript, logic thuần trong `src/sim` dùng chung cho web và headless → headless không cần GPU, tất định.
- PRNG mulberry32 seed từ `--seed`; không dùng `Math.random`/`Date` trong logic.

## Giả định đã áp dụng trong code (khung)
| # | Chỗ mơ hồ | Giả định |
|---|---|---|
| A1 | Đảo tròn bán kính bao nhiêu | 40 m; 5 đèn trên vòng bán kính 25 m, L1 ở +Z, cách đều 72° |
| A2 | Rơi khỏi đảo | Không rơi (`fall_enabled: false`): rìa đảo là tường vô hình |
| A3 | `move` có thành phần ngoài [−1, 1] | Kẹp về [−1, 1], không coi là sai định dạng |
| A4 | Hết thời gian Đêm 1 | Thua, `game_over {result: lost, reason: dawn}` |
| A5 | Số đom đóm mặc định | 30 con, rải ngẫu nhiên trong đảo (cách tâm ≥ 3 m) |
| A6 | Thiếu tham số bắt buộc / `--night` ≠ 1 | Thoát mã 1 (khác 2 vì không phải lỗi file) |

## Con số `tuning` (đề xuất — cần duyệt trước khi làm luật)
Xem `src/sim/tuning.ts`. TODO: ghi lý do cho từng số, và giả định cho: nhặt tự động hay bấm E, nạp một lần hết hay từng con, Bóng Mực sinh ra ở đâu/bao nhiêu, cách cộng điểm khi thắng.

## Tiêu chí nghiệm thu
_(Điền ở bước 2.)_
