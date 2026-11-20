// One tick of gameplay, in the order fixed by Ticket-02 ("Thứ tự xử lý trong một tick (bắt buộc)").
import { worldMove } from "./inputs.js";
import { TUNING, WORLD } from "./tuning.js";
import type { Button, Drifter, InputState, Shade, SimEvent, Vec3, World } from "./types.js";
import {
  activeState,
  addDroppedMote,
  addRandomMote,
  distXZ,
  makeShade,
  newDrifter,
  newShadeId,
  timeLeftS,
} from "./world.js";

const DT = 1 / WORLD.tick_rate;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });

/** Advance the world by exactly one contract tick. Returns events produced in this step. */
export function step(w: World, input: InputState): SimEvent[] {
  const events: SimEvent[] = [];
  if (w.state === "won" || w.state === "lost") return events;
  const prev = w.prevInput;
  const pressed = (b: Button) => input[b] && !prev[b];
  w.prevInput = { ...input, move: [...input.move] };
  w.steps++;
  if (!w.started) {
    w.started = true;
    events.push({ name: "night_start", data: { night: w.map.night } }); // A23
  }

  // 1. Input: pause first; a tick that pauses (or stays paused) stops here.
  if (pressed("pause")) {
    if (w.state === "playing") {
      w.state = "paused";
      events.push({ name: "paused", data: {} });
      return events;
    }
    w.state = "playing";
    events.push({ name: "resumed", data: {} });
  } else if (w.state === "paused") {
    return events;
  }
  w.simTicks++;
  const s = w.simTicks;

  tickTimers(w, s); // 2
  movePlayer(w, input, pressed, events); // 3
  const away = w.player.falling; // waiting to respawn: no pickup / interact / pulse / contact (A7)
  if (!away) pickup(w, events); // 4
  if (!away && pressed("interact")) deposit(w, events); // 5
  updateSafeZones(w); // 6
  if (!away && pressed("pulse")) pulse(w, events); // 7
  moveShades(w); // 8
  moveDrifters(w);
  if (!away) contacts(w, events); // 9
  spawn(w, s, events); // 10
  checkGameOver(w, events); // 11
  return events;
}

// ---------- 2. timers ----------
function tickTimers(w: World, s: number): void {
  const p = w.player;
  const dec = (v: number) => (v > 0 ? v - 1 : 0);
  p.invulnTicks = dec(p.invulnTicks);
  p.dashCdTicks = dec(p.dashCdTicks);
  p.pulseCdTicks = dec(p.pulseCdTicks);
  p.charmTicks = dec(p.charmTicks);
  p.respawnTicks = dec(p.respawnTicks);
  for (const sh of w.shades) if (sh.state === "stunned") sh.ticks = dec(sh.ticks);
  w.motes = w.motes.filter((m) => {
    if (m.ttl === null) return true;
    m.ttl = dec(m.ttl);
    return m.ttl > 0;
  });
  for (const c of w.charms) {
    if (c.available) continue;
    c.respawnTicks = dec(c.respawnTicks);
    if (c.respawnTicks === 0) c.available = true;
  }
  // R26 / A21: gusts at sim ticks 1800k .. 1800k+299, announced 120 ticks before.
  if (w.map.wind && w.windEnabled) {
    if ((s + WORLD.wind_warn) % WORLD.wind_period === 0) w.wind.dirDeg = Math.floor(w.rng.next() * 360);
    const phase = s % WORLD.wind_period;
    w.wind.active = s >= WORLD.wind_period && phase < WORLD.wind_duration;
    w.wind.warning = phase >= WORLD.wind_period - WORLD.wind_warn;
  }
}

