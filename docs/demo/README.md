# Video demo (CP5) — kịch bản < 5 phút

File nộp: `docs/demo/demo.mp4` hoặc đính kèm Release `v1.0.0`; link đặt ở **dòng đầu README**.
Ticket-04 §7: "chơi trực tiếp một đoạn, cho thấy bằng chứng game chạy đúng (test, headless, bench)"; slide CP5 thêm:
lướt `CLAUDE.md`, git log và tag.

| Thời điểm | Cảnh | Lệnh / thao tác |
|---|---|---|
| 0:00–0:20 | Giới thiệu: tên game, 3 Đêm, luật thắng bình minh ≥ 60% đèn | README trên GitHub (ảnh + bảng Đêm) |
| 0:20–1:50 | **Chơi trực tiếp** Đêm 1: nhặt đom đóm, thắp đèn, châm dầu, Tỏa Sáng, phụ đề + mũi tên mép khi Bóng Mực xuất hiện | `npm start` |
| 1:50–2:20 | Cài đặt: đổi phím (thử phím trùng → báo lỗi), chữ lớn, giảm chuyển động; thua/Bình Minh → nhập tên → Bảng xếp hạng | trong game |
| 2:20–2:50 | Test: toàn bộ xanh | `npm test` (cắt ghép phần chờ) |
| 2:50–3:20 | Headless: replay bot thắng Đêm 3, dòng `end` | `node dist-headless/headless/cli.js --seed 7 --night 3 --ticks 21600 --inputs public/replays/n3-seed7-win.inputs.json --out o.jsonl && tail -1 o.jsonl` |
| 3:20–4:00 | Benchmark: cửa sổ 1280×720 bay vòng 200 Bóng Mực, in PASS + `bench.json` | `node dist-headless/app/bench.js --seed 42 --duration 10 --out demo-bench.json` (bản ngắn, không ghi đè `bench.json` đã commit) |
| 4:00–4:20 | Soak + xuất bảng xếp hạng | `node --expose-gc dist-headless/headless/soak.js --seed 7 --nights 10 --out demo-soak.json`; `node dist-headless/app/run.js --export-leaderboard out.json` |
| 4:20–4:50 | Harness: `CLAUDE.md`, hook Stop, skill, `git log --oneline`, `git tag` | editor + terminal |

Ghi hình trên Linux: OBS Studio, hoặc `wf-recorder -f docs/demo/demo.mp4` (Wayland) / `ffmpeg -f x11grab` (X11).
Giữ file < 100 MB (GitHub chặn file lớn hơn trong repo); nếu lớn hơn, đính kèm vào Release thay vì commit.
