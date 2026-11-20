# Nhật ký dùng AI

Công cụ: Claude Code (Opus 5.5). Harness: `CLAUDE.md`, hook Stop `.claude/hooks/stop-require-green.sh`.

| Phase | Việc | Prompt chính / cách điều phối | AI sai ở đâu, cách phát hiện | Token / chi phí ước tính |
|---|---|---|---|---|
| 1 | Onboard: đọc tài liệu lab + lab board | "onboard tôi bài lab này" | — | gộp, xem bảng token |
| 1 | Khung dự án: sim + headless CLI + test + web + harness | "hoàn thiện nó cho tôi" (bước 1 của kế hoạch) | — | gộp, xem bảng token |
| 1 | Chốt giả định + 21 tiêu chí nghiệm thu (không code) | "hoàn thiện cho tôi" (chấp nhận toàn bộ đề xuất bước 2) | — | gộp, xem bảng token |
| 1 | Bước 3: code luật theo 6 lát, mỗi lát test AC trước (thấy đỏ) → code → xanh → commit | "hoàn thiện cho tôi" | Test AC20 ban đầu kỳ vọng có `player_hit` khi đi lang thang, nhưng người chơi (6 m/s) nhanh hơn Bóng Mực (3.5 m/s) nên không bao giờ bị chạm. Phát hiện nhờ test đỏ + in số event/vị trí từ JSONL. Sửa **kịch bản test** (đứng yên 20 s cuối), không sửa luật | gộp, xem bảng token |
| 1 | Sửa tạo hình Mây và cột đèn (chỉ `src/web`) | Người dùng hỏi "tạo hình nhân vật như này liệu có phù hợp?" kèm ảnh chụp | Bản đầu AI dựng đúng "chữ" của PRD (nón + quả cầu) nhưng không kiểm tra **nhìn thực tế**: đèn treo nằm phía trước nên camera sau lưng không thấy, nón tối, cột đèn chưa thắp gần như vô hình. Người dùng phát hiện qua ảnh; AI sửa rồi kiểm tra lại bằng ảnh chụp/zoom từ Chrome | gộp, xem bảng token |
| 1 | Bot tự chơi + chế độ replay web + skill `play-and-capture` | "bạn không tự động làm được à" (sau khi AI đề nghị người dùng tự chơi để lấy ảnh) | Công cụ trình duyệt không giữ phím được, nên thay vì điều khiển bàn phím, AI cho bot chơi qua sim thật rồi phát lại inputs trên web. AI tự bắt được lỗi TDZ (`endReason` dùng trước khi khai báo) khi đọc lại diff, trước khi chạy | gộp, xem bảng token |
| 2 | Đọc Ticket-02 trên lab board | "phase 2 đã mở. tiếp tục onboard tôi làm gì", rồi "thử lại đi" | Lần đầu AI chỉ đọc được Phase 1 (trang board là iframe khác origin: `Artifact read`, `get_page_text`, `read_page` đều trả rỗng) và định dừng lại. Người dùng yêu cầu thử lại → AI đọc bằng ảnh chụp cuộn trang trong Chrome và chép vào `ticket-02.md`; 1 ký tự màu bị che, ghi lại là `#?E58A` thay vì đoán (A29) | gộp, xem bảng token |
| 2 | Giả định A1–A33, luật R14–R28, AC22–AC46 trước khi code | "không cần lo về vấn đề thời gian đâu" (làm đủ phạm vi) | — | gộp |
| 2 | Viết lại sim theo thứ tự 12 bước, 3 bản đồ heightfield, contract v1.1 | (tiếp kế hoạch) | 23 test Phase 1 đỏ sau khi đổi số chuẩn, đúng như dự kiến; sửa từng kỳ vọng kèm lý do ở assumptions §1. AC20 cũ (đi hình sin) rơi khỏi đảo vì luật rơi mới → đổi đường đi, không đổi luật | gộp |
| 2 | Test headless AC23–AC43 (`phase2.test.ts`) | (tiếp kế hoạch) | 2 kỳ vọng AI tự tính sai trong test mới: quên rằng bước 8 (bóng di chuyển) chạy trước bước 9 (va chạm) nên vị trí recoil lệch 0.067 m; kịch bản TTL để bóng đánh lại nhiều lần. Phát hiện bằng test đỏ + đọc JSONL; sửa kịch bản/kỳ vọng theo đúng thứ tự tick, không sửa sim | gộp |
| 2 | Bot thắng 3 Đêm | (tiếp kế hoạch) | Bot thua Đêm 3. Nguyên nhân tìm bằng cách dựng lại thế giới tại tick bị kẹt: (1) hàm `danger` tính cả Bóng Mực ở tầng dưới → bot đi vòng qua bục nhảy thay vì 8 m tới đèn; (2) ô lưới cạnh dốc có tâm trên dốc nên bot tưởng đang ở độ cao 2.75 m và đi vào vách 85 s; (3) bot tỏa sáng vào Gió Lạc (tốn 3 = đúng số bị cướp) làm thiếu đom đóm. Một thử nghiệm của AI (tỏa sáng khi bị vây) làm tệ hơn (Đêm 2 3/12) và đã bỏ. Kết quả: 12/12, 10/12, 9/12 seed | gộp |
| 2 | Bản web: chuỗi màn hình, tạm dừng, cài đặt, âm thanh, HUD, bảng màu | (tiếp kế hoạch) | Qua ảnh chụp: lá gió hiện thành ô vuông, áo Mây xám thay vì `#E8E2D0` → sửa. Đồng hồ báo 1–5 FPS: AI kiểm tra rAF trên trang JSON tĩnh cũng chỉ 4/s → Chrome bóp cửa sổ bị che, không phải game chậm; thêm `__bench` đo 4.2 ms/khung. AI ghi trong bảng bằng chứng một ảnh "nhắc nạp" chưa hề chụp; tự phát hiện khi rà lại, chụp bổ sung trước khi commit | gộp |
| 2 | Đối chiếu repo với slide giảng viên | "phase 2 làm gì, và làm thế nào để tôi biết là đã xong. ngoài ra tôi muốn bổ sung thêm hướng dẫn của trợ giảng từ slide sau …" | Trang slide là app JS: công cụ đọc web chỉ thấy tiêu đề → AI tải bundle JS và trích mảng slide (không chạy JS). Thêm 2 test cho lỗi Coach nêu tên (không bất tử khi lướt; lướt khi bay từ bục). AI tính sai kỳ vọng lần 2 (cho rằng lướt cộng vào vận tốc phóng, thực ra thay thế) → lần thứ hai cùng một lỗi nên thêm luật vào `CLAUDE.md`. Phát hiện README ghi "1 Đêm < 0.5 s" là số đo trên lượt đã thua sớm; đo lại đủ 21 600 tick ≈ 1 s, sửa README và thêm luật "kiểm `end.ticks`" | gộp |
| 3 | Đọc Ticket-03 trên lab board, chép vào `ticket-03.md` | "onboard tôi làm gì tiếp theo", rồi "thực hiện cho tôi" | Board đã mở Phase 4 ("đang diễn ra"), tức Phase 3 đã quá giờ: AI báo lại nhưng vẫn làm Phase 3 trước. Đọc board bằng ảnh chụp, gom nhiều lần cuộn vào một lần gọi | gộp |
| 3 | Sim Ticket-03 (dầu, drain, thắp lại, thắng bình minh, sức chứa) + contract v1.2 | (tiếp kế hoạch) | 14 test cũ đỏ, đúng những chỗ ticket thay; sửa từng kỳ vọng kèm lý do (`phase-3-assumptions.md` §1). Test AC43 (21 600 tick) thua sớm ở tick 4872 vì đèn nay cạn dầu: giữ mục đích test, cho `flames: 1000`. Lối ra `drain`: bản đầu xét `chase` trước, khiến vế "châm ≥ 30 → wander" không bao giờ xảy ra → đổi thứ tự (P3-A8) | gộp |
| 3 | Test AC48–AC57 (`phase3.test.ts`) | (tiếp kế hoạch) | 1 kỳ vọng AI tự đặt sai: sau khi thắp L1, lần bấm E thứ hai châm dầu L1 (đã hao 1/60 dầu) thay vì thắp lại L2. Sim đúng theo ticket → sửa kịch bản test (đi tới L2 trước) | gộp |
| 3 | Viết lại chiến thuật bot | (tiếp kế hoạch) | Bot cũ sống tới bình minh nhưng thiếu đèn. Thử 4 hướng (châm dầu khi đáng, Tỏa Sáng khi bị vây, quét thông số) trước khi suy luận kinh tế đom đóm: thắp lại 5 con = 100 dầu, rẻ hơn châm dầu 10 lần → "thắp sớm, để cạn, gửi đom đóm vào đèn tắt, thắp lại 69 s cuối". Đêm 1 thắng 18/24 seed, Đêm 2 2/24, Đêm 3 1/24 (bot yếu) | gộp |
| 3 | Làm bot thắng ổn định (sau khi báo "đã xong" còn bot yếu) | "không cần quá lo lắng về vấn đề thời gian. cứ hoàn thiện đúng và đủ là được" | Lần trước AI chỉnh tham số mù. Lần này đếm sự kiện mỗi ván trước: bot gần như không mất lửa, nhưng ~1/3 đom đóm đốt vào Tỏa Sáng theo đàn và mỗi đèn tốn 15 con. Đổi sang "gửi trước, thắp phút cuối" (10 con/đèn). Sau đó theo dõi từng ván thua theo giây tìm ra 3 lỗi điều hướng: chạy vòng quanh một bóng đuổi, thắp nhầm đèn sớm vì mang nhiều hơn chỗ trống, đứng kẹt trong vòng cấm quanh bục nhảy. Kiểm tra trên seed chưa dùng để chỉnh trước khi chốt. Kết quả 48/48 · 48/48 · 45/48 | gộp |
| 3 | Web: thanh dầu, nhấp nháy, đèn xẹp + rách, HUD sức chứa, mù màu | (tiếp kế hoạch) | Server preview cũ còn chiếm cổng 4173 (có thể phục vụ bản build cũ) → chụp ở cổng 4174. Bắt khoảnh khắc bằng cách poll DOM rồi phát phím P; lần poll ở tốc độ ×20 lỡ khoảnh khắc thắp lại, nên chụp đèn tắt ở đầu Đêm thay vào đó | gộp |