// ---------- 3. player movement ----------
function movePlayer(w: World, input: InputState, pressed: (b: Button) => boolean, events: SimEvent[]): void {
  const p = w.player;
  const map = w.map;
  if (p.falling) {
    p.vel = [0, 0, 0];
    if (p.respawnTicks > 0) return;
    // A7: respawn at the night's start point, velocity 0, invulnerable.
    p.falling = false;
    p.pos = [...map.start];
    p.vy = 0;
    p.grounded = map.groundAt(p.pos[0], p.pos[2]) !== null;
    p.launch = null;
    p.dashLeft = 0;
    p.invulnTicks = WORLD.invuln_ticks;
    return;
  }

  const [mx, mz] = worldMove(input);
  const mlen = Math.hypot(mx, mz);
  if (mlen > 1e-9) p.facing = [mx / mlen, mz / mlen];

  // Bounce pad (A5): standing on it launches the player.
  if (p.grounded && !p.launch) {
    const pad = map.pads.find((pd) => distXZ(p.pos, pd.pos) <= pd.radius && Math.abs(p.pos[1] - pd.pos[1]) < 0.01);
    if (pad) {
      p.launch = [...pad.vh];
      p.vy = pad.vy;
      p.grounded = false;
    }
  }

  // Dash (A6): edge-triggered, cooldown counted from the start; the charm removes the cooldown.
  if (pressed("dash") && p.dashLeft === 0 && (p.charmTicks > 0 || p.dashCdTicks === 0)) {
    p.dashDir = mlen > 1e-9 ? [mx / mlen, mz / mlen] : [...p.facing];
    p.facing = [...p.dashDir];
    p.dashLeft = WORLD.dash_ticks;
    p.dashCdTicks = p.charmTicks > 0 ? 0 : WORLD.dash_cd_ticks;
    events.push({ name: "dash", data: {} });
  }

  let vx: number;
  let vz: number;
  if (p.dashLeft > 0) [vx, vz] = [p.dashDir[0] * TUNING.dash_speed, p.dashDir[1] * TUNING.dash_speed];
  else if (p.launch) [vx, vz] = p.launch;
  else {
    const speed = p.charmTicks > 0 ? WORLD.charm_speed : TUNING.player_speed;
    [vx, vz] = [mx * speed, mz * speed];
  }
  if (w.wind.active) {
    const a = (w.wind.dirDeg * Math.PI) / 180;
    vx += Math.cos(a) * WORLD.wind_speed;
    vz += Math.sin(a) * WORLD.wind_speed;
  }

  const airDash = p.dashLeft > 0 && !p.grounded;
  if (airDash) p.vy = 0; // dashing in the air keeps the altitude
  else {
    if (pressed("jump") && p.grounded) {
      p.vy = WORLD.jump_velocity;
      p.grounded = false;
    }
    p.vy -= WORLD.gravity * DT;
  }

  const old: Vec3 = [...p.pos];
  const y = p.pos[1];
  slide(p.pos, vx * DT, vz * DT, (x, z) => {
    const g = map.groundAt(x, z);
    return g === null || g <= y + WORLD.step_up; // walls block, the cloud sea does not
  });
  p.pos[1] += p.vy * DT;

  const g = map.groundAt(p.pos[0], p.pos[2]);
  const wasGrounded = p.grounded;
  if (g !== null && (p.pos[1] <= g || (wasGrounded && p.vy <= 0 && p.pos[1] - g <= WORLD.step_up))) {
    p.pos[1] = g; // land, or follow the ground down a ramp / small step
    p.vy = 0;
    p.grounded = true;
    p.launch = null;
  } else {
    p.grounded = false;
  }
  if (p.dashLeft > 0) p.dashLeft--;
  p.vel = [(p.pos[0] - old[0]) / DT, (p.pos[1] - old[1]) / DT, (p.pos[2] - old[2]) / DT];

  // R20: falling into the cloud sea, exactly once, ignoring invulnerability.
  if (p.pos[1] < WORLD.fall_y) {
    const lost = p.carried;
    p.carried = 0;
    p.flames = Math.max(0, p.flames - 1);
    p.falling = true;
    p.respawnTicks = WORLD.respawn_wait_ticks;
    p.vel = [0, 0, 0];
    p.vy = 0;
    p.launch = null;
    p.dashLeft = 0;
    events.push({ name: "player_hit", data: { by: "fall", flames: p.flames, dropped: 0, lost } });
  }
}

