# Đảo Đèn Lồng

> **Video demo:** _(sẽ cập nhật ở Phase 4)_

Game 3D góc nhìn thứ ba: Mây, người giữ đèn nhỏ tuổi, gom đom đóm để thắp lại 5 Đèn Lồng Lớn và xua Bóng Mực trong sương đen.
TypeScript + Three.js (bản web) và một chế độ headless chạy bằng Node theo **Test Contract v1.0**.

> Trạng thái: **Phase 2** (Ticket-02, Test Contract v1.1): 3 Đêm trên 3 hòn đảo, số liệu chuẩn, Lướt, rơi khỏi đảo,
> Gió Lạc, Bùa Gió, gió mạnh, tạm dừng, chuỗi màn hình Menu → Đêm 1–3 → Bình Minh, cài đặt, âm thanh, HUD đầy đủ.

## Luật chơi tóm tắt

- Đi gần đom đóm để **tự nhặt** (trong 1 m, cùng tầng; mang tối đa 10). Đứng trong 2 m của đèn và bấm **E** để nạp; mỗi đèn cần 10 con, nạp nhiều lần được.
- **Bóng Mực** xuất hiện từ giây thứ 5, lang thang rồi đuổi khi bạn ở trong 12 m (4 m/s; Đêm 3 là 4.5 m/s). Bị chạm: mất 1 Ngọn Lửa, rơi một nửa số đom đóm đang mang (nhặt lại được trong 8 s), bất tử 1.5 s. Chúng **không vào được vùng 6 m quanh đèn đã thắp**.
- **F** Tỏa Sáng (tốn 3 đom đóm, hồi 3 s): choáng 2 s và đẩy lùi 4 m mọi Bóng Mực trong 5 m.
- **Shift** Lướt: 14 m/s trong 0.2 s, hồi 1.5 s. Rơi khỏi đảo: mất 1 lửa và toàn bộ đom đóm, hồi sinh ở điểm xuất phát.
- **Gió Lạc** (Đêm 2–3): dải lụa xám xanh lao tới khi bạn mang ≥ 5 đom đóm và cướp 3 con. **Bùa Gió** (lá bùa đỏ): 10 s chạy 7.2 m/s, Lướt không hồi chiêu. **Gió mạnh** (Đêm 3): mỗi 30 s một cơn 5 s đẩy bạn 2 m/s, báo trước bằng lá bay.
- Thắp hết đèn → **thắng Đêm**. Hết 3 lửa hoặc trời sáng → **thua**, được chơi lại Đêm đó.

| Đêm | Đảo | Đèn | Thời gian | Điểm đặc biệt |
|---|---|---|---|---|
| 1 | Đảo Bến | 5 | 5:00 | Đảo tròn 40 m |
| 2 | Đảo Cau | 6 | 5:30 | Hai đảo, cầu tre không lan can, bục nhảy bắn sang đảo kia, Gió Lạc, Bùa Gió |
| 3 | Đảo Chuông | 7 | 6:00 | 3 tầng, 2 dốc, bục nhảy lên tầng 2, tháp chuông, gió mạnh |

Chi tiết luật, giả định và tiêu chí nghiệm thu: [`docs/notes/phase-2-assumptions.md`](docs/notes/phase-2-assumptions.md)
(ticket gốc chép lại ở [`docs/notes/ticket-02.md`](docs/notes/ticket-02.md); Phase 1: [`phase-1-assumptions.md`](docs/notes/phase-1-assumptions.md)).

## Cài đặt và chạy (3 lệnh)

Yêu cầu: Node.js ≥ 18, macOS hoặc Linux.

```bash
npm ci
npm run build
npm start          # mở http://localhost:4173
```

Khi phát triển: `npm run dev`.

## Điều khiển

| Phím | Hành động |
|---|---|
| W A S D | Di chuyển (theo hướng camera) |
| Chuột (click để khóa) / ← → | Xoay camera (độ nhạy chỉnh trong Cài đặt) |
| Space | Nhảy |
| Shift | Lướt |
| E | Nạp đom đóm vào đèn |
| F | Tỏa Sáng |
| Esc / P | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |
| Enter | Nút chính trên các màn hình |

