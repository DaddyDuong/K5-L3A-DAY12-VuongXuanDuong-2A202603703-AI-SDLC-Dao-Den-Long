# Retro — Đảo Đèn Lồng v1.0.0 (4 phase)

Làm cùng Claude Code (Opus 5.5) theo vòng: chép ticket → giả định có trích dẫn → tiêu chí nghiệm thu (AC) → test
headless đỏ → code → xanh → bằng chứng. Chi tiết từng lần AI sai: [`ai-log.md`](ai-log.md).

## Tổng hợp Evaluation 4 phase

| Phase | Ticket | Kết quả | Test | Chi phí AI |
|---|---|---|---|---:|
| 1 | PRD-0, Contract v1.0 | Đêm 1 chơi được, headless tất định, AC1–AC21 đạt | 61 | $7.40 |
| 2 | Ticket-02 "Ba hòn đảo", v1.1 | 3 Đêm, số chuẩn, thứ tự 12 bước, lướt/rơi/gió; 23 test Phase 1 sửa kèm lý do | > 110 | $22.45 |
| 3 | Ticket-03 "Đèn cạn dầu", v1.2 | Dầu, drain, thắp lại, thắng bình minh; bot thắng 48/48 · 48/48 · 45/48 seed | 154 | $17.09 |
| 4 | Ticket-04 "Bình minh", v1.3 | Bench 166 FPS (đạt), soak 0 crash nhưng RSS ×1.37 (chưa đạt ≤ 1.2), bảng xếp hạng, trợ năng, Release | 175 | ≈ $23 |

Tổng ≈ $70. Đầu ra headless của Phase 3 giữ nguyên từng byte qua Phase 4.

## Điều hiệu quả khi làm với AI

- **Test headless là trọng tài.** Mọi luật mới có một test chạy CLI thật và đọc JSONL. Khi AI tự tính sai kỳ vọng
  (Phase 2: quên bóng di chuyển trước va chạm; lướt thay vận tốc chứ không cộng), test đỏ bắt được ngay, và quyết định
  "sửa test hay sửa sim" luôn quay về câu chữ của ticket.
- **Ghi giả định kèm trích dẫn trước khi code.** Ticket mơ hồ (seed `7 + i` đếm từ 0 hay 1, "lưu trên đĩa" với game
  web, "ngược chiều kim đồng hồ" theo trục nào) được chốt một lần ở `phase-N-assumptions.md`, có danh sách câu hỏi cho
  trợ giảng; AI không phải đoán lại ở các lượt sau.
- **Bot + replay thay vì chơi tay.** Bot chơi qua đúng `step()` của headless, inputs của nó phát lại trên web: một
  nguồn sự thật cho cả winnability, ảnh bằng chứng và điểm trên màn hình = dòng `end`.
- **Sim thuần (`src/sim`).** Không DOM/three/`Math.random` nên headless, web, bench, soak dùng chung một mã; cảnh bench
  Phase 4 chỉ là một cờ trong `step()` và đầu ra contract không đổi.

## Điều không hiệu quả

- **Chỉnh bot bằng cách thử tham số mù** (Phase 2–3) tốn nhiều lượt chạy nhất. Lần hiệu quả là khi đếm sự kiện trước
  rồi suy luận kinh tế đom đóm/dầu ("thắp lại 5 con = 100 dầu, rẻ hơn châm 10 lần").
- **Phiên dài.** Khoản lớn nhất mỗi phase là đọc lại ngữ cảnh (cache read 40–67M token). Bắt đầu phiên mới mỗi phase
  và để `CLAUDE.md` + `docs/notes/` mang ngữ cảnh giúp, nhưng một phase vẫn kéo dài vài giờ.
- **Trang web khó đọc** (lab board là iframe khác origin, slide là app JS): mất vài lượt mới tìm ra cách đọc bằng
  ảnh chụp / `get_page_text`. Chép ticket vào repo một lần rồi chỉ đọc file là cách đúng.

## Những lần AI sai và cách phát hiện

| Lần sai | Phát hiện bằng |
|---|---|
| Tạo hình Mây đúng chữ PRD nhưng nhìn sai (đèn khuất, cột đèn vô hình) | Người dùng gửi ảnh chụp |
| Ghi vào bảng bằng chứng một ảnh chưa hề chụp | AI rà lại bảng trước khi commit |
| README ghi "1 Đêm < 0.5 s" trên một lượt đã thua sớm | Đối chiếu `end.ticks` → thêm luật vào `CLAUDE.md` |
| Lối ra `drain` xét `chase` trước nên một vế không bao giờ xảy ra | Test AC55 đỏ |
| Tài liệu Phase 4 viết "RSS phẳng từ Đêm 3" | Chạy soak 33 Đêm, thấy thêm một bậc nhỏ → sửa câu cho đúng số |
| Script bằng chứng trỏ tới file replay đã xóa từ Phase 3 | Chạy lại script ở Phase 4 |

Điểm chung: lỗi lọt qua khi **không có máy kiểm** (ảnh, tài liệu, script ít chạy). Chỗ có test thì gần như không lọt.

## Harness giúp nhiều nhất

1. **Hook Stop** (`.claude/hooks/stop-require-green.sh`): agent không thể kết thúc khi `npm test` đỏ. Rẻ, không bao giờ
   quên.
2. **`CLAUDE.md` < 50 dòng, sửa sau mỗi lần sai lặp lại** (ví dụ "trace kỳ vọng qua 12 bước", "kiểm `end.ticks` trước
   khi nói về thời gian"). Mỗi luật là một bài học có thật, không phải lời khuyên chung chung.
3. **Skill `play-and-capture`**: một lệnh cho bot thắng 3 Đêm, đối chiếu CLI, chụp ảnh replay — dùng lại ở mọi phase.
4. CI GitHub Actions chạy cùng bộ test, và `game.contract.json` có test bắt `tuning` khớp code.

## Tiết kiệm token

Chép ticket/slide vào repo một lần; gom thao tác trình duyệt vào một lần gọi; ảnh ở tỉ lệ 0.6–0.7; script in tóm tắt
(thắng/thua, cỡ chữ nhỏ nhất) thay vì log từng tick; gỡ lỗi bot bằng cách dựng lại thế giới tại tick bị kẹt; không
thêm dependency (Phase 4 không có Electron/Playwright).

## Nếu làm lại

- Viết **bot và tiêu chí "thắng được"** ngay từ Phase 1 dưới dạng quét nhiều seed, chạy trong CI, thay vì 3 seed.
- Đo soak/bench từ sớm (Phase 2 đã có `__bench`), để thấy vấn đề như RSS của V8 trước khi tới ngưỡng của ticket, và
  hỏi trợ giảng định nghĩa phép đo sớm.
- Tách phiên ngắn hơn theo từng lát (luật → web → tài liệu) để giảm chi phí đọc lại ngữ cảnh.
- Thêm một test "script bằng chứng chạy được" để các script ít dùng không hỏng âm thầm.
