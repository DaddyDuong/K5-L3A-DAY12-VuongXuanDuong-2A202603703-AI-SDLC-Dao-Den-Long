// Player settings (volume, mouse sensitivity) kept between sessions in localStorage.
// Storage can be unavailable (private mode, blocked site data): fall back to defaults silently.
export interface Settings {
  volume: number; // 0..1
  mouseSensitivity: number; // degrees of camera yaw per pixel
}

const KEY = "dao-den-long.settings.v1";
export const DEFAULT_SETTINGS: Settings = { volume: 0.6, mouseSensitivity: 0.25 };
export const SENSITIVITY_RANGE = { min: 0.05, max: 1 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const j = JSON.parse(raw) as Partial<Settings>;
    return {
      volume: clamp(Number(j.volume ?? DEFAULT_SETTINGS.volume) || 0, 0, 1),
      mouseSensitivity: clamp(
        Number(j.mouseSensitivity ?? DEFAULT_SETTINGS.mouseSensitivity) || DEFAULT_SETTINGS.mouseSensitivity,
        SENSITIVITY_RANGE.min,
        SENSITIVITY_RANGE.max,
      ),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not persisted this time; the game keeps working with the in-memory values.
  }
}
