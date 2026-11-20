// All sound is synthesised with WebAudio (no audio files, so no licensing questions).
// Night music: a slow pad drone plus sparse pentatonic plucks. SFX: short envelopes on oscillators / noise.
export type Sfx =
  | "pick"
  | "light"
  | "pulse"
  | "hit"
  | "jump"
  | "dash"
  | "win"
  | "lose"
  | "shade"
  | "tick"
  | "wind"
  | "charm"
  | "steal"
  | "deposit"
  | "click";

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private volume: number;

  constructor(volume: number) {
    this.volume = volume;
  }

  /** Browsers only allow audio after a user gesture: call from a key / click handler. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.35;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  startMusic(night: number): void {
    this.stopMusic();
    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out) return;
    // Drone: two detuned low triangles through a slow low-pass.
    const root = [110, 98, 87.31][night - 1] ?? 110;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.18, ctx.currentTime, 1.5);
    lp.connect(g).connect(out);
    const oscs = [root, root * 1.5, root * 2.003].map((f) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(lp);
      o.start();
      return o;
    });
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    let step = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      step++;
      if (step % 3 === 0 || Math.random() < 0.35) return; // sparse, never a loop you can count
      const semis = scale[Math.floor(Math.random() * scale.length)]!;
      this.tone(root * 4 * Math.pow(2, semis / 12), 1.6, "sine", 0.05, out);
    }, 700);
    this.stopDrone = () => {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      for (const o of oscs) o.stop(ctx.currentTime + 2);
    };
  }

  private stopDrone: (() => void) | null = null;

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.stopDrone?.();
    this.stopDrone = null;
  }

  play(s: Sfx): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    switch (s) {
      case "pick":
        this.tone(1320, 0.12, "sine", 0.25);
        this.tone(1760, 0.1, "sine", 0.15, undefined, 0.04);
        break;
      case "deposit":
        this.tone(660, 0.2, "triangle", 0.2);
        break;
      case "light":
        for (const [i, f] of [523.25, 659.25, 783.99, 1046.5].entries()) this.tone(f, 1.2, "triangle", 0.18, undefined, i * 0.07);
        break;
      case "pulse":
        this.sweep(300, 1200, 0.35, "sawtooth", 0.12);
        this.noiseBurst(0.3, 2500, 0.2);
        break;
      case "hit":
        this.sweep(180, 50, 0.35, "square", 0.25);
        this.noiseBurst(0.25, 600, 0.35);
        break;
      case "jump":
        this.sweep(300, 600, 0.12, "sine", 0.18);
        break;
      case "dash":
        this.noiseBurst(0.18, 1800, 0.3);
        break;
      case "win":
        for (const [i, f] of [523.25, 659.25, 783.99, 1046.5, 1318.5].entries()) this.tone(f, 0.6, "triangle", 0.2, undefined, i * 0.12);
        break;
      case "lose":
        for (const [i, f] of [392, 349.23, 311.13, 261.63].entries()) this.tone(f, 0.7, "sine", 0.22, undefined, i * 0.22);
        break;
      case "shade":
        this.sweep(90, 55, 0.8, "sawtooth", 0.12);
        break;
      case "tick":
        this.tone(1000, 0.06, "square", 0.12);
        break;
      case "wind":
        this.noiseBurst(2.0, 700, 0.25, 0.6);
        break;
      case "charm":
        for (const [i, f] of [880, 1108.7, 1318.5].entries()) this.tone(f, 0.3, "sine", 0.18, undefined, i * 0.05);
        break;
      case "steal":
        this.sweep(900, 300, 0.3, "triangle", 0.2);
        break;
      case "click":
        this.tone(700, 0.05, "sine", 0.12);
        break;
    }
    void t;
  }

  private env(start: number, dur: number, peak: number, attack = 0.01): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    return g;
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, out?: AudioNode, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.env(t, dur, peak);
    o.connect(g).connect(out ?? this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private sweep(f0: number, f1: number, dur: number, type: OscillatorType, peak: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, dur, peak);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseBurst(dur: number, cutoff: number, peak: number, attack = 0.01): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = cutoff;
    f.Q.value = 0.8;
    const g = this.env(t, dur, peak, attack);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
