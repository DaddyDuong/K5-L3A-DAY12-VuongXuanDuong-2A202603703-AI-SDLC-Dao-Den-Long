// Ticket-04 §4 key remapping (P4-A23). Pure logic (no DOM) so it is unit-tested in tests/phase4.test.ts.
export const ACTIONS = ["forward", "back", "left", "right", "jump", "dash", "interact", "pulse", "pause"] as const;
export type Action = (typeof ACTIONS)[number];
export type KeyMap = Record<Action, string>;

export const ACTION_LABELS: Record<Action, string> = {
  forward: "Đi tới",
  back: "Đi lùi",
  left: "Sang trái",
  right: "Sang phải",
  jump: "Nhảy",
  dash: "Lướt",
  interact: "Tương tác (nạp / châm dầu)",
  pulse: "Tỏa Sáng",
  pause: "Tạm dừng",
};

export const DEFAULT_KEYS: KeyMap = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  dash: "ShiftLeft",
  interact: "KeyE",
  pulse: "KeyF",
  pause: "KeyP",
};

/** Keys with a fixed meaning that cannot be bound: Esc (pause / back), ← → (camera). */
export const RESERVED: Record<string, string> = {
  Escape: "Tạm dừng / quay lại (cố định)",
  ArrowLeft: "Xoay camera trái (cố định)",
  ArrowRight: "Xoay camera phải (cố định)",
};

export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "Shift trái",
    ShiftRight: "Shift phải",
    ControlLeft: "Ctrl trái",
    ControlRight: "Ctrl phải",
    AltLeft: "Alt trái",
    AltRight: "Alt phải",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    CapsLock: "Caps Lock",
    Escape: "Esc",
  };
  return named[code] ?? code;
}

export type AssignResult = { ok: true; keys: KeyMap } | { ok: false; conflict: string };

/** Binds `code` to `action`. A key already used by another action (or reserved) is refused and named. */
export function assignKey(keys: KeyMap, action: Action, code: string): AssignResult {
  if (RESERVED[code]) return { ok: false, conflict: RESERVED[code]! };
  const other = ACTIONS.find((a) => a !== action && keys[a] === code);
  if (other) return { ok: false, conflict: ACTION_LABELS[other] };
  return { ok: true, keys: { ...keys, [action]: code } };
}

/** Actions sharing a key (a stored map edited by hand); empty when the map is valid. */
export function duplicates(keys: KeyMap): Action[][] {
  const by = new Map<string, Action[]>();
  for (const a of ACTIONS) by.set(keys[a], [...(by.get(keys[a]) ?? []), a]);
  return [...by.values()].filter((g) => g.length > 1);
}

/** A stored map: unknown or missing entries fall back to the defaults; a map with duplicates is reset. */
export function loadKeyMap(raw: unknown): KeyMap {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const keys = { ...DEFAULT_KEYS };
  for (const a of ACTIONS) if (typeof o[a] === "string" && o[a] && !RESERVED[o[a] as string]) keys[a] = o[a] as string;
  return duplicates(keys).length ? { ...DEFAULT_KEYS } : keys;
}
