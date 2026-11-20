# Bằng chứng kiểm chứng

Chạy lại toàn bộ: `npm ci && npm test` ở tag tương ứng.

## Phase 1

| Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` đủ trường, `tuning` khớp code | `tests/contract.test.ts` | `npm test` | Đạt |
| Snapshot tick 0, chu kỳ `--snapshot-every`, dòng `end` cuối | `tests/headless.test.ts` | `npm test` | Đạt |
| Mô hình tick (input tick k → state k+1, event tick k+1) | `tests/headless.test.ts` › tick model | `npm test` | Đạt |
| Xoay `move` theo `cam_yaw_deg`, chuẩn hóa | `tests/inputs.test.ts` | `npm test` | Đạt |
| Scenario dựng không phát event/điểm | `tests/headless.test.ts` › scenario setup | `npm test` | Đạt |
| Tính tất định (byte-identical) | `tests/headless.test.ts` › determinism | `npm test` | Đạt |
| Sai định dạng → exit 2 | `tests/headless.test.ts` › error handling | `npm test` | Đạt |
| Nhặt, nạp/thắp đèn, Bóng Mực, tỏa sáng, thắng/thua, điểm (AC1–AC18, AC20 trong `docs/notes/phase-1-assumptions.md`) | Test headless theo từng AC | — | **Chưa làm** |
| Game 3D chơi được từ đầu đến thắng/thua, chơi lại (AC21) | Chạy `npm start`, chụp ảnh/GIF | _(thêm ảnh)_ | Một phần |
