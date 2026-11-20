# Nhật ký dùng AI

Công cụ: Claude Code (Opus 5.5). Harness: `CLAUDE.md`, hook Stop `.claude/hooks/stop-require-green.sh`.

| Phase | Việc | Prompt chính / cách điều phối | AI sai ở đâu, cách phát hiện | Token / chi phí ước tính |
|---|---|---|---|---|
| 1 | Onboard: đọc tài liệu lab + lab board | "onboard tôi bài lab này" | — | _(điền từ `/cost`)_ |
| 1 | Khung dự án: sim + headless CLI + test + web + harness | "hoàn thiện nó cho tôi" (bước 1 của kế hoạch) | — | _(điền)_ |
| 1 | Chốt giả định + 21 tiêu chí nghiệm thu (không code) | "hoàn thiện cho tôi" (chấp nhận toàn bộ đề xuất bước 2) | — | _(điền)_ |
| 1 | Bước 3: code luật theo 6 lát, mỗi lát test AC trước (thấy đỏ) → code → xanh → commit | "hoàn thiện cho tôi" | Test AC20 ban đầu kỳ vọng có `player_hit` khi đi lang thang, nhưng người chơi (6 m/s) nhanh hơn Bóng Mực (3.5 m/s) nên không bao giờ bị chạm. Phát hiện nhờ test đỏ + in số event/vị trí từ JSONL. Sửa **kịch bản test** (đứng yên 20 s cuối), không sửa luật | _(điền)_ |

## Đánh giá nhanh Phase 1

- Đạt: mọi AC1–AC20 có test headless; tất định byte-identical; bản web chạy, thua và chơi lại được.
- Chưa có: ảnh/clip chơi tay đến khi thắng (AC21 một phần).
- Quan sát: nhiều Bóng Mực đuổi cùng một mục tiêu nên **dồn vào một điểm**; không sai yêu cầu nhưng trên màn hình trông như một con. Có thể thêm lực tách nhau (phải giữ tất định và cập nhật test).
- Quan sát: đứng yên ~14 s là thua; độ khó có thể cần chỉnh nếu ticket sau yêu cầu.
- Harness: hook Stop chạy `npm test` mỗi lần agent kết thúc, chưa phải chặn lần nào trong phase này.
