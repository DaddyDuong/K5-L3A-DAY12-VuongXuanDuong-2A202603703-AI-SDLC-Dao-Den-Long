// Player settings kept between sessions in localStorage: volume, mouse sensitivity, colour-blind palette (Ticket-03),
// and Ticket-04 §4 accessibility: key bindings, captions, reduced motion, large text.
// Storage can be unavailable (private mode, blocked site data): fall back to defaults silently.
import { DEFAULT_KEYS, loadKeyMap, type KeyMap } from "./keys.js";

export interface Settings {
  volume: number; // 0..1
  mouseSensitivity: number; // degrees of camera yaw per pixel
  colorblind: boolean; // Ticket-03 §6 "Bảng màu dễ phân biệt"
  keys: KeyMap; // Ticket-04 §4 "Đổi phím"
  captions: boolean; // "Phụ đề / chỉ báo hình ảnh"
  reduceMotion: boolean; // "Giảm chuyển động"
  largeText: boolean; // "tùy chọn chữ lớn (×1.25)"
}

const KEY = "dao-den-long.settings.v1";
export const DEFAULT_SETTINGS: Settings = {
  volume: 0.6,
  mouseSensitivity: 0.25,
  colorblind: false,
  keys: { ...DEFAULT_KEYS },
  captions: true,
  reduceMotion: false,
  largeText: false,
};
export const SENSITIVITY_RANGE = { min: 0.05, max: 1 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
    const j = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: clamp(Number(j.volume ?? DEFAULT_SETTINGS.volume) || 0, 0, 1),
      mouseSensitivity: clamp(
        Number(j.mouseSensitivity ?? DEFAULT_SETTINGS.mouseSensitivity) || DEFAULT_SETTINGS.mouseSensitivity,
        SENSITIVITY_RANGE.min,
        SENSITIVITY_RANGE.max,
      ),
      colorblind: j.colorblind === true,
      keys: loadKeyMap(j.keys),
      captions: j.captions !== false,
      reduceMotion: j.reduceMotion === true,
      largeText: j.largeText === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not persisted this time; the game keeps working with the in-memory values.
  }
}
