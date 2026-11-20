import { MalformedError } from "./inputs.js";
import { nightMap } from "./maps.js";
import { DRIFTER_STATES, SHADE_STATES, type DrifterState, type ShadeState, type Vec3 } from "./types.js";

export interface Scenario {
  player?: {
    pos?: Vec3;
    carried?: number;
    flames?: number;
    invuln_ticks?: number;
    dash_cd_ticks?: number;
    pulse_cd_ticks?: number;
    charm_ticks?: number;
    successful_lights?: number;
  };
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: Vec3[];
  shades?: { id?: string; pos: Vec3; state?: ShadeState; state_ticks_left?: number; target_lantern_id?: string }[];
  drifters?: { id?: string; pos: Vec3; state?: DrifterState; stolen?: number; state_ticks_left?: number }[];
  charms?: { id?: string; pos: Vec3; available?: boolean; respawn_ticks?: number }[];
  lanterns?: { id: string; pos?: Vec3; lit?: boolean; deposited?: number; fuel?: number; ever_lit?: boolean }[];
  time_left_s?: number;
}

const PLAYER_TICKS = ["invuln_ticks", "dash_cd_ticks", "pulse_cd_ticks", "charm_ticks"] as const;
const FLAGS = ["random_motes", "random_shades", "random_drifters", "wind_enabled"] as const;