/** Move by (dx, dz) if allowed, else slide along X or Z. Returns false when any part was blocked. */
function slide(pos: Vec3, dx: number, dz: number, ok: (x: number, z: number) => boolean): boolean {
  if (dx === 0 && dz === 0) return true;
  if (ok(pos[0] + dx, pos[2] + dz)) {
    pos[0] += dx;
    pos[2] += dz;
    return true;
  }
  if (dx !== 0 && ok(pos[0] + dx, pos[2])) pos[0] += dx;
  else if (dz !== 0 && ok(pos[0], pos[2] + dz)) pos[2] += dz;
  return false;
}

// ---------- 4. pickup ----------
function pickup(w: World, events: SimEvent[]): void {
  const p = w.player;
  const near = (pos: Vec3) =>
    distXZ(p.pos, pos) <= TUNING.pickup_radius && Math.abs(p.pos[1] - pos[1]) <= WORLD.pickup_height;
  w.motes = w.motes.filter((m) => {
    if (p.carried >= TUNING.carry_capacity || !near(m.pos)) return true;
    p.carried++;
    events.push({ name: "mote_picked", data: { carried: p.carried } });
    return false;
  });
  for (const c of w.charms) {
    if (!c.available || !near(c.pos)) continue;
    c.available = false;
    c.respawnTicks = WORLD.charm_respawn_ticks;
    p.charmTicks = WORLD.charm_ticks;
    events.push({ name: "charm_picked", data: { charm_id: c.id, charm_ticks: WORLD.charm_ticks } });
  }
}

// ---------- 5. lanterns ----------
function deposit(w: World, events: SimEvent[]): void {
  const p = w.player;
  if (p.carried <= 0) return;
  let target: World["lanterns"][number] | undefined;
  let best = Infinity;
  for (const l of w.lanterns) {
    const d = distXZ(p.pos, l.pos);
    if (!l.lit && d <= TUNING.interact_radius && d < best) {
      best = d;
      target = l;
    }
  }
  if (!target) return;
  const amount = Math.min(p.carried, Math.max(0, TUNING.lantern_cost - target.deposited));
  if (amount > 0) {
    p.carried -= amount;
    target.deposited += amount;
    w.score += amount * TUNING.score.per_mote;
    events.push({ name: "deposit", data: { lantern_id: target.id, amount, deposited: target.deposited } });
  }
  if (target.deposited >= TUNING.lantern_cost) {
    target.lit = true;
    w.score += TUNING.score.per_lantern;
    events.push({ name: "lantern_lit", data: { lantern_id: target.id } });
  }
}

// ---------- 6. safe zones ----------
const SAFE_EDGE = TUNING.safe_radius + WORLD.safe_eps;

/** The lit lantern whose safe zone contains `pos` (XZ ≤ safe_radius), if any. */
function litZoneAt(w: World, pos: Vec3) {
  return w.lanterns.find((l) => l.lit && distXZ(pos, l.pos) <= TUNING.safe_radius);
}

function updateSafeZones(w: World): void {
  for (const s of w.shades) {
    const l = litZoneAt(w, s.pos);
    if (!l) continue;
    // A11: pushed out 0.2 m per tick (≤ 30 ticks from anywhere inside), harmless meanwhile.
    const dx = s.pos[0] - l.pos[0];
    const dz = s.pos[2] - l.pos[2];
    const d = Math.hypot(dx, dz);
    const [ux, uz] = d > 0 ? [dx / d, dz / d] : [1, 0];
    const nd = Math.min(SAFE_EDGE, d + WORLD.safe_evict_per_tick);
    s.pos[0] = l.pos[0] + ux * nd;
    s.pos[2] = l.pos[2] + uz * nd;
    settleShade(w, s);
  }
}

