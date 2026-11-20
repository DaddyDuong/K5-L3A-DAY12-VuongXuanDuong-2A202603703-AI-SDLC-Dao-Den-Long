# Đảo Đèn Lồng

> **Video demo:** _(sẽ cập nhật ở Phase 4)_

Game 3D góc nhìn thứ ba: Mây, người giữ đèn nhỏ tuổi, gom đom đóm để thắp Đèn Lồng Lớn, giữ đảo sáng tới bình minh và
xua Bóng Mực trong sương đen. TypeScript + Three.js (bản web) và một chế độ headless chạy bằng Node theo **Test Contract v1.2**.

> Trạng thái: **Phase 3** (Ticket-03 "Đèn cạn dầu", Test Contract v1.2): đèn hao dầu và tắt được, châm dầu / thắp lại,
> Bóng Mực hút dầu đèn yếu, thắng lúc bình minh, sức chứa tăng dần, điểm mới, chế độ mù màu. Thay đổi phá vỡ tương
> thích: [`CHANGELOG.md`](CHANGELOG.md). Phase 2: 3 Đêm, Lướt, rơi khỏi đảo, Gió Lạc, Bùa Gió, gió mạnh, tạm dừng.

## Luật chơi tóm tắt

- Đi gần đom đóm để **tự nhặt** (trong 1 m, cùng tầng). Sức chứa 10, +2 mỗi lần thắp đèn thành công (tối đa 20).
- Đứng trong 2 m của đèn và bấm **E**: đèn chưa sáng nhận đom đóm tới 10 con (5 con nếu đèn đã từng sáng) thì sáng với
  **100 dầu**; đèn đang sáng thì **châm dầu** (+10 dầu mỗi con, tối đa 100).
- Đèn sáng **hao 1 dầu/giây**; hết dầu thì tắt. Dầu dưới 30: đèn nhấp nháy, **mất vùng an toàn** và Bóng Mực tới **hút
  dầu** (5/giây mỗi con).
- **Bóng Mực** xuất hiện từ giây thứ 5, lang thang rồi đuổi khi bạn ở trong 12 m (4 m/s; Đêm 3 là 4.5 m/s). Bị chạm: mất 1 Ngọn Lửa, rơi một nửa số đom đóm đang mang (nhặt lại được trong 8 s), bất tử 1.5 s. Chúng **không vào được vùng 6 m quanh đèn sáng còn ≥ 30 dầu**.
- **F** Tỏa Sáng (tốn 3 đom đóm, hồi 3 s): choáng 2 s và đẩy lùi 4 m mọi Bóng Mực trong 5 m.
- **Shift** Lướt: 14 m/s trong 0.2 s, hồi 1.5 s. Rơi khỏi đảo: mất 1 lửa và toàn bộ đom đóm, hồi sinh ở điểm xuất phát.
- **Gió Lạc** (Đêm 2–3): dải lụa xám xanh lao tới khi bạn mang ≥ 5 đom đóm và cướp 3 con. **Bùa Gió** (lá bùa đỏ): 10 s chạy 7.2 m/s, Lướt không hồi chiêu. **Gió mạnh** (Đêm 3): mỗi 30 s một cơn 5 s đẩy bạn 2 m/s, báo trước bằng lá bay.
- **Thắng** khi còn sống lúc **bình minh** và số đèn đang sáng ≥ 60% (Đêm 1 cần 3/5, Đêm 2 cần 4/6, Đêm 3 cần 5/7).
  Thắp đủ đèn sớm không kết thúc Đêm. Hết 3 lửa, hoặc bình minh mà thiếu đèn → **thua**, được chơi lại Đêm đó.

| Đêm | Đảo | Đèn | Thời gian | Điểm đặc biệt |
|---|---|---|---|---|
| 1 | Đảo Bến | 5 | 4:00 | Đảo tròn 40 m |
| 2 | Đảo Cau | 6 | 4:30 | Hai đảo, cầu tre không lan can, bục nhảy bắn sang đảo kia, Gió Lạc, Bùa Gió |
| 3 | Đảo Chuông | 7 | 5:00 | 3 tầng, 2 dốc, bục nhảy lên tầng 2, tháp chuông, gió mạnh |

