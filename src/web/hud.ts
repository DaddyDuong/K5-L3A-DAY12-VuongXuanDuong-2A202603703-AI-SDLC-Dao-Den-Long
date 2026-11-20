// DOM HUD (Ticket-02 item 7): flames top-left, mm:ss top-centre (red + blinking ≤ 30 s), lanterns k/n and score
// top-right, 10-cell mote bar bottom-centre, dash / pulse cooldowns bottom-right, deposit prompt near a lantern,
// and an arrow to the nearest unlit lantern when it is off screen.
import * as THREE from "three";
import { TUNING, WORLD } from "../sim/tuning.js";
import type { World } from "../sim/types.js";
import { distXZ, timeLeftS } from "../sim/world.js";

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
  private readonly cdDash = $("cd-dash");
  private readonly cdPulse = $("cd-pulse");
  private readonly prompt = $("prompt");
  private readonly arrow = $("arrow");
  private readonly banner = $("banner");
  private readonly tag = $("tag");
  private lastFlames = -1;
  private lastCarried = -1;
  private bannerUntil = 0;
  private readonly v = new THREE.Vector3();

  constructor() {
    this.bar.innerHTML = Array.from({ length: TUNING.carry_capacity }, () => `<i></i>`).join("");
  }

  show(on: boolean) {
    this.root.classList.toggle("hidden", !on);
  }

  setTag(text: string) {
    this.tag.textContent = text;
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
    this.lanterns.textContent = `${lit}/${w.lanterns.length}`;
    this.score.textContent = String(w.score);
    if (p.carried !== this.lastCarried) {
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

    // Deposit prompt: nearest unlit lantern within interact range.
    const unlit = w.lanterns.filter((l) => !l.lit);
    let nearest = unlit[0];
    for (const l of unlit) if (distXZ(p.pos, l.pos) < distXZ(p.pos, nearest!.pos)) nearest = l;
    const inRange = nearest !== undefined && distXZ(p.pos, nearest.pos) <= TUNING.interact_radius;
    this.prompt.classList.toggle("show", inRange);
    if (inRange) this.prompt.textContent = `E — Nạp ánh sáng (${nearest!.deposited}/${TUNING.lantern_cost})`;

    // Off-screen arrow to the nearest unlit lantern.
    if (nearest && !inRange) {
      this.v.set(nearest.pos[0], nearest.pos[1] + 3.5, nearest.pos[2]).project(camera);
      const behind = this.v.z > 1;
      let { x, y } = this.v;
      if (behind) {
        x = -x;
        y = -y;
      }
      const off = behind || Math.abs(x) > 0.95 || Math.abs(y) > 0.95;
      this.arrow.classList.toggle("show", off);
      if (off) {
        const ang = Math.atan2(y, x);
        const k = 0.86 / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
        const sx = ((Math.cos(ang) * k + 1) / 2) * innerWidth;
        const sy = ((1 - Math.sin(ang) * k) / 2) * innerHeight;
        this.arrow.style.transform = `translate(${sx}px, ${sy}px) rotate(${-ang}rad)`;
        this.arrow.title = nearest.id;
      }
    } else this.arrow.classList.remove("show");

    if (now > this.bannerUntil) this.banner.classList.remove("show");
  }
}
