# Đảo Đèn Lồng

> **Video demo:** _(sẽ cập nhật ở Phase 4)_

Game 3D góc nhìn thứ ba: Mây, người giữ đèn nhỏ tuổi, gom đom đóm để thắp lại 5 Đèn Lồng Lớn và xua Bóng Mực trong sương đen.
TypeScript + Three.js (bản web) và một chế độ headless chạy bằng Node theo **Test Contract v1.0**.

> Trạng thái: **khung dự án** (di chuyển, nhảy, camera, đếm giờ, headless đúng contract). Luật Phase 1 (nhặt, nạp đèn, Bóng Mực, tỏa sáng) đang làm.

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

Theo `score` trong [`game.contract.json`](game.contract.json): mỗi đom đóm nhặt `per_mote`, mỗi đèn thắp `per_lantern`, mỗi Bóng Mực bị choáng `per_stun`; khi thắng cộng thêm `per_second_left` × số giây còn lại và `per_flame_left` × số lửa còn lại. _(Sẽ chốt trong ghi chép giả định Phase 1.)_

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

## Tài liệu

- Giả định, nhật ký AI, retro: [`docs/notes/`](docs/notes/)
- Bằng chứng từng phase: [`docs/proof/`](docs/proof/)
- Harness AI: [`CLAUDE.md`](CLAUDE.md), [`.claude/settings.json`](.claude/settings.json) (hook Stop chặn kết thúc khi test đỏ)
- Đề bài lab: [`docs/lab/`](docs/lab/)

## Sáng tạo của tôi

_(Chưa có. Sẽ thêm sau khi phần lõi đạt.)_
