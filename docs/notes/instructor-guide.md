# Hướng dẫn của giảng viên (tóm tắt từ slide Day 12) và checklist hoàn thành

Nguồn: bộ slide giảng viên "Day 12 Instructor Deck: AI SDLC — Đảo Đèn Lồng" (26 slide, đọc ngày 2026-11-20).
Đây là tóm tắt các điểm áp dụng cho repo này, không phải bản chép slide. Khi slide khác lab board / Ticket:
ticket là yêu cầu, slide là cách chấm; lời Coach tại lớp là quyết định cuối cùng (slide 2).

## Luật chung (slide 3, 4, 8, 9, 19, 24)

- Mỗi phase ~60 phút, **hết giờ thì tag `phase-N` và push**, dù chưa hoàn hảo. Commit sau mốc giờ của phase có thể
  không được tính cho phase đó. Phần chưa làm kịp: ghi trung thực "Chưa đạt" + lý do trong `docs/proof/`.
- Giảng viên clone sạch và checkout **từng tag**; bộ test ẩn chạy trên từng tag, test phase trước chạy lại ở phase
  sau (chống hồi quy). Không force-push, không viết lại lịch sử.
- 0 điểm khi: bằng chứng giả (test luôn pass, sửa tay log), repo private, thiếu tag/Release, lộ API key.
- Không cộng điểm cho đồ họa hay độ phức tạp vượt yêu cầu: **game tốt là game đúng yêu cầu**.
- Không có bằng chứng = chưa xong. Giảng viên chạy lại ngẫu nhiên scenario ở tag; khác bằng chứng → trừ nặng.

## Rubric 100 điểm (slide 24)

| Mục | Điểm | Repo này đáp ứng bằng |
|---|---:|---|
| A Test ẩn headless | 30 | `src/headless/cli.ts` theo Contract v1.3 (v1.0–v1.2 giữ tương thích); `npm test` |
| B Bằng chứng | 20 | `docs/proof/README.md` (bảng truy vết), `docs/proof/phase-2/`, `scripts/proof-headless.sh` |
| C SDLC & Harness | 15 | commit nhỏ; `CLAUDE.md` (< 50 dòng, sửa qua các phase); skill `play-and-capture`; hook Stop chặn khi test đỏ; CI |
| D Retro & token | 10 | `docs/notes/ai-log.md` (token/chi phí mỗi phase), `docs/notes/retro.md` (CP5) |
| E Hiệu năng | 10 | Phase 4 (bench/soak); Phase 2 có `__bench` + `timing.txt` |
| F Đúng yêu cầu | 10 | chơi thử 3 Đêm (ảnh `docs/proof/phase-2/`) |
| G Video | 5 | CP5 |

## Phase 2 theo slide (CP2, slide 13–15)

Coach nhấn mạnh 3 điều: (1) **thay toàn bộ số tự chọn Phase 1 bằng số chuẩn**, không giữ số riêng;
(2) **chống hồi quy**: test ẩn Phase 1 chạy lại với số chuẩn; (3) **thứ tự 12 bước trong tick**:
Input → Bộ đếm → Di chuyển → Nhặt → Đèn → Vùng an toàn → Tỏa Sáng → Quái → Chạm → Spawn → Thắng/Thua → Snapshot.

Lỗi thường gặp được nêu tên: quên trần 10 đom đóm; **cho bất tử khi đang lướt** (luật: không bất tử);
chạy headless 1 Đêm quá 30 s.

Ghi chú của Coach (không có trong bảng số của slide, có trong Ticket-02):
- Gió Lạc không trừ Ngọn Lửa, chỉ cướp đom đóm; vùng an toàn của đèn không chặn Gió Lạc.
- Bục nhảy: vận tốc phóng giữ tới khi chạm đất, phím di chuyển không ghi đè, nhưng **vẫn được lướt khi đang bay**.
- Gió mạnh Đêm 3: cảnh báo trước 2 s bằng lá bay và âm thanh.

## Checklist "Phase 2 đã xong" (Definition of Done)

Tự kiểm bằng lệnh; cột cuối là trạng thái lúc viết.