## Token và chi phí — Phase 1

Nguồn: `/cost` của Claude Code ở cuối Phase 1 (một phiên duy nhất cho cả phase; `/cost` không tách theo từng việc nên các dòng trên được gộp).

| Model | Input | Output | Cache read | Cache write | Chi phí |
|---|---:|---:|---:|---:|---:|
| claude-opus-5-5 (agent chính) | 4.3k | 124.9k | 13.1M | 282.9k | $7.40 |
| claude-haiku-5-5 (việc phụ) | 7.9k | 4.1k | 0 | 0 | ~$0.003 |
| **Tổng** | | | | | **≈ $7.40** |

- Thời gian API 20 phút 44 giây / thời gian thực 50 phút 57 giây; 81 request, 98% input lấy từ prompt cache.
- Chi phí chủ yếu đến từ **output** (code + tài liệu) và việc **đọc lại ngữ cảnh** (13.1M token cache read): ngữ cảnh dài dần qua cả phase.
- Ghi chú: "65 dòng thay đổi" trong `/cost` thấp hơn thực tế vì phần lớn file được ghi qua shell (heredoc/script), không qua công cụ Edit.

Cách đã tiết kiệm:
- Đọc lab board **một lần**, lưu text vào scratchpad, sau đó tra cứu lại thay vì đọc lại trang.
- Chốt giả định + 21 AC **trước** khi code → mỗi lát code chỉ một lượt, không phải sửa đi sửa lại luật.
- Test chạy CLI thật nên lỗi lộ ra ngay, ít vòng "agent bảo chạy rồi"; chụp màn hình ở tỉ lệ 0.5–0.6 để giảm token ảnh.
- Không dùng subagent; một phiên duy nhất giữ cache ấm (98% cache hit).