// ---------- 7. pulse ----------
function pulse(w: World, events: SimEvent[]): void {
  const p = w.player;
  if (p.carried < TUNING.pulse_cost || p.pulseCdTicks > 0) return;
  p.carried -= TUNING.pulse_cost;
  p.pulseCdTicks = WORLD.pulse_cd_ticks;
  const c: Vec3 = [p.pos[0], p.pos[1] + WORLD.pulse_center_h, p.pos[2]];
  const inRange = (pos: Vec3) => Math.hypot(pos[0] - c[0], pos[1] - c[1], pos[2] - c[2]) <= TUNING.pulse_radius;
  const stunned: string[] = [];
  for (const s of w.shades) {
    if (!inRange(s.pos)) continue;
    const dx = s.pos[0] - c[0];
    const dz = s.pos[2] - c[2];
    const d = Math.hypot(dx, dz);
    const [ux, uz] = d > 0 ? [dx / d, dz / d] : [1, 0];
    s.state = "stunned";
    s.ticks = WORLD.stun_ticks;
    s.pushLeft = WORLD.push_ticks;
    s.pushStep = [(ux * TUNING.pulse_push_m) / WORLD.push_ticks, (uz * TUNING.pulse_push_m) / WORLD.push_ticks];
    w.score += TUNING.score.per_stun;
    stunned.push(s.id);
  }
  events.push({ name: "pulse", data: { stunned_ids: stunned } });
  for (const d of w.drifters) {
    if (!inRange(d.pos)) continue;
    if (d.state === "chase") {
      d.state = "flee";
      d.ticks = WORLD.drifter_flee_ticks;
    } else if (d.state === "flee" && d.stolen > 0) {
      const amount = d.stolen;
      for (let i = 0; i < amount; i++) addDroppedMote(w, d.pos[0], d.pos[2]);
      d.stolen = 0;
      d.ticks = WORLD.drifter_drop_vanish_ticks;
      events.push({ name: "drifter_drop", data: { drifter_id: d.id, amount } });
    }
  }
}

// ---------- 8. shades and drifters ----------
function moveShades(w: World): void {
  const p = w.player.pos;
  const speed = w.map.shadeSpeed * DT;
  for (const s of w.shades) {
    if (litZoneAt(w, s.pos)) continue; // being pushed out of a safe zone (step 6)
    if (s.state === "spawning") {
      s.ticks--;
      if (s.ticks <= 0) s.state = activeState(w, s);
      continue;
    }
    if (s.state === "stunned") {
      if (s.ticks > 0) {
        if (s.pushLeft > 0) s.pushLeft = moveShade(w, s, s.pushStep[0], s.pushStep[1]) ? s.pushLeft - 1 : 0;
        continue;
      }
      s.pushLeft = 0;
      s.state = activeState(w, s);
    }
    if (s.state === "recoil") {
      if (s.pushLeft > 0 && !moveShade(w, s, s.pushStep[0], s.pushStep[1])) s.pushLeft = 0;
      s.ticks--;
      if (s.ticks <= 0) s.state = activeState(w, s);
      continue;
    }
    const d = distXZ(s.pos, p);
    if (s.state === "wander" && d <= WORLD.shade_detect) s.state = "chase";
    else if (s.state === "chase" && d > WORLD.shade_lose) s.state = "wander";
    if (s.state === "chase") {
      if (d > 0) {
        const k = Math.min(speed, d) / d;
        moveShade(w, s, (p[0] - s.pos[0]) * k, (p[2] - s.pos[2]) * k);
      }
    } else {
      const t = wanderTarget(w, s);
      const dt = distXZ(s.pos, t);
      if (dt > 0) {
        const k = Math.min(WORLD.shade_wander_speed * DT, dt) / dt;
        moveShade(w, s, (t[0] - s.pos[0]) * k, (t[2] - s.pos[2]) * k);
      }
    }
  }
}

/** A9/A18: walk toward a random mote spawn point, re-picked on arrival or every 240 ticks. */
function wanderTarget(w: World, e: Shade | Drifter): Vec3 {
  e.wanderTicks--;
  if (!e.wanderTarget || e.wanderTicks <= 0 || distXZ(e.pos, e.wanderTarget) < 0.5) {
    const pts = w.map.moteSpawns;
    e.wanderTarget = pts[Math.floor(w.rng.next() * pts.length)]!;
    e.wanderTicks = WORLD.wander_retarget_ticks;
  }
  return e.wanderTarget;
}

/**
 * A10/A12: shades walk on the terrain: no cloud sea, no climbing walls (step ≤ step_up), may drop down;
 * they stop at the edge of lit safe zones. Returns false when blocked (pushes then stop).
 */
