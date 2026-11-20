# Credits

## Mã nguồn

- Tác giả: DaddyDuong (lab Day 12 — AI SDLC).
- Viết cùng **Claude Code** (Anthropic; Claude Opus 5.5) theo quy trình ticket → giả định → test → code; mọi
  prompt, quyết định và chi phí ghi trong [`docs/notes/ai-log.md`](docs/notes/ai-log.md).

## Thư viện (đều MIT hoặc Apache-2.0, chỉ dùng lúc build/test trừ three.js)

| Thư viện | Dùng cho | Giấy phép |
|---|---|---|
| [three.js](https://threejs.org) | Dựng hình 3D (đi kèm bản web) | MIT |
| [Vite](https://vite.dev) | Dev server, đóng gói web | MIT |
| [Vitest](https://vitest.dev) | Test | MIT |
| [TypeScript](https://www.typescriptlang.org) | Ngôn ngữ, kiểm kiểu | Apache-2.0 |
| [@types/node, @types/three](https://github.com/DefinitelyTyped/DefinitelyTyped) | Kiểu TypeScript | MIT |

Phần chạy bằng Node (headless, soak, bench, server bảng xếp hạng, đóng gói zip) chỉ dùng thư viện chuẩn của Node.
Benchmark dùng Chrome/Chromium **đã cài sẵn** trên máy người chạy, không đi kèm.

## Asset

- **Đồ họa**: mọi hình khối (Mây, nón lá, đèn lồng, Bóng Mực, đảo, cầu tre, tháp chuông, đom đóm) dựng bằng code
  three.js; không dùng model, texture hay font ngoài (font là font hệ thống `system-ui`).
- **Âm thanh**: tổng hợp trực tiếp bằng WebAudio (`src/web/audio.ts`), không có file âm thanh.
- **Bảng màu**: theo Ticket-02 (`src/web/palette.ts`); bảng màu dễ phân biệt theo Ticket-03.

## Thiết kế

- Nhân vật, bối cảnh, tên gọi (Mây, Bóng Mực, Đảo Bến / Đảo Cau / Đảo Chuông …) và luật chơi: đề bài lab Day 12
  AI SDLC (PRD-0, Ticket-02 → Ticket-04) của ban tổ chức khóa học.