Cần cải thiện ở Phase 2:
- Ngữ cảnh đã dài (cache read lớn): cân nhắc `/compact` hoặc phiên mới khi bắt đầu Phase 2, dựa vào `CLAUDE.md` + `docs/notes/` để khôi phục ngữ cảnh.
- Gộp nhiều thay đổi nhỏ vào ít lượt gọi công cụ hơn; tránh giải thích dài trong chat.

## Đánh giá nhanh Phase 1

- Đạt: mọi AC1–AC20 có test headless; tất định byte-identical; bản web chạy, thua và chơi lại được.
- AC21 đạt bằng bot + replay: thắng 3/3 seed trong test, ảnh phát lại seed 7 khớp điểm headless (1517).
- Quan sát: nhiều Bóng Mực đuổi cùng một mục tiêu nên **dồn vào một điểm**; không sai yêu cầu nhưng trên màn hình trông như một con. Có thể thêm lực tách nhau (phải giữ tất định và cập nhật test).
- Quan sát: đứng yên ~14 s là thua, nhưng bot tham lam thắng cả 5 seed thử (1, 2, 3, 7, 42) trong 38–52 s mà **không mất lửa nào**, với 3 lần tỏa sáng. Game đang dễ với người chơi chủ động; có thể cần chỉnh nếu ticket sau yêu cầu độ khó.
- Quan sát: không có va chạm giữa người chơi và cột đèn (Mây có thể đứng "trong" cột). Không thuộc yêu cầu, ghi lại để cân nhắc.
- Harness: hook Stop chạy `npm test` mỗi lần agent kết thúc, chưa phải chặn lần nào trong phase này.

