// DOM HUD (Ticket-02 item 7): flames top-left, mm:ss top-centre (red + blinking ≤ 30 s), lanterns k/n and score
// top-right, mote bar bottom-centre, dash / pulse cooldowns bottom-right, deposit prompt near a lantern,
// and an arrow to the nearest unlit lantern when it is off screen.
// Ticket-03: lit count shows the dawn target, the bar has one cell per capacity slot with "carried / capacity",
// and the prompt says light / relight (x/10 or x/5) or refuel (fuel/100).
// Ticket-04 §4: captions for sound cues and edge-of-screen arrows toward new shades and low-fuel lanterns; key names
// follow the player's bindings.
import * as THREE from "three";
import { TUNING, WORLD } from "../sim/tuning.js";
import type { World } from "../sim/types.js";
import { litNeeded } from "../sim/step.js";
import { capacity, distXZ, timeLeftS } from "../sim/world.js";
import { keyLabel, type KeyMap } from "./keys.js";

export type CaptionKind = "shade" | "wind" | "time" | "fuel" | "info";
const CAPTION_ICON: Record<CaptionKind, string> = { shade: "👁", wind: "🍃", time: "⏱", fuel: "🏮", info: "•" };

/** An edge arrow toward a shade or a lantern, shown while the target is off screen, until `until`. */
interface Pointer {
  kind: "shade" | "fuel";
  id: string;
  until: number;
  el: HTMLDivElement;
}

const $ = (id: string) => document.getElementById(id)!;

const FLAME_SVG = (on: boolean) =>
  `<svg viewBox="0 0 24 32" class="flame ${on ? "on" : "off"}"><path d="M12 1C14 8 21 11 21 20a9 9 0 0 1-18 0c0-5 3-7 4-11 1 3 2 4 3 4 0-5 1-8 2-12z"/><path class="inner" d="M12 14c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-5 0 1 1 2 1 2 0-2 0-3 1-5z"/></svg>`;

export class Hud {
  private readonly root = $("hud");
  private readonly flames = $("flames");
  private readonly timer = $("timer");
  private readonly lanterns = $("lanterns");
  private readonly score = $("score");
  private readonly bar = $("motebar");
  private readonly carry = $("carry");
  private readonly cdDash = $("cd-dash");
  private readonly cdPulse = $("cd-pulse");
  private readonly prompt = $("prompt");
  private readonly arrow = $("arrow");
  private readonly banner = $("banner");
  private readonly tag = $("tag");
  private readonly captions = $("captions");
  private readonly edge = $("edge");
  private readonly pointers: Pointer[] = [];
  private keys: KeyMap | null = null;
  private lastFlames = -1;
  private lastCarried = -1;
  private lastCapacity = -1;
  private bannerUntil = 0;
  private readonly v = new THREE.Vector3();

  constructor() {}

  show(on: boolean) {
    this.root.classList.toggle("hidden", !on);
  }

  setTag(text: string) {
    this.tag.textContent = text;
  }

  /** Key names on the HUD follow the bindings (Ticket-04 §4 "Đổi phím"). */
  setKeys(keys: KeyMap) {
    this.keys = keys;
    this.cdDash.querySelector("b")!.textContent = keyLabel(keys.dash).replace(" trái", "").replace(" phải", "");
    this.cdPulse.querySelector("b")!.textContent = keyLabel(keys.pulse);
  }

  /** A caption line for a sound cue (P4-A24); the newest 3 stay on screen. */
  caption(text: string, kind: CaptionKind, seconds = 3.5) {
    const line = document.createElement("div");
    line.className = `cap ${kind}`;
    line.innerHTML = `<span class="ic" aria-hidden="true">${CAPTION_ICON[kind]}</span>`;
    line.append(text);
    this.captions.append(line);
    while (this.captions.children.length > 3) this.captions.firstElementChild!.remove();
    setTimeout(() => line.remove(), seconds * 1000);
  }

  /** Edge arrow toward shade / lantern `id` for `seconds` (only drawn while it is off screen). */
  point(kind: Pointer["kind"], id: string, seconds: number, now: number) {
    const old = this.pointers.find((p) => p.kind === kind && p.id === id);
    if (old) {
      old.until = now + seconds;
      return;
    }
    const el = document.createElement("div");
    el.className = `edge-arrow ${kind}`;
    this.edge.append(el);
    this.pointers.push({ kind, id, until: now + seconds, el });
  }

  clearPointers() {
    for (const p of this.pointers) p.el.remove();
    this.pointers.length = 0;
    this.captions.replaceChildren();
  }

  /** Places `el` on the screen border in the direction of world point `pos`; returns false when `pos` is on screen. */
  private toEdge(el: HTMLElement, pos: readonly number[], camera: THREE.Camera, margin = 0.95): boolean {
    this.v.set(pos[0]!, pos[1]!, pos[2]!).project(camera);
    const behind = this.v.z > 1;
    let { x, y } = this.v;
    if (behind) {
      x = -x;
      y = -y;
    }
    const off = behind || Math.abs(x) > margin || Math.abs(y) > margin;
    if (off) {
      const ang = Math.atan2(y, x);
      const k = 0.86 / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
      const sx = ((Math.cos(ang) * k + 1) / 2) * innerWidth;
      const sy = ((1 - Math.sin(ang) * k) / 2) * innerHeight;
      el.style.transform = `translate(${sx}px, ${sy}px) rotate(${-ang}rad)`;
    }
    return off;
  }