Cài đặt (âm lượng, độ nhạy chuột) được lưu trong `localStorage`. Âm thanh tổng hợp bằng WebAudio, không dùng file ngoài.

## Cách tính điểm

| Sự kiện | Điểm |
|---|---|
| Nạp 1 đom đóm vào đèn | +10 |
| Thắp 1 đèn | +100 |
| Mỗi Bóng Mực trúng Tỏa Sáng (kể cả con đang choáng) | +5 |
| Thắng Đêm | +2 × số giây còn lại (làm tròn xuống) + 50 × số lửa còn lại |

Tổng điểm (màn Bình Minh) = tổng điểm các Đêm đã thắng. Các số khớp `tuning.score` trong [`game.contract.json`](game.contract.json).

## Chế độ headless (Test Contract v1.1)

```bash
npm run build
node dist-headless/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--inputs f.inputs.json] [--scenario f.scenario.json] [--snapshot-every 10]
```

- `--night` nhận 1, 2, 3. Mã thoát: `0` thành công, `1` sai tham số/lỗi đọc file, `2` file inputs/scenario sai định dạng.
- Snapshot v1.1 có `night`, `wind`, `player.vel/grounded/invuln/dash_cd_s/pulse_cd_s/charm_s`, mảng `motes`, `drifters`, `charms`.
- Khai báo: [`game.contract.json`](game.contract.json) (`contract_version: "1.1"`, `tuning` = số chuẩn của Ticket-02).
  Tốc độ Bóng Mực Đêm 3 (4.5 m/s) không có khóa trong `tuning` nên nằm ở `src/sim/maps.ts`.
- Một Đêm đầy đủ 21 600 tick chạy headless dưới 0.5 s (đo: Đêm 1 ≈ 0.18 s, Đêm 2 ≈ 0.36 s; yêu cầu ≤ 30 s).

## Kiểm thử

```bash
npm test           # build headless + vitest (unit + chạy CLI end-to-end + tính tất định)
```

CI chạy cùng bộ test mỗi lần push (`.github/workflows/ci.yml`).

### Bot tự chơi và phát lại

```bash
npm run autoplay -- --seed 7 --night 3      # bot chơi qua sim thật, ghi public/replays/n3-seed7-win.inputs.json
npm run build && npm start                  # rồi mở một trong các URL:
# http://localhost:4173/?seed=7&night=3&replay=replays/n3-seed7-win.inputs.json&speed=2   (một Đêm)
# http://localhost:4173/?seed=7&replay=replays/n{night}-seed7-win.inputs.json&speed=4      (cả 3 Đêm → Bình Minh)
# thêm &fps=1 để hiện đồng hồ FPS; trong console: __bench(180) đo ms/khung ở 1280×720
```

File inputs đúng định dạng Test Contract, nên cũng chạy được bằng lệnh headless ở trên và ra cùng điểm.

## Tài liệu

- Giả định, nhật ký AI, retro: [`docs/notes/`](docs/notes/)
- Bằng chứng từng phase: [`docs/proof/`](docs/proof/)
- Harness AI: [`CLAUDE.md`](CLAUDE.md), [`.claude/settings.json`](.claude/settings.json) (hook Stop chặn kết thúc khi test đỏ), skill [`play-and-capture`](.claude/skills/play-and-capture/SKILL.md) (bot chơi + phát lại + chụp bằng chứng)
- Đề bài lab: [`docs/lab/`](docs/lab/)

## Sáng tạo của tôi

Chưa có thực thể gameplay sáng tạo riêng (Phase 2 tập trung đúng ticket). Phần tự chọn nằm ở trình bày:
Mây đội nón lá, khăn đỏ, treo đèn lồng giấy đung đưa khi chạy; Bóng Mực có viền tím và mắt sáng;
Gió Lạc là dải lụa uốn sóng mang theo đom đóm đã cướp; màn Bình Minh chuyển nền sang màu rạng đông;
có thể phát lại cả chuỗi 3 Đêm từ file inputs của bot.