## Token và chi phí — Phase 2

Nguồn: `/cost` của Claude Code ở cuối Phase 2 (một phiên cho cả phase, có 1 lần tự nén ngữ cảnh giữa chừng; `/cost` không tách theo từng việc nên các dòng ở bảng trên được gộp).

| Model | Input | Output | Cache read | Cache write | Chi phí |
|---|---:|---:|---:|---:|---:|
| claude-opus-5-5 (agent chính) | 6.7k | 346.2k | 45.6M | 795.8k | $22.44 |
| claude-haiku-5-5 (việc phụ, gồm subagent đọc web) | 8.0k | 2.3k | 10.2k | 6.2k | ~$0.003 |
| **Tổng** | | | | | **≈ $22.45** |

- Thời gian API 55 phút 17 giây / thời gian thực 2 giờ 27 phút 40 giây; 216 request, 98% input lấy từ prompt cache (1 lần miss, 45.1k token cache lại).
- `/cost` báo 3789 dòng thêm / 668 dòng xóa (vẫn thấp hơn thực tế vì một phần file ghi qua shell).
- So với Phase 1 ($7.40): **gấp ~3 lần**. Phạm vi lớn hơn nhiều (sim viết lại, 3 bản đồ, bot Đêm 3, web viết lại, 16 ảnh), nhưng phần lớn chi phí vẫn là **đọc lại ngữ cảnh** (45.6M cache read ≈ 3.5× Phase 1) và **output** (346k ≈ 2.8×).
- Lũy kế Phase 1 + 2: **≈ $29.85**.

