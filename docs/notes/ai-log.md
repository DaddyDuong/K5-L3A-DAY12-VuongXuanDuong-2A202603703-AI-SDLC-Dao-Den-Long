# Nhật ký dùng AI

Công cụ: Claude Code (Opus 5.5). Harness: `CLAUDE.md`, hook Stop `.claude/hooks/stop-require-green.sh`.

| Phase | Việc | Prompt chính / cách điều phối | AI sai ở đâu, cách phát hiện | Token / chi phí ước tính |
|---|---|---|---|---|
| 1 | Onboard: đọc tài liệu lab + lab board | "onboard tôi bài lab này" | — | _(điền từ `/cost`)_ |
| 1 | Khung dự án: sim + headless CLI + test + web + harness | "hoàn thiện nó cho tôi" (bước 1 của kế hoạch) | — | _(điền)_ |
| 1 | Chốt giả định + 21 tiêu chí nghiệm thu (không code) | "hoàn thiện cho tôi" (chấp nhận toàn bộ đề xuất bước 2) | — | _(điền)_ |
| 1 | Bước 3: code luật theo 6 lát, mỗi lát test AC trước (thấy đỏ) → code → xanh → commit | "hoàn thiện cho tôi" | Test AC20 ban đầu kỳ vọng có `player_hit` khi đi lang thang, nhưng người chơi (6 m/s) nhanh hơn Bóng Mực (3.5 m/s) nên không bao giờ bị chạm. Phát hiện nhờ test đỏ + in số event/vị trí từ JSONL. Sửa **kịch bản test** (đứng yên 20 s cuối), không sửa luật | _(điền)_ |
| 1 | Sửa tạo hình Mây và cột đèn (chỉ `src/web`) | Người dùng hỏi "tạo hình nhân vật như này liệu có phù hợp?" kèm ảnh chụp | Bản đầu AI dựng đúng "chữ" của PRD (nón + quả cầu) nhưng không kiểm tra **nhìn thực tế**: đèn treo nằm phía trước nên camera sau lưng không thấy, nón tối, cột đèn chưa thắp gần như vô hình. Người dùng phát hiện qua ảnh; AI sửa rồi kiểm tra lại bằng ảnh chụp/zoom từ Chrome | _(điền)_ |
| 1 | Bot tự chơi + chế độ replay web + skill `play-and-capture` | "bạn không tự động làm được à" (sau khi AI đề nghị người dùng tự chơi để lấy ảnh) | Công cụ trình duyệt không giữ phím được, nên thay vì điều khiển bàn phím, AI cho bot chơi qua sim thật rồi phát lại inputs trên web. AI tự bắt được lỗi TDZ (`endReason` dùng trước khi khai báo) khi đọc lại diff, trước khi chạy | _(điền)_ |

## Đánh giá nhanh Phase 1

- Đạt: mọi AC1–AC20 có test headless; tất định byte-identical; bản web chạy, thua và chơi lại được.
- AC21 đạt bằng bot + replay: thắng 3/3 seed trong test, ảnh phát lại seed 7 khớp điểm headless (1517).
- Quan sát: nhiều Bóng Mực đuổi cùng một mục tiêu nên **dồn vào một điểm**; không sai yêu cầu nhưng trên màn hình trông như một con. Có thể thêm lực tách nhau (phải giữ tất định và cập nhật test).
- Quan sát: đứng yên ~14 s là thua, nhưng bot tham lam thắng cả 5 seed thử (1, 2, 3, 7, 42) trong 38–52 s mà **không mất lửa nào**, với 3 lần tỏa sáng. Game đang dễ với người chơi chủ động; có thể cần chỉnh nếu ticket sau yêu cầu độ khó.
- Quan sát: không có va chạm giữa người chơi và cột đèn (Mây có thể đứng "trong" cột). Không thuộc yêu cầu, ghi lại để cân nhắc.
- Harness: hook Stop chạy `npm test` mỗi lần agent kết thúc, chưa phải chặn lần nào trong phase này.