function moveShade(w: World, s: Shade, dx: number, dz: number): boolean {
  const groundNow = s.pos[1] - s.hover;
  const old: Vec3 = [...s.pos];
  const ok = (x: number, z: number) => {
    const g = w.map.groundAt(x, z);
    return g !== null && g <= groundNow + WORLD.step_up;
  };
  let free = slide(s.pos, dx, dz, ok);
  for (const l of w.lanterns) {
    if (!l.lit) continue;
    const ex = s.pos[0] - l.pos[0];
    const ez = s.pos[2] - l.pos[2];
    const d = Math.hypot(ex, ez);
    if (d < SAFE_EDGE) {
      // Stopped at the edge (6 m + eps) so "within safe_radius" never holds, even after rounding.
      const [ux, uz] = d > 0 ? [ex / d, ez / d] : [1, 0];
      s.pos[0] = l.pos[0] + ux * SAFE_EDGE;
      s.pos[2] = l.pos[2] + uz * SAFE_EDGE;
      free = false;
    }
  }
  if (!ok(s.pos[0], s.pos[2])) {
    s.pos = old;
    return false;
  }
  settleShade(w, s);
  return free;
}

function settleShade(w: World, s: Shade): void {
  const g = w.map.groundAt(s.pos[0], s.pos[2]);
  if (g !== null) s.pos[1] = g + s.hover;
}

function moveDrifters(w: World): void {
  const p = w.player;
  const step = WORLD.drifter_speed * DT;
  for (const d of w.drifters) {
    if (d.state === "removed") continue;
    if (d.state === "flee") {
      const dx = d.pos[0] - p.pos[0];
      const dz = d.pos[2] - p.pos[2];
      const len = Math.hypot(dx, dz);
      const [ux, uz] = len > 0 ? [dx / len, dz / len] : [1, 0];
      d.pos[0] += ux * step;
      d.pos[2] += uz * step;
      d.ticks--;
      if (d.ticks <= 0) d.state = "removed"; // gone, with whatever it still carries
      continue;
    }
    const dist = distXZ(d.pos, p.pos);
    const wants = !p.falling && p.carried >= WORLD.drifter_min_carried && dist <= WORLD.drifter_detect;
    d.state = wants ? "chase" : "idle";
    if (d.state === "chase") {
      if (dist > 0) {
        const k = Math.min(step, dist) / dist;
        d.pos[0] += (p.pos[0] - d.pos[0]) * k;
        d.pos[2] += (p.pos[2] - d.pos[2]) * k;
      }
    } else {
      const t = wanderTarget(w, d);
      const dt = distXZ(d.pos, t);
      if (dt > 0) {
        const k = Math.min(WORLD.drifter_idle_speed * DT, dt) / dt;
        d.pos[0] += (t[0] - d.pos[0]) * k;
        d.pos[2] += (t[2] - d.pos[2]) * k;
      }
    }
  }
}

// ---------- 9. contacts: drifters steal first, then shades hit (increasing id) ----------
function contacts(w: World, events: SimEvent[]): void {
  const p = w.player;
  for (const d of [...w.drifters].sort(byId)) {
    if ((d.state !== "idle" && d.state !== "chase") || d.hasStolen || p.carried <= 0) continue;
    if (distXZ(d.pos, p.pos) > WORLD.drifter_steal_radius) continue;
    const amount = Math.min(WORLD.drifter_steal_max, p.carried);
    p.carried -= amount;
    d.stolen = amount;
    d.hasStolen = true;
    d.state = "flee";
    d.ticks = WORLD.drifter_flee_ticks;
    events.push({ name: "drifter_steal", data: { drifter_id: d.id, amount, carried: p.carried } });
  }

  if (p.invulnTicks > 0) return;
  for (const s of [...w.shades].sort(byId)) {
    if (s.state !== "wander" && s.state !== "chase") continue;
    if (litZoneAt(w, s.pos)) continue;
    if (distXZ(s.pos, p.pos) > TUNING.shade_hit_radius) continue;
    if (Math.abs(p.pos[1] - (s.pos[1] - s.hover)) > WORLD.shade_hit_height) continue;
    p.flames = Math.max(0, p.flames - 1);
    const dropped = Math.floor(p.carried * TUNING.hit_drop_ratio);
    p.carried -= dropped;
    const base = w.rng.next() * 2 * Math.PI;
    for (let i = 0; i < dropped; i++) {
      const a = base + (2 * Math.PI * i) / dropped;
      const r = WORLD.drop_ring_min + w.rng.next() * (WORLD.drop_ring_max - WORLD.drop_ring_min);
      addDroppedMote(w, p.pos[0] + r * Math.cos(a), p.pos[2] + r * Math.sin(a));
    }
    p.invulnTicks = WORLD.invuln_ticks;
    events.push({ name: "player_hit", data: { by: "shade", flames: p.flames, dropped } });
    // Recoil: back off 2 m from the player over 60 ticks.
    const dx = s.pos[0] - p.pos[0];
    const dz = s.pos[2] - p.pos[2];
    const d = Math.hypot(dx, dz);
    const [ux, uz] = d > 0 ? [dx / d, dz / d] : [1, 0];
    s.state = "recoil";
    s.ticks = WORLD.recoil_ticks;
    s.pushLeft = WORLD.recoil_ticks;
    s.pushStep = [(ux * WORLD.recoil_m) / WORLD.recoil_ticks, (uz * WORLD.recoil_m) / WORLD.recoil_ticks];
    return; // at most one flame per tick
  }
}