Cách đã tiết kiệm ở Phase 2:
- Chép ticket một lần vào `docs/notes/ticket-02.md`; về sau tra file thay vì mở lại board (ảnh tốn token).
- Đánh giá bot bằng một script chạy 12 seed × 3 đêm trong Node (không in log từng tick), chỉ in tóm tắt thắng/thua.
- Gỡ lỗi bot bằng cách dựng lại thế giới tại đúng tick bị kẹt (export tạm, xóa sau) thay vì đọc cả JSONL.
- Ảnh chụp ở tỉ lệ 0.6; gom nhiều thao tác trình duyệt vào một lần gọi.

Chưa tốt:
- Thử nghiệm "tỏa sáng khi bị vây" tốn ~4 phút chạy đánh giá mà không giúp được; nên suy luận kinh tế đom đóm (cung ≈ 110, cần 70) trước khi thử.
- Ngữ cảnh kéo dài suốt 2.5 giờ trong một phiên: cache read 45.6M là khoản lớn nhất. Phase 3 nên bắt đầu phiên mới
  (khôi phục ngữ cảnh từ `CLAUDE.md`, `docs/notes/instructor-guide.md`, `phase-2-assumptions.md`).
- Đo/ghi số liệu hiệu năng một lần cho đúng (đã phải sửa lại số "< 0.5 s"); 2 lần tính sai kỳ vọng test tốn thêm vòng sửa.
- Ảnh chụp màn hình qua Chrome bị bóp khung hình: nhiều lần chụp lại để bắt đúng khoảnh khắc. Nên dùng hook DOM (poll + pause) ngay từ đầu.

## Token và chi phí — Phase 3

Nguồn: `/cost` của Claude Code ở cuối Phase 3 (phiên mới cho Phase 3 như đã định; có một lần chạm giới hạn sử dụng và
một lần tự nén ngữ cảnh; `/cost` không tách theo từng việc nên các dòng ở bảng trên được gộp).

| Model | Input | Output | Cache read | Cache write | Chi phí |
|---|---:|---:|---:|---:|---:|
| claude-opus-5-5 (agent chính, không dùng subagent) | 6.3k | 230.4k | 38.6M | 592.1k | $17.09 |
| claude-haiku-5-5 (việc phụ) | 1.2k | 22 | 0 | 0 | ~$0.0001 |
| **Tổng** | | | | | **≈ $17.09** |

- Thời gian API 37 phút 19 giây / thời gian thực 2 giờ 35 phút 56 giây; 176 request, 98% input lấy từ prompt cache
  (1 lần miss phía server, 34.9k token cache lại; 1 lần dựng lại do nén ngữ cảnh). `/cost` báo 548 dòng thêm / 18 dòng
  xóa (thấp hơn thực tế vì phần lớn file ghi qua shell).
- Trước khi có `/cost`, AI ước ≈ $16 bằng cách cộng `usage` trong transcript rồi lấy tỉ lệ với Phase 2: lệch ~6%.
- So với Phase 2 ($22.45): **~0.76 lần**. Lũy kế Phase 1 + 2 + 3: **≈ $46.94**.

Nhận xét (không phụ thuộc số liệu):
- Khoản tốn nhất là **thử nghiệm bot**: mỗi lượt đánh giá 15 ván ~1–2 phút, một lần quét 18 tổ hợp thông số phải dừng giữa chừng.
  Bài học giống Phase 2: suy luận kinh tế tài nguyên (đom đóm, dầu) trước, rồi mới chạy thử.
- Phần luật + test xong trong một lượt nhờ quy tắc "trace qua 12 bước trước khi đặt kỳ vọng" trong `CLAUDE.md`;
  chỉ 1 kỳ vọng test sai và được phát hiện ngay.
- Bằng chứng ảnh: poll DOM + phát phím P (đã ghi vào skill từ Phase 2) giúp chụp đúng khoảnh khắc với ít ảnh.
