// Ticket-02 "Bảng màu chuẩn" (each RGB channel within 10%). Other detail colours are free.
export const PALETTE = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  cloudSea: 0x12384a,
  lanternLit: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternOff: 0x5b5f6e,
  moteCore: 0xfff6c2,
  // The first hex digit of the halo was hidden when the board was copied ("#?E58A"); FFE58A is the
  // warm yellow that fits the core (docs/notes/phase-2-assumptions.md A29).
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeStunned: 0x3a3450,
  mayTunic: 0xe8e2d0,
  red: 0xc8102e, // Mây's scarf and the Bùa Gió charm
  gold: 0xf2c14e, // charm border, score
  drifter: 0x8fa3b8,
  danger: 0xff5a5f,
  text: 0xf5f1e6,
} as const;

/** Ticket-03 §6 "Bảng màu dễ phân biệt": shade rim + eyes and the UI warning colour change. */
export const CB_PALETTE = {
  shadeRim: 0x00b3ff,
  danger: 0xffffff,
} as const;

export const css = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;

/** Ticket-02: ambient intensity = 0.15 + 0.55 × (lit / total). */
export const ambientFor = (lit: number, total: number) => 0.15 + 0.55 * (total > 0 ? lit / total : 0);