// ---------- 10. spawning ----------
function spawn(w: World, s: number, events: SimEvent[]): void {
  const map = w.map;
  if (w.randomMotes && s % WORLD.mote_spawn_every === 0 && w.motes.length < WORLD.mote_cap) {
    const used = new Set(w.motes.map((m) => m.spawnIdx));
    const free = map.moteSpawns.map((_, i) => i).filter((i) => !used.has(i));
    if (free.length > 0) addRandomMote(w, free[Math.floor(w.rng.next() * free.length)]!);
  }

  if (w.randomShades) {
    const first = WORLD.shade_first_spawn_tick;
    const count = s === first ? WORLD.shade_first_spawn_count : s > first && (s - first) % map.shadeInterval === 0 ? 1 : 0;
    const taken = new Set<number>();
    for (let i = 0; i < count && w.shades.length < map.shadeMax; i++) {
      const valid = map.shadeSpawns
        .map((pt, idx) => ({ pt, idx }))
        .filter(({ pt, idx }) => !taken.has(idx) && distXZ(pt, w.player.pos) >= WORLD.shade_min_spawn_dist && !litZoneAt(w, pt));
      if (valid.length === 0) break; // no valid point: skip this turn
      const { pt, idx } = valid[Math.floor(w.rng.next() * valid.length)]!;
      taken.add(idx);
      const g = map.groundAt(pt[0], pt[2]) ?? pt[1];
      const shade = makeShade(newShadeId(w), [pt[0], g + WORLD.shade_hover, pt[2]], WORLD.shade_hover);
      shade.state = "spawning";
      shade.ticks = WORLD.shade_spawning_ticks;
      w.shades.push(shade);
      events.push({ name: "shade_spawned", data: { id: shade.id } });
    }
  }

  if (map.drifters && w.randomDrifters && s % WORLD.drifter_spawn_every === 0) {
    const alive = w.drifters.filter((d) => d.state !== "removed").length;
    if (alive < WORLD.drifter_max) {
      const pt = map.shadeSpawns[Math.floor(w.rng.next() * map.shadeSpawns.length)]!;
      const g = map.groundAt(pt[0], pt[2]) ?? pt[1];
      newDrifter(w, [pt[0], g + WORLD.drifter_fly_h, pt[2]]);
    }
  }
}

// ---------- 11. win / loss: no_flames always loses, then all lit wins, then dawn ----------
function checkGameOver(w: World, events: SimEvent[]): void {
  if (w.player.flames <= 0) {
    w.state = "lost";
    events.push({ name: "game_over", data: { result: "lost", reason: "no_flames" } });
  } else if (w.lanterns.every((l) => l.lit)) {
    w.state = "won";
    w.score +=
      TUNING.score.per_second_left * Math.floor(timeLeftS(w)) + TUNING.score.per_flame_left * w.player.flames;
    events.push({ name: "game_over", data: { result: "won", reason: "all_lit" } });
  } else if (timeLeftS(w) <= 0) {
    w.state = "lost";
    events.push({ name: "game_over", data: { result: "lost", reason: "dawn" } });
  }
}

export { distXZ };