| # | Điều kiện | Cách tự kiểm | Trạng thái |
|---|---|---|---|
| 1 | Mọi hằng số khớp bảng số chuẩn; `contract_version` "1.1" | `npm test` › `contract.test.ts` | Đạt |
| 2 | 3 Đêm đúng bản đồ chuẩn; `--night 1/2/3` | `phase2.test.ts` › AC23, AC36, AC37 | Đạt |
| 3 | Lướt, rơi, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng theo Contract v1.1 | `phase2.test.ts` › AC34–AC41 | Đạt |
| 4 | Các lỗi Coach nêu: trần 10, không bất tử khi lướt, lướt khi bay từ bục, Gió Lạc bỏ qua vùng an toàn | `rules.test.ts` › AC3; `phase2.test.ts` › AC34, AC36, AC38 | Đạt |
| 5 | Thứ tự 12 bước | `src/sim/step.ts` (chú thích đánh số); AC30 kiểm hệ quả "quái đi trước chạm" | Đạt |
| 6 | Hồi quy Phase 1 với số chuẩn | `rules.test.ts`, `headless.test.ts`; lý do đổi kỳ vọng ở `phase-2-assumptions.md` §1 | Đạt |
| 7 | 1 Đêm 21 600 tick ≤ 30 s; tất định | `scripts/proof-headless.sh` → `timing.txt`, `determinism.txt` | Đạt (≈ 1 s) |
| 8 | Cả 3 Đêm thắng được | `autoplay.test.ts`; `replays-end.txt` | Đạt |
| 9 | Web: HUD đầy đủ, chuỗi 3 Đêm, tạm dừng, cài đặt, âm thanh | ảnh `docs/proof/phase-2/01–16`; âm thanh cần người nghe thử | Đạt (âm thanh: người dùng xác nhận) |
| 10 | Giả định ghi rõ, câu hỏi mở cho trợ giảng | `phase-2-assumptions.md` (A1–A33, §5) | Đạt |
| 11 | Harness cập nhật trong git history | `git log -- CLAUDE.md .claude/` | Đạt |
| 12 | Nhật ký token/chi phí Phase 2 | `docs/notes/ai-log.md` | Đạt ($22.45) |
| 13 | Clone sạch ở tag chạy được theo README | `git clone <repo> x && cd x && git checkout phase-2 && npm ci && npm test` | Kiểm lại sau khi tag |
| 14 | Tag `phase-2` trên GitHub | `git ls-remote --tags origin phase-2` | Đạt (`4e28377`) |

Phase 2 xong khi cả 14 dòng là "Đạt" và lệnh ở dòng 14 in ra một commit.

## Checklist "Phase 3 đã xong" (DoD của Ticket-03)

| # | Điều kiện | Cách tự kiểm | Trạng thái |
|---|---|---|---|
| 1 | Bằng chứng game chạy đúng yêu cầu Phase 3 | `docs/proof/README.md` § Phase 3, `phase3.test.ts` AC48–AC57 | Đạt |
| 2 | Ghi chú quyết định thiết kế về mô hình đèn và luật thắng | ADR-003 trong `phase-3-assumptions.md` §2 | Đạt |
| 3 | Test cũ bị luật mới làm sai: sửa hoặc xóa có lý do, không skip | `phase-3-assumptions.md` §1; `grep -rn "\.skip\|\.todo" tests` rỗng | Đạt |
| 4 | Changelog các thay đổi phá vỡ tương thích | `CHANGELOG.md` | Đạt |
| 5 | Test Phase 1–2 không bị thay vẫn đạt | `npm test` (154/154) | Đạt |
| 6 | Mỗi Đêm thắng được | `autoplay.test.ts` (seed 1, 7 × 3 Đêm); quét seed 1–48: 48/48 · 48/48 · 45/48 (§6 assumptions) | Đạt |
| 7 | Tag `phase-3` trên GitHub | `git ls-remote --tags origin phase-3` | Đạt (`a060642`) |

## Checklist "Phase 4 đã xong" (DoD của Ticket-04 + slide CP4/CP5)

| # | Điều kiện | Cách tự kiểm | Trạng thái |
|---|---|---|---|
| 1 | Bằng chứng game chạy đúng yêu cầu Phase 4 | `docs/proof/README.md` § Phase 4, `phase4.test.ts` AC62–AC72 | Đạt |
| 2 | `bench.json` tự chạy, commit; cảnh bench tắt sinh quái/sát thương/nhặt/hao dầu (không có thực thể tự chế) | `bench.json`, AC63, P4-A8/A10 | Đạt (166 FPS) |
| 3 | `soak.json` tự chạy, commit | `soak.json`: 0 crash, tỷ lệ bộ nhớ 1.37 > 1.2 | Có file; ngưỡng bộ nhớ **chưa đạt** (phân tích §6 assumptions) |
| 4 | Contract v1.3: `bench_cmd`, `soak_cmd`; v1.0–v1.2 giữ nguyên | `contract.test.ts`; `docs/proof/phase-4/headless-unchanged.txt` | Đạt |
| 5 | Test ẩn Phase 1–3 vẫn đạt | `npm test` (175/175), không `.skip` | Đạt |
| 6 | Bảng xếp hạng, đổi phím, phụ đề, giảm chuyển động, chữ ≥ 18 px | AC69–AC74, ảnh `docs/proof/phase-4/` | Đạt |
| 7 | README ≤ 3 lệnh + mô tả, ảnh, yêu cầu hệ thống, điều khiển, test, headless, bench, soak | `README.md` | Đạt |
| 8 | `CHANGELOG.md` đủ 4 phase, `CREDITS.md`, `LICENSE` | các file ở gốc repo | Đạt |
| 9 | Retro 1–2 trang | `docs/notes/retro.md` | Đạt |
| 10 | Nhật ký token/chi phí Phase 4 | `docs/notes/ai-log.md` | Đạt (≈ $31.5: `/cost` $14.08 + phiên trước ước $17.4) |
| 11 | Video < 5 phút, link ở đầu README | `scripts/record-demo.mjs` → tài sản Release `dao-den-long-demo.mp4` | Đạt |
| 12 | Tag `phase-4` + Release `v1.0.0` có zip chạy được | `npm run package`; `gh release view v1.0.0` | Đạt |
