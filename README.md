# Đảo Đèn Lồng

> **Video demo:** _(sẽ cập nhật ở Phase 4)_

Game 3D góc nhìn thứ ba: Mây, người giữ đèn nhỏ tuổi, gom đom đóm để thắp lại 5 Đèn Lồng Lớn và xua Bóng Mực trong sương đen.
TypeScript + Three.js (bản web) và một chế độ headless chạy bằng Node theo **Test Contract v1.0**.

> Trạng thái: **Phase 1 đủ luật**: nhặt đom đóm, nạp và thắp 5 đèn, Bóng Mực đuổi/sợ đèn, tỏa sáng, thắng/thua, điểm, chơi lại.

## Luật chơi tóm tắt

- Đi gần đom đóm để **tự nhặt** (mang tối đa 5). Đứng cạnh đèn và bấm **E** để nạp; mỗi đèn cần 5 con.
- **Bóng Mực** đuổi theo (chậm hơn bạn). Bị chạm: mất 1 lửa, rơi một nửa số đom đóm đang mang, bất tử 1.5 s. Chúng **không vào được vùng 5 m quanh đèn đã thắp**.
- **F** (tốn 1 đom đóm): làm choáng và đẩy lùi Bóng Mực trong 6 m.
- Thắp đủ 5 đèn → **thắng**. Hết 3 lửa hoặc hết 300 s → **thua**.

Chi tiết luật và giả định: [`docs/notes/phase-1-assumptions.md`](docs/notes/phase-1-assumptions.md).

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
| Chuột (click để khóa) / ← → | Xoay camera |
| Space | Nhảy |
| E | Nạp đom đóm vào đèn |
| F | Tỏa sáng xua Bóng Mực |
| R | Chơi lại |

## Cách tính điểm

| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm | +10 |
| Thắp 1 đèn | +100 |
| Làm choáng 1 Bóng Mực (chưa bị choáng) | +25 |
| Thắng | +2 × số giây còn lại (làm tròn xuống) + 50 × số lửa còn lại |

Không bao giờ trừ điểm. Các số khớp với `score` trong [`game.contract.json`](game.contract.json).

## Chế độ headless (Test Contract v1.0)

```bash
npm run build
node dist-headless/headless/cli.js --seed 1 --night 1 --ticks 600 --out out.jsonl \
  [--inputs tests/fixtures/walk-forward.inputs.json] [--scenario tests/fixtures/simple.scenario.json] [--snapshot-every 10]
```

- Mã thoát: `0` thành công, `1` sai tham số/lỗi đọc file, `2` file inputs/scenario sai định dạng.
- Khai báo: [`game.contract.json`](game.contract.json). `fall_enabled: false`: rìa đảo là tường vô hình, không rơi.

## Kiểm thử

```bash
npm test           # build headless + vitest (unit + chạy CLI end-to-end + tính tất định)
```

CI chạy cùng bộ test mỗi lần push (`.github/workflows/ci.yml`).

### Bot tự chơi và phát lại

```bash
npm run autoplay -- --seed 7 --out public/replays/seed7-win.inputs.json   # bot tìm chuỗi input thắng
npm run build && npm start                                                 # rồi mở:
# http://localhost:4173/?seed=7&replay=replays/seed7-win.inputs.json&speed=2
```

File inputs đúng định dạng Test Contract, nên cũng chạy được bằng lệnh headless ở trên.

## Tài liệu

- Giả định, nhật ký AI, retro: [`docs/notes/`](docs/notes/)
- Bằng chứng từng phase: [`docs/proof/`](docs/proof/)
- Harness AI: [`CLAUDE.md`](CLAUDE.md), [`.claude/settings.json`](.claude/settings.json) (hook Stop chặn kết thúc khi test đỏ), skill [`play-and-capture`](.claude/skills/play-and-capture/SKILL.md) (bot chơi + phát lại + chụp bằng chứng)
- Đề bài lab: [`docs/lab/`](docs/lab/)

## Sáng tạo của tôi

_(Chưa có. Sẽ thêm sau khi phần lõi đạt.)_