Chi tiết luật, giả định và tiêu chí nghiệm thu: [`phase-3-assumptions.md`](docs/notes/phase-3-assumptions.md) (luật bị
Ticket-03 thay + ADR-003), [`phase-2-assumptions.md`](docs/notes/phase-2-assumptions.md),
[`phase-1-assumptions.md`](docs/notes/phase-1-assumptions.md); ticket chép lại ở `docs/notes/ticket-0N.md`.

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
| E | Nạp đom đóm vào đèn / thắp lại / châm dầu |
| F | Tỏa Sáng |
| Esc / P | Tạm dừng: Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu |
| Enter | Nút chính trên các màn hình |

Cài đặt (âm lượng, độ nhạy chuột, **Bảng màu dễ phân biệt**) được lưu trong `localStorage`. Bảng màu dễ phân biệt:
viền và mắt Bóng Mực xanh `#00B3FF`, cảnh báo màu trắng kèm ⚠; đèn tắt luôn xẹp và có vết rách (nhận ra không cần màu). Âm thanh tổng hợp bằng WebAudio, không dùng file ngoài.

## Cách tính điểm

| Sự kiện | Điểm |
|---|---|
| Nạp 1 đom đóm vào đèn (thắp, thắp lại hoặc châm dầu) | +5 |
| Thắp đèn lần đầu / thắp lại | +100 / +40 |
| Mỗi Bóng Mực trúng Tỏa Sáng (kể cả con đang choáng) | +5 (+15 nếu nó đang hút dầu) |
| Thắng Đêm (bình minh) | mỗi đèn đang sáng: +50 + số dầu còn lại (làm tròn xuống); +50 × số lửa còn lại |

Không còn thưởng thời gian (Ticket-03).

Tổng điểm (màn Bình Minh) = tổng điểm các Đêm đã thắng. Các số khớp `tuning.score` trong [`game.contract.json`](game.contract.json).

## Chế độ headless (Test Contract v1.2)

```bash
npm run build
node dist-headless/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--inputs f.inputs.json] [--scenario f.scenario.json] [--snapshot-every 10]
```

- `--night` nhận 1, 2, 3. Mã thoát: `0` thành công, `1` sai tham số/lỗi đọc file, `2` file inputs/scenario sai định dạng.
- Snapshot có `night`, `wind`, `player.vel/grounded/invuln/dash_cd_s/pulse_cd_s/charm_s/capacity`, `lanterns[].fuel/ever_lit/relit_count`,
  mảng `motes`, `drifters`, `charms`. Sự kiện v1.2: `refuel`, `lantern_out`, `fuel_drain`, `lantern_lit.relight`, `game_over.reason` `dawn_survived`.
- Khai báo: [`game.contract.json`](game.contract.json) (`contract_version: "1.2"`, `tuning` = số chuẩn Ticket-02 + Ticket-03).
  Tốc độ Bóng Mực Đêm 3 (4.5 m/s) không có khóa trong `tuning` nên nằm ở `src/sim/maps.ts`.
- 21 600 tick chạy headless ≈ 0.8–1.9 s (yêu cầu ≤ 30 s; `docs/proof/phase-3/headless/timing.txt`).
- Bằng chứng headless dạng file: `scripts/proof-headless.sh` → `docs/proof/phase-3/headless/`.

## Kiểm thử

```bash
npm test           # build headless + vitest (unit + chạy CLI end-to-end + tính tất định)
```

CI chạy cùng bộ test mỗi lần push (`.github/workflows/ci.yml`).

### Bot tự chơi và phát lại

```bash
npm run autoplay -- --seed 1 --night 3      # bot chơi qua sim thật, ghi public/replays/n3-seed1-win.inputs.json
npm run build && npm start                  # rồi mở một trong các URL:
# http://localhost:4173/?seed=1&night=3&replay=replays/n3-seed1-win.inputs.json&speed=2                 (một Đêm)
# http://localhost:4173/?seed=7,11,1&replay=replays/n{night}-seed{seed}-win.inputs.json&speed=4         (cả 3 Đêm → Bình Minh)
# thêm &fps=1 để hiện đồng hồ FPS; trong console: __bench(180) đo ms/khung ở 1280×720
```

File inputs đúng định dạng Test Contract, nên cũng chạy được bằng lệnh headless ở trên và ra cùng điểm. Với luật
Ticket-03 bot chỉ thắng được một số seed ở Đêm 2–3 (Đêm 2: 11, 14; Đêm 3: 1), xem `phase-3-assumptions.md` §6.

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