  flash(text: string, seconds: number, now: number, danger = false) {
    this.banner.textContent = text;
    this.banner.classList.toggle("danger", danger);
    this.banner.classList.add("show");
    this.bannerUntil = now + seconds;
  }

  update(w: World, camera: THREE.Camera, now: number) {
    const p = w.player;
    if (p.flames !== this.lastFlames) {
      this.flames.innerHTML = Array.from({ length: TUNING.flames }, (_, i) => FLAME_SVG(i < p.flames)).join("");
      this.lastFlames = p.flames;
    }
    const left = Math.max(0, timeLeftS(w));
    const secs = Math.ceil(left - 1e-9);
    this.timer.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    this.timer.classList.toggle("low", left <= 30);
    const lit = w.lanterns.filter((l) => l.lit).length;
    this.lanterns.textContent = `${lit}/${w.lanterns.length} (cần ${litNeeded(w.lanterns.length)})`;
    this.score.textContent = String(w.score);
    const cap = capacity(w);
    if (cap !== this.lastCapacity) {
      this.bar.innerHTML = Array.from({ length: cap }, () => `<i></i>`).join("");
      this.bar.classList.toggle("wide", cap > 12);
      this.lastCapacity = cap;
      this.lastCarried = -1;
    }
    if (p.carried !== this.lastCarried) {
      this.carry.textContent = `${p.carried} / ${cap}`;
      const cells = this.bar.children;
      for (let i = 0; i < cells.length; i++) cells[i]!.classList.toggle("full", i < p.carried);
      this.lastCarried = p.carried;
    }
    // Cooldowns as a conic sweep (full = ready). The charm removes the dash cooldown.
    const dashFrac = p.dashCdTicks / WORLD.dash_cd_ticks;
    const pulseFrac = p.pulseCdTicks / WORLD.pulse_cd_ticks;
    this.cdDash.style.setProperty("--p", String(1 - dashFrac));
    this.cdPulse.style.setProperty("--p", String(1 - pulseFrac));
    this.cdDash.classList.toggle("ready", p.dashCdTicks === 0);
    this.cdDash.classList.toggle("charm", p.charmTicks > 0);
    this.cdPulse.classList.toggle("ready", p.pulseCdTicks === 0 && p.carried >= TUNING.pulse_cost);

    // Prompt: the lantern E would act on (nearest that can receive: unlit, or lit and not full).
    let target: World["lanterns"][number] | undefined;
    for (const l of w.lanterns) {
      const ok = !l.lit || l.fuel < WORLD.fuel_max_units;
      if (ok && distXZ(p.pos, l.pos) <= TUNING.interact_radius && (!target || distXZ(p.pos, l.pos) < distXZ(p.pos, target.pos))) target = l;
    }
    this.prompt.classList.toggle("show", target !== undefined);
    if (target) {
      const fuel = Math.floor(target.fuel / WORLD.fuel_units_per_fuel);
      const k = keyLabel(this.keys?.interact ?? "KeyE");
      this.prompt.textContent = target.lit
        ? `${k} — Châm dầu (${fuel}/${TUNING.fuel_max})`
        : target.everLit
          ? `${k} — Thắp lại (${target.deposited}/${TUNING.relight_cost})`
          : `${k} — Nạp ánh sáng (${target.deposited}/${TUNING.lantern_cost})`;
    }
    const inRange = target !== undefined;

    // Off-screen arrow to the nearest unlit lantern.
    const unlit = w.lanterns.filter((l) => !l.lit);
    let nearest = unlit[0];
    for (const l of unlit) if (distXZ(p.pos, l.pos) < distXZ(p.pos, nearest!.pos)) nearest = l;
    if (nearest && !inRange) {
      const off = this.toEdge(this.arrow, [nearest.pos[0], nearest.pos[1] + 3.5, nearest.pos[2]], camera);
      this.arrow.classList.toggle("show", off);
      this.arrow.title = nearest.id;
    } else this.arrow.classList.remove("show");

    // Ticket-04 §4 edge arrows: new shades (4 s) and lanterns that dropped below 30 fuel (6 s), while off screen.
    for (let i = this.pointers.length - 1; i >= 0; i--) {
      const ptr = this.pointers[i]!;
      const target =
        ptr.kind === "shade"
          ? w.shades.find((s) => s.id === ptr.id)?.pos
          : (() => {
              const l = w.lanterns.find((x) => x.id === ptr.id && x.lit && x.fuel < WORLD.low_fuel_units);
              return l ? [l.pos[0], l.pos[1] + 3.5, l.pos[2]] : undefined;
            })();
      if (!target || now > ptr.until) {
        ptr.el.remove();
        this.pointers.splice(i, 1);
        continue;
      }
      ptr.el.classList.toggle("show", this.toEdge(ptr.el, target, camera, 0.9));
    }

    if (now > this.bannerUntil) this.banner.classList.remove("show");
  }
}
