import { InputTimeline, type InputFrame } from "./inputs.js";
import type { Scenario } from "./scenario.js";
import { snapshot } from "./snapshot.js";
import { step } from "./step.js";
import { createWorld } from "./world.js";

export interface RunOptions {
  seed: number;
  scenario?: Scenario;
  inputs?: InputFrame[];
  ticks: number;
  snapshotEvery: number;
}

/**
 * Contract tick model: snapshot 0 after setup, before input. Step k reads input of tick k
 * and produces state k+1; its events are tagged tick k+1. Stops after `ticks` steps or game end.
 */
export function runHeadless(o: RunOptions): string[] {
  const w = createWorld(o.seed, o.scenario);
  const timeline = new InputTimeline(o.inputs ?? []);
  const lines: string[] = [JSON.stringify(snapshot(w))];

  for (let k = 0; k < o.ticks && w.state === "playing"; k++) {
    const events = step(w, timeline.at(k));
    for (const e of events) lines.push(JSON.stringify({ type: "event", tick: k + 1, name: e.name, data: e.data }));
    if ((k + 1) % o.snapshotEvery === 0) lines.push(JSON.stringify(snapshot(w)));
  }

  lines.push(JSON.stringify({ type: "end", ticks: w.steps, state: w.state, score: w.score }));
  return lines;
}
