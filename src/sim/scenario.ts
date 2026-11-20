import { MalformedError } from "./inputs.js";
import type { Vec3 } from "./types.js";

export interface Scenario {
  player?: { pos?: Vec3; carried?: number; flames?: number };
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: Vec3[];
  shades?: { id?: string; pos: Vec3 }[];
  lanterns?: { id: string; pos?: Vec3; lit?: boolean; deposited?: number }[];
  time_left_s?: number;
}

const LANTERN_IDS = new Set(["L1", "L2", "L3", "L4", "L5"]);

/** Validate a parsed scenario JSON document. Throws MalformedError (exit code 2). */
export function parseScenario(raw: unknown): Scenario {
  if (!isObj(raw)) throw new MalformedError("scenario: expected a JSON object");
  const sc: Scenario = {};
  if ("player" in raw) {
    const p = raw.player;
    if (!isObj(p)) throw new MalformedError("scenario: 'player' must be an object");
    sc.player = {};
    if ("pos" in p) sc.player.pos = vec3(p.pos, "player.pos");
    if ("carried" in p) sc.player.carried = nonNegInt(p.carried, "player.carried");
    if ("flames" in p) sc.player.flames = nonNegInt(p.flames, "player.flames");
  }
  for (const k of ["random_motes", "random_shades"] as const) {
    if (k in raw) {
      if (typeof raw[k] !== "boolean") throw new MalformedError(`scenario: '${k}' must be boolean`);
      sc[k] = raw[k] as boolean;
    }
  }
  if ("motes" in raw) {
    if (!Array.isArray(raw.motes)) throw new MalformedError("scenario: 'motes' must be an array");
    sc.motes = raw.motes.map((m, i) => vec3(m, `motes[${i}]`));
  }
  if ("shades" in raw) {
    if (!Array.isArray(raw.shades)) throw new MalformedError("scenario: 'shades' must be an array");
    sc.shades = raw.shades.map((s, i) => {
      if (!isObj(s)) throw new MalformedError(`scenario: shades[${i}] must be an object`);
      if ("id" in s && typeof s.id !== "string") throw new MalformedError(`scenario: shades[${i}].id must be a string`);
      return { ...(typeof s.id === "string" ? { id: s.id } : {}), pos: vec3(s.pos, `shades[${i}].pos`) };
    });
  }
  if ("lanterns" in raw) {
    if (!Array.isArray(raw.lanterns)) throw new MalformedError("scenario: 'lanterns' must be an array");
    sc.lanterns = raw.lanterns.map((l, i) => {
      if (!isObj(l) || typeof l.id !== "string" || !LANTERN_IDS.has(l.id)) {
        throw new MalformedError(`scenario: lanterns[${i}] needs an id in L1..L5`);
      }
      const out: NonNullable<Scenario["lanterns"]>[number] = { id: l.id };
      if ("pos" in l) out.pos = vec3(l.pos, `lanterns[${i}].pos`);
      if ("lit" in l) {
        if (typeof l.lit !== "boolean") throw new MalformedError(`scenario: lanterns[${i}].lit must be boolean`);
        out.lit = l.lit;
      }
      if ("deposited" in l) out.deposited = nonNegInt(l.deposited, `lanterns[${i}].deposited`);
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