/** Validate a parsed scenario JSON document for `night`. Throws MalformedError (exit code 2). */
export function parseScenario(raw: unknown, night = 1): Scenario {
  if (!isObj(raw)) throw new MalformedError("scenario: expected a JSON object");
  const sc: Scenario = {};
  if ("player" in raw) {
    const p = raw.player;
    if (!isObj(p)) throw new MalformedError("scenario: 'player' must be an object");
    sc.player = {};
    if ("pos" in p) sc.player.pos = vec3(p.pos, "player.pos");
    if ("carried" in p) sc.player.carried = nonNegInt(p.carried, "player.carried");
    if ("flames" in p) sc.player.flames = nonNegInt(p.flames, "player.flames");
    for (const k of PLAYER_TICKS) if (k in p) sc.player[k] = nonNegInt(p[k], `player.${k}`);
    if ("successful_lights" in p) sc.player.successful_lights = nonNegInt(p.successful_lights, "player.successful_lights");
  }
  for (const k of FLAGS) {
    if (k in raw) {
      if (typeof raw[k] !== "boolean") throw new MalformedError(`scenario: '${k}' must be boolean`);
      sc[k] = raw[k] as boolean;
    }
  }
  if ("motes" in raw) sc.motes = arr(raw.motes, "motes").map((m, i) => vec3(m, `motes[${i}]`));
  const lanternIds = new Set(Array.from({ length: nightMap(night).lanterns.length }, (_, i) => `L${i + 1}`));
  if ("shades" in raw) {
    sc.shades = arr(raw.shades, "shades").map((s, i) => {
      const w = `shades[${i}]`;
      if (!isObj(s)) throw new MalformedError(`scenario: ${w} must be an object`);
      const out: NonNullable<Scenario["shades"]>[number] = { pos: vec3(s.pos, `${w}.pos`) };
      if ("id" in s) out.id = str(s.id, `${w}.id`);
      if ("state" in s) out.state = oneOf(s.state, SHADE_STATES, `${w}.state`);
      if ("state_ticks_left" in s) out.state_ticks_left = nonNegInt(s.state_ticks_left, `${w}.state_ticks_left`);
      if ("target_lantern_id" in s && s.target_lantern_id !== null) {
        const t = str(s.target_lantern_id, `${w}.target_lantern_id`);
        if (!lanternIds.has(t)) throw new MalformedError(`scenario: ${w}.target_lantern_id must be one of L1..L${lanternIds.size}`);
        out.target_lantern_id = t;
      }
      return out;
    });
  }
  if ("drifters" in raw) {
    sc.drifters = arr(raw.drifters, "drifters").map((d, i) => {
      const w = `drifters[${i}]`;
      if (!isObj(d)) throw new MalformedError(`scenario: ${w} must be an object`);
      const out: NonNullable<Scenario["drifters"]>[number] = { pos: vec3(d.pos, `${w}.pos`) };
      if ("id" in d) out.id = str(d.id, `${w}.id`);
      if ("state" in d) out.state = oneOf(d.state, DRIFTER_STATES, `${w}.state`);
      if ("stolen" in d) out.stolen = nonNegInt(d.stolen, `${w}.stolen`);
      if ("state_ticks_left" in d) out.state_ticks_left = nonNegInt(d.state_ticks_left, `${w}.state_ticks_left`);
      return out;
    });
  }
  if ("charms" in raw) {
    sc.charms = arr(raw.charms, "charms").map((c, i) => {
      const w = `charms[${i}]`;
      if (!isObj(c)) throw new MalformedError(`scenario: ${w} must be an object`);
      const out: NonNullable<Scenario["charms"]>[number] = { pos: vec3(c.pos, `${w}.pos`) };
      if ("id" in c) out.id = str(c.id, `${w}.id`);
      if ("available" in c) {
        if (typeof c.available !== "boolean") throw new MalformedError(`scenario: ${w}.available must be boolean`);
        out.available = c.available;
      }
      if ("respawn_ticks" in c) out.respawn_ticks = nonNegInt(c.respawn_ticks, `${w}.respawn_ticks`);
      return out;
    });
  }
  if ("lanterns" in raw) {
    const n = lanternIds.size;
    const ids = lanternIds;
    sc.lanterns = arr(raw.lanterns, "lanterns").map((l, i) => {
      if (!isObj(l) || typeof l.id !== "string" || !ids.has(l.id)) {
        throw new MalformedError(`scenario: lanterns[${i}] needs an id in L1..L${n}`);
      }
      const out: NonNullable<Scenario["lanterns"]>[number] = { id: l.id };
      if ("pos" in l) out.pos = vec3(l.pos, `lanterns[${i}].pos`);
      if ("lit" in l) {
        if (typeof l.lit !== "boolean") throw new MalformedError(`scenario: lanterns[${i}].lit must be boolean`);
        out.lit = l.lit;
      }
      if ("deposited" in l) out.deposited = nonNegInt(l.deposited, `lanterns[${i}].deposited`);
      if ("fuel" in l) {
        const f = l.fuel;
        if (typeof f !== "number" || !Number.isFinite(f) || f < 0 || f > 100) {
          throw new MalformedError(`scenario: lanterns[${i}].fuel must be a number in [0, 100]`);
        }
        out.fuel = f;
      }
      if ("ever_lit" in l) {
        if (typeof l.ever_lit !== "boolean") throw new MalformedError(`scenario: lanterns[${i}].ever_lit must be boolean`);
        out.ever_lit = l.ever_lit;
      }
      return out;
    });
  }
  if ("time_left_s" in raw) {
    const t = raw.time_left_s;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) {
      throw new MalformedError("scenario: 'time_left_s' must be a number >= 0");
    }
    sc.time_left_s = t;
  }
  return sc;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new MalformedError(`scenario: '${where}' must be an array`);
  return v;
}

function str(v: unknown, where: string): string {
  if (typeof v !== "string") throw new MalformedError(`scenario: '${where}' must be a string`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], where: string): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new MalformedError(`scenario: '${where}' must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

function vec3(v: unknown, where: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => typeof n === "number" && Number.isFinite(n))) {
    throw new MalformedError(`scenario: '${where}' must be [x, y, z]`);
  }
  return [v[0], v[1], v[2]] as Vec3;
}

function nonNegInt(v: unknown, where: string): number {
  if (!Number.isInteger(v) || (v as number) < 0) throw new MalformedError(`scenario: '${where}' must be an integer >= 0`);
  return v as number;
}
