// Three.js view of a World. Reads sim state only; never changes it.
// Terrain is built from the same shapes as src/sim/maps.ts groundAt() (islands, bridge, tiers, ramps, tower).
import * as THREE from "three";
import type { NightMap } from "../sim/maps.js";
import { TUNING, WORLD } from "../sim/tuning.js";
import type { Drifter, Shade, World } from "../sim/types.js";
import { CB_PALETTE, PALETTE, ambientFor } from "./palette.js";

const std = (color: number, emissive = 0x000000, emissiveIntensity = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity, roughness: 0.85, ...extra });
const ROCK = 0x3a3044;

/** Small leaf sprite for the wind particles. */
function leafTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.translate(16, 16);
  g.rotate(-0.6);
  g.fillStyle = "#b9d77a";
  g.beginPath();
  g.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#5f7d32";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(-12, 0);
  g.lineTo(12, 0);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft round glow texture for halos (drawn once). */
function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface LanternView {
  group: THREE.Group;
  lamp: THREE.Mesh;
  core: THREE.Mesh;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  halo: THREE.Sprite;
  litAt: number;
  /** Ticket-03: fuel bar above a lit lantern (background + fill growing from the left). */
  fuelBg: THREE.Sprite;
  fuelFill: THREE.Sprite;
  /** Ticket-03 §6: an unlit lantern is squashed 20% and its paper shows tears (readable without colour). */
  tears: THREE.Group;
}

export class NightView {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly ambient: THREE.HemisphereLight;
  private readonly glow = glowTexture();
  private readonly lanterns = new Map<string, LanternView>();
  private readonly motes = new Map<string, THREE.Group>();
  private readonly shades = new Map<string, THREE.Group>();
  private readonly drifters = new Map<string, { group: THREE.Group; ribbon: THREE.Mesh; last: THREE.Vector3; loot: THREE.Mesh[] }>();
  private readonly charms = new Map<string, THREE.Group>();
  private readonly player: THREE.Group;
  private readonly lanternPivot: THREE.Group;
  private readonly pulseRing: THREE.Mesh;
  private readonly leaves: THREE.Points;
  private readonly leafPos: Float32Array;
  private readonly dashTrail: THREE.Mesh[] = [];
  private pulseAt = -10;
  private colorblind = false;
  /** Ticket-04 §4 "Giảm chuyển động": no camera shake, no light flashes, no blinking player. */
  private reduceMotion = false;
  private shakeAt = -10;
  private playerMats: THREE.Material[] = [];
  private dashAt = -10;
  private lastPlayer = new THREE.Vector3();

  // shared assets
  private readonly moteCoreGeo = new THREE.SphereGeometry(0.13, 10, 8);
  private readonly moteCoreMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteCore });
  private readonly haloMat: THREE.SpriteMaterial;
  private readonly shadeGeo = new THREE.SphereGeometry(0.62, 18, 14);
  private readonly shadeTailGeo = new THREE.ConeGeometry(0.45, 0.9, 14);
  private readonly shadeEyeGeo = new THREE.SphereGeometry(0.08, 8, 6);

  constructor(readonly map: NightMap, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 400);
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 28, 120);
    this.ambient = new THREE.HemisphereLight(0x8a96d8, 0x1b2350, ambientFor(0, 1));
    const moon = new THREE.DirectionalLight(0x9aa8ff, 0.35);
    moon.position.set(-30, 60, -20);
    this.scene.add(this.ambient, moon);
    this.haloMat = new THREE.SpriteMaterial({
      map: this.glow,
      color: PALETTE.moteHalo,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.buildSky();
    this.buildTerrain();
    for (const [i, pos] of map.lanterns.entries()) this.buildLantern(`L${i + 1}`, pos);

    ({ group: this.player, pivot: this.lanternPivot } = this.buildPlayer());
    this.scene.add(this.player);
    this.player.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) this.playerMats.push(m);
    });

    this.pulseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 64),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.pulseRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.pulseRing);

    for (let i = 0; i < 4; i++) {
      const ghost = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 0.6, 4, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.mayTunic, transparent: true, opacity: 0, depthWrite: false }),
      );
      this.dashTrail.push(ghost);
      this.scene.add(ghost);
    }

    // Wind leaves (night 3): particles around the player, shown while a gust is announced or blowing.
    const N = 140;
    this.leafPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.leafPos[i * 3] = (Math.random() - 0.5) * 36;
      this.leafPos[i * 3 + 1] = Math.random() * 5;
      this.leafPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(this.leafPos, 3));
    this.leaves = new THREE.Points(
      lg,
      new THREE.PointsMaterial({ map: leafTexture(), size: 0.35, transparent: true, alphaTest: 0.3, opacity: 0, depthWrite: false }),
    );
    this.leaves.frustumCulled = false;
    this.scene.add(this.leaves);
  }

  // ---------- static world ----------
  private buildSky() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.45;
      const r = 300;
      pos[i * 3] = this.map.bounds.cx + r * Math.cos(th) * Math.cos(ph);
      pos[i * 3 + 1] = 20 + r * Math.sin(ph);
      pos[i * 3 + 2] = r * Math.sin(th) * Math.cos(ph);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.1, sizeAttenuation: false, fog: false }));
    this.scene.add(stars);

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), std(PALETTE.cloudSea, PALETTE.cloudSea, 0.25));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(this.map.bounds.cx, -9, 0);
    this.scene.add(sea);
    // A few cloud puffs on the sea for depth.
    const puffMat = std(0x2a5468, 0x12384a, 0.4, { transparent: true, opacity: 0.85 });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = this.map.bounds.r + 8 + Math.random() * 70;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(4 + Math.random() * 6, 12, 8), puffMat);
      puff.scale.y = 0.35;
      puff.position.set(this.map.bounds.cx + r * Math.cos(a), -8.5 + Math.random(), this.map.bounds.cz + r * Math.sin(a));
      this.scene.add(puff);
    }
  }

  /** Floating island disc: grass top at y = top, sand edge, rocky underside. */
  private island(r: number, cx: number, cz: number, top = 0) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 96), [std(PALETTE.sand), std(PALETTE.grass), std(ROCK)]);
    disc.position.y = top - 0.3;
    const under = new THREE.Mesh(new THREE.ConeGeometry(r * 0.98, r * 0.55, 48, 1, true), std(ROCK, 0x120a1a, 0.3, { side: THREE.DoubleSide }));
    under.rotation.x = Math.PI;
    under.position.y = top - 0.6 - (r * 0.55) / 2;
    // Sand beach ring just inside the edge.
    const beach = new THREE.Mesh(new THREE.RingGeometry(r - 1.6, r, 96), std(PALETTE.sand));
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = top + 0.01;
    g.add(disc, under, beach);
    g.position.set(cx, 0, cz);
    this.scene.add(g);
  }

  private buildTerrain() {
    const m = this.map;
    if (m.night === 1) this.island(40, 0, 0);
    if (m.night === 2) {
      this.island(28, 0, 0);
      this.island(28, 70, 0);
      // Bamboo bridge x ∈ [26, 44], z ∈ [−2, 2], no railing.
      const deck = new THREE.Mesh(new THREE.BoxGeometry(18, 0.25, 4), std(PALETTE.wood));
      deck.position.set(35, -0.125, 0);
      this.scene.add(deck);
      const slat = new THREE.BoxGeometry(0.12, 0.27, 4.02);
      const slatMat = std(0x4f3420);
      for (let x = 26.4; x < 44; x += 0.9) {
        const s = new THREE.Mesh(slat, slatMat);
        s.position.set(x, -0.12, 0);
        this.scene.add(s);
      }
      const pole = new THREE.CylinderGeometry(0.12, 0.12, 4.02, 8);
      for (const z of [-1.9, 1.9]) {
        const p = new THREE.Mesh(pole, std(0x8a7a3a));
        p.rotation.z = Math.PI / 2;
        p.scale.y = 4.5;
        p.position.set(35, -0.05, z);
        this.scene.add(p);
      }
    }
    if (m.night === 3) {
      this.island(45, 0, 0);
      // Tier 1: half annulus 12–24 m on z > 0, Y = 3. Shape (sx, sy) → world (sx, depth, −sy).
      const shape = new THREE.Shape();
      const seg = 48;
      for (let i = 0; i <= seg; i++) {
        const th = (Math.PI * i) / seg;
        const [x, y] = [24 * Math.cos(th), -24 * Math.sin(th)];
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      for (let i = seg; i >= 0; i--) {
        const th = (Math.PI * i) / seg;
        shape.lineTo(12 * Math.cos(th), -12 * Math.sin(th));
      }
      const tier1 = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false }), [std(PALETTE.grass), std(0x6d6070)]);
      tier1.rotation.x = -Math.PI / 2;
      this.scene.add(tier1);
      // Tier 2: disc r 8, Y = 6, and the 8 m bell tower (r 2) on top.
      const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 64), [std(0x6d6070), std(PALETTE.grass), std(ROCK)]);
      tier2.position.y = 3;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.1, 8, 24), std(0x8c7b6a));
      tower.position.y = 10;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 24), std(0x7a2a24));
      roof.position.y = 15.2;
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6), std(PALETTE.gold, PALETTE.gold, 0.25, { metalness: 0.6, side: THREE.DoubleSide }));
      bell.position.y = 14.4;
      this.scene.add(tier2, tower, roof, bell);
      // Ramps at 30° and 150°: r = 30 (Y 0) up to r = 24 (Y 3), 3 m wide.
      const tri = new THREE.Shape();
      tri.moveTo(24, 0);
      tri.lineTo(30, 0);
      tri.lineTo(24, 3);
      tri.lineTo(24, 0);
      for (const deg of [30, 150]) {
        const geo = new THREE.ExtrudeGeometry(tri, { depth: 3, bevelEnabled: false });
        geo.translate(0, 0, -1.5);
        const ramp = new THREE.Mesh(geo, [std(PALETTE.sand), std(PALETTE.wood)]);
        ramp.rotation.y = -(deg * Math.PI) / 180;
        this.scene.add(ramp);
      }
    }
    // Bounce pads.
    for (const pad of m.pads) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(pad.radius, pad.radius * 1.1, 0.16, 32), std(PALETTE.wood, PALETTE.gold, 0.25));
      base.position.y = 0.08;
      const top = new THREE.Mesh(new THREE.CircleGeometry(pad.radius * 0.8, 32), new THREE.MeshBasicMaterial({ color: PALETTE.gold }));
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.17;
      // Arrow pointing where the pad throws you.
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 3), new THREE.MeshBasicMaterial({ color: PALETTE.red }));
      arrow.rotation.x = Math.PI / 2;
      const yaw = Math.atan2(pad.vh[0], pad.vh[1]);
      const holder = new THREE.Group();
      holder.add(arrow);
      arrow.position.set(0, 0.25, 0.2);
      holder.rotation.y = yaw;
      g.add(base, top, holder);
      g.position.set(...pad.pos);
      g.userData.pulse = top;
      this.scene.add(g);
    }
  }

  private buildLantern(id: string, pos: readonly number[]) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3, 8), std(PALETTE.wood));
    pole.position.y = 1.5;
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.9, 16),
      std(PALETTE.lanternOff, PALETTE.lanternLit, 0.05, { transparent: true, opacity: 0.92 }),
    );
    lamp.position.y = 3.5;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore }));
    core.position.y = 3.5;
    core.visible = false;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.38, 16), std(0x4a2a1a));
    roof.position.y = 4.14;
    const light = new THREE.PointLight(PALETTE.lanternLit, 0, 22, 1.6);
    light.position.y = 3.5;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: PALETTE.lanternLit, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    halo.position.y = 3.5;
    halo.scale.setScalar(4.5);
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.2, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.03;
    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(TUNING.safe_radius - 0.15, TUNING.safe_radius, 72),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.05;
    safeRing.visible = false;
    const bar = (color: number, opacity: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity, depthWrite: false }));
      s.center.set(0, 0.5); // grows from the left edge
      s.position.set(-0.8, 4.75, 0);
      s.scale.set(1.6, 0.16, 1);
      return s;
    };
    const fuelBg = bar(0x0e1430, 0.75);
    const fuelFill = bar(PALETTE.lanternLit, 1);
    fuelFill.renderOrder = 1;
    const tears = new THREE.Group();
    const tearMat = new THREE.MeshBasicMaterial({ color: 0x0b0d16, side: THREE.DoubleSide });
    for (const [a, y, h] of [[0.4, 3.62, 0.5], [2.3, 3.4, 0.38], [4.2, 3.55, 0.45]] as const) {
      const tear = new THREE.Mesh(new THREE.PlaneGeometry(0.09, h), tearMat);
      tear.position.set(Math.cos(a) * 0.56, y, Math.sin(a) * 0.56);
      tear.rotation.set(0, -a + Math.PI / 2, 0.35);
      tears.add(tear);
    }
    group.add(pole, lamp, core, roof, light, halo, marker, safeRing, fuelBg, fuelFill, tears);
    group.position.set(pos[0]!, pos[1]!, pos[2]!);
    this.scene.add(group);
    this.lanterns.set(id, { group, lamp, core, light, safeRing, halo, litAt: -1, fuelBg, fuelFill, tears });
  }

  private buildPlayer(): { group: THREE.Group; pivot: THREE.Group } {
    const group = new THREE.Group();
    // Light tunic with a little self-glow so it reads as #E8E2D0 even at the darkest ambient (0.15).
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 12), std(PALETTE.mayTunic, PALETTE.mayTunic, 0.3));
    body.position.y = 0.6;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 20), std(PALETTE.red, PALETTE.red, 0.35));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.08;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.04), std(PALETTE.red, PALETTE.red, 0.35));
    tail.position.set(0.1, 0.88, -0.25);
    tail.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), std(0xf2c9a0, 0x6b4a30, 0.35));
    head.position.y = 1.3;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.42, 32), std(0xf0dc9c, 0x8a7238, 0.55));
    hat.position.y = 1.64;
    const pivot = new THREE.Group();
    pivot.position.set(-0.68, 1.52, 0.05);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0x3a2a1a }));
    cord.position.y = -0.15;
    const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12), std(0xff8a3a, PALETTE.lanternLit, 2.2));
    paper.position.y = -0.41;
    const light = new THREE.PointLight(PALETTE.lanternLit, 9, 11, 1.6);
    light.position.y = -0.41;
    pivot.add(cord, paper, light);
    group.add(body, scarf, tail, head, hat, pivot);
    return { group, pivot };
  }

  private makeMote(): THREE.Group {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.moteCoreGeo, this.moteCoreMat);
    const halo = new THREE.Sprite(this.haloMat);
    halo.scale.setScalar(1.1);
    g.add(core, halo);
    return g;
  }

  private makeShade(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.shadeGeo, std(PALETTE.shadeBody, PALETTE.shadeRim, 0.08, { transparent: true }));
    const rim = new THREE.Mesh(this.shadeGeo, new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim, side: THREE.BackSide, transparent: true }));
    rim.scale.setScalar(1.12);
    const tail = new THREE.Mesh(this.shadeTailGeo, std(PALETTE.shadeBody, PALETTE.shadeRim, 0.15, { transparent: true }));
    tail.rotation.x = Math.PI;
    tail.position.y = -0.7;
    const eyeMat = new THREE.MeshBasicMaterial({ color: this.colorblind ? CB_PALETTE.shadeRim : 0xd9c2ff });
    const e1 = new THREE.Mesh(this.shadeEyeGeo, eyeMat);
    const e2 = e1.clone();
    e1.position.set(0.2, 0.12, 0.55);
    e2.position.set(-0.2, 0.12, 0.55);
    g.add(body, rim, tail, e1, e2);
    g.userData = { body, rim, tail, eyeMat };
    return g;
  }

  /** Ticket-03 §6: shade rim and eyes #7A3CFF -> #00B3FF. */
  setColorblind(on: boolean) {
    this.colorblind = on;
  }

  setReduceMotion(on: boolean) {
    this.reduceMotion = on;
  }

  private makeDrifter() {
    const group = new THREE.Group();
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.38, 20, 1),
      std(PALETTE.drifter, PALETTE.drifter, 0.35, { side: THREE.DoubleSide, transparent: true, opacity: 0.88 }),
    );
    group.add(ribbon);
    const loot: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(this.moteCoreGeo, this.moteCoreMat);
      m.visible = false;
      group.add(m);
      loot.push(m);
    }
    return { group, ribbon, last: new THREE.Vector3(), loot };
  }

  private makeCharm(): THREE.Group {
    const g = new THREE.Group();
    const border = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshBasicMaterial({ color: PALETTE.gold, side: THREE.DoubleSide }));
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.78), new THREE.MeshBasicMaterial({ color: PALETTE.red, side: THREE.DoubleSide }));
    paper.position.z = 0.01;
    const paper2 = paper.clone();
    paper2.position.z = -0.01;
    const glyph = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.15, 16), new THREE.MeshBasicMaterial({ color: PALETTE.gold, side: THREE.DoubleSide }));
    glyph.position.z = 0.02;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: PALETTE.red, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(2);
    g.add(border, paper, paper2, glyph, halo);
    return g;
  }

  private sync<T extends { id: string }, V>(items: readonly T[], views: Map<string, V>, make: () => V, obj: (v: V) => THREE.Object3D, update: (v: V, it: T) => void) {
    const alive = new Set<string>();
    for (const it of items) {
      alive.add(it.id);
      let v = views.get(it.id);
      if (!v) {
        v = make();
        views.set(it.id, v);
        this.scene.add(obj(v));
      }
      update(v, it);
    }
    for (const [id, v] of views) {
      if (!alive.has(id)) {
        this.scene.remove(obj(v));
        views.delete(id);
      }
    }
  }

  // ---------- effects triggered by sim events ----------
  pulseFx(t: number) {
    this.pulseAt = t;
  }
  dashFx(t: number) {
    this.dashAt = t;
  }
  /** Short camera shake when Mây is hit or falls (off with reduced motion). */
  shakeFx(t: number) {
    this.shakeAt = t;
  }
  lanternLitFx(id: string, t: number) {
    const v = this.lanterns.get(id);
    if (v) v.litAt = t;
  }

  /** Update every view from the world. `t` is wall-clock seconds (animation only). */
  update(w: World, camYawDeg: number, t: number) {
    const p = w.player;
    // Player
    this.player.position.set(...p.pos);
    this.player.rotation.y = Math.atan2(p.facing[0], p.facing[1]);
    // Invulnerable: blinks at 12 Hz, or (reduced motion) is drawn half transparent instead.
    const ghost = p.invulnTicks > 0 && this.reduceMotion;
    this.player.visible = p.respawnTicks === 0 && (p.invulnTicks === 0 || this.reduceMotion || Math.floor(t * 12) % 2 === 0);
    for (const m of this.playerMats) {
      m.transparent = ghost || m.userData.transparent === true;
      m.opacity = ghost ? 0.45 : 1;
    }
    const moved = this.lastPlayer.distanceTo(this.player.position);
    this.lastPlayer.copy(this.player.position);
    const swing = Math.min(1, moved / 0.1);
    this.lanternPivot.rotation.x = (0.05 + 0.3 * swing) * Math.sin(t * 7);
    this.lanternPivot.rotation.z = 0.04 * Math.sin(t * 2.3);

    // Dash afterimages for ~0.3 s.
    const da = (t - this.dashAt) / 0.3;
    for (const [i, g] of this.dashTrail.entries()) {
      const m = g.material as THREE.MeshBasicMaterial;
      if (da < 1) {
        const back = (i + 1) * 0.55;
        g.position.set(p.pos[0] - p.facing[0] * back, p.pos[1] + 0.6, p.pos[2] - p.facing[1] * back);
        m.opacity = 0.35 * (1 - da) * (1 - i / 4);
      } else m.opacity = 0;
    }

    // Camera: third person behind the camera yaw (contract §C: yaw 0 looks along +Z).
    const yaw = (camYawDeg * Math.PI) / 180;
    const camY = Math.max(p.pos[1], -6);
    this.camera.position.set(p.pos[0] - Math.sin(yaw) * 8.5, camY + 3.6, p.pos[2] - Math.cos(yaw) * 8.5);
    this.camera.lookAt(p.pos[0], camY + 1.3, p.pos[2]);
    const sh = (t - this.shakeAt) / 0.35;
    if (sh < 1 && !this.reduceMotion) {
      const a = 0.22 * (1 - sh);
      this.camera.position.x += a * Math.sin(t * 91);
      this.camera.position.y += a * Math.sin(t * 77 + 1);
      this.camera.position.z += a * Math.sin(t * 83 + 2);
    }

    // Lanterns + ambient light by progress.
    let lit = 0;
    for (const l of w.lanterns) {
      const v = this.lanterns.get(l.id);
      if (!v) continue;
      v.group.position.set(...l.pos);
      const mat = v.lamp.material as THREE.MeshStandardMaterial;
      const cost = l.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
      const fill = Math.min(1, l.deposited / cost);
      const fuel = l.fuel / WORLD.fuel_units_per_fuel;
      // Ticket-03 §1 "Hiển thị": fuel < 30 -> lantern and fuel bar blink slowly (1 Hz).
      const low = l.lit && fuel < TUNING.low_fuel_threshold;
      const dim = low && t % 1 >= 0.5;
      v.lamp.scale.y = l.lit ? 1 : 0.8; // unlit: squashed 20%
      v.tears.visible = !l.lit;
      v.fuelBg.visible = v.fuelFill.visible = l.lit;
      if (l.lit) {
        v.fuelFill.scale.x = 1.6 * Math.max(0, fuel / TUNING.fuel_max);
        (v.fuelFill.material as THREE.SpriteMaterial).color.setHex(low ? (this.colorblind ? CB_PALETTE.danger : PALETTE.danger) : PALETTE.lanternLit);
        (v.fuelFill.material as THREE.SpriteMaterial).opacity = dim ? 0.25 : 1;
      }
      if (l.lit) {
        lit++;
        mat.color.setHex(PALETTE.lanternLit);
        mat.emissive.setHex(PALETTE.lanternLit);
        mat.emissiveIntensity = (1.6 + 0.2 * Math.sin(t * 3)) * (dim ? 0.25 : 1);
        const burst = v.litAt >= 0 && !this.reduceMotion ? Math.max(0, 1 - (t - v.litAt) / 1.2) : 0; // light flash
        v.light.intensity = (45 + 120 * burst) * (dim ? 0.3 : 1);
        (v.halo.material as THREE.SpriteMaterial).opacity = (0.75 + burst * 0.25) * (dim ? 0.3 : 1);
        v.halo.scale.setScalar(4.5 + burst * 6);
      } else {
        mat.color.setHex(PALETTE.lanternOff);
        mat.emissive.setHex(PALETTE.lanternLit);
        mat.emissiveIntensity = 0.05 + 0.6 * fill;
        v.light.intensity = 6 * fill;
        (v.halo.material as THREE.SpriteMaterial).opacity = 0.15 * fill;
      }
      v.core.visible = l.lit && !dim;
      v.safeRing.visible = l.lit && fuel >= TUNING.low_fuel_threshold; // below 30 there is no safe zone
      (v.safeRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(t * 2);
    }
    this.ambient.intensity = ambientFor(lit, w.lanterns.length);
    const k = lit / Math.max(1, w.lanterns.length);
    (this.scene.background as THREE.Color).setHex(PALETTE.sky).lerp(new THREE.Color(0x2a2850), k * 0.6);

    // Motes (dropped ones blink in their last 2 s).
    this.sync(w.motes, this.motes, () => this.makeMote(), (g) => g, (g, m) => {
      g.position.set(m.pos[0], m.pos[1] + 0.55 + 0.15 * Math.sin(t * 3 + m.pos[0]), m.pos[2]);
      g.visible = m.ttl === null || m.ttl > 120 || Math.floor(t * 8) % 2 === 0;
    });

    // Shades
    this.sync(w.shades, this.shades, () => this.makeShade(), (g) => g, (g, s: Shade) => {
      const { body, rim, tail, eyeMat } = g.userData as { body: THREE.Mesh; rim: THREE.Mesh; tail: THREE.Mesh; eyeMat: THREE.MeshBasicMaterial };
      const rimHex = this.colorblind ? CB_PALETTE.shadeRim : PALETTE.shadeRim;
      eyeMat.color.setHex(this.colorblind ? CB_PALETTE.shadeRim : 0xd9c2ff);
      const bm = body.material as THREE.MeshStandardMaterial;
      const rm = rim.material as THREE.MeshBasicMaterial;
      const stunned = s.state === "stunned";
      bm.color.setHex(stunned ? PALETTE.shadeStunned : PALETTE.shadeBody);
      rm.color.setHex(stunned ? PALETTE.shadeStunned : rimHex);
      const spawning = s.state === "spawning";
      const grow = spawning ? 1 - s.ticks / 30 : 1;
      const op = spawning ? 0.3 + 0.6 * grow : s.state === "recoil" ? 0.55 + 0.3 * Math.sin(t * 30) : 1;
      bm.opacity = op;
      rm.opacity = stunned ? 0.4 : op;
      (tail.material as THREE.MeshStandardMaterial).opacity = op;
      g.scale.setScalar(Math.max(0.05, grow) * (stunned ? 0.9 + 0.05 * Math.sin(t * 20) : 1));
      g.position.set(s.pos[0], s.pos[1] + 0.12 * Math.sin(t * 2.5 + s.pos[2]), s.pos[2]);
      g.lookAt(p.pos[0], g.position.y, p.pos[2]);
      if (stunned) g.rotation.z = 0.3 * Math.sin(t * 9);
    });

    // Drifters: a grey-blue silk ribbon that waves along its heading.
    this.sync(w.drifters.filter((d) => d.state !== "removed"), this.drifters, () => this.makeDrifter(), (v) => v.group, (v, d: Drifter) => {
      const now = new THREE.Vector3(...d.pos);
      const dir = now.clone().sub(v.last);
      if (dir.lengthSq() > 1e-6) v.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      v.last.copy(now);
      v.group.position.copy(now);
      const pos = v.ribbon.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, 0.35 * Math.sin(x * 2.4 - t * 9) * (x + 1.2) / 2.4);
      }
      pos.needsUpdate = true;
      for (const [i, m] of v.loot.entries()) {
        m.visible = i < d.stolen;
        const a = t * 4 + (i * Math.PI * 2) / 3;
        m.position.set(0.5 * Math.cos(a), 0.3, 0.5 * Math.sin(a));
      }
    });

    // Charms
    this.sync(w.charms, this.charms, () => this.makeCharm(), (g) => g, (g, c) => {
      g.visible = c.available;
      g.position.set(c.pos[0], c.pos[1] + 1 + 0.2 * Math.sin(t * 2), c.pos[2]);
      g.rotation.y = t * 1.5;
    });

    // Pulse ring: expands to the pulse radius in 0.35 s.
    const pa = (t - this.pulseAt) / 0.35;
    const pm = this.pulseRing.material as THREE.MeshBasicMaterial;
    pm.opacity = pa < 1 ? 0.85 * (1 - pa) : 0;
    const rr = Math.max(0.01, TUNING.pulse_radius * Math.min(1, pa));
    this.pulseRing.scale.set(rr, rr, 1);
    this.pulseRing.position.set(p.pos[0], p.pos[1] + 0.8, p.pos[2]);

    // Wind leaves.
    const lm = this.leaves.material as THREE.PointsMaterial;
    const windOn = w.wind.active || w.wind.warning;
    lm.opacity += ((windOn ? 0.9 : 0) - lm.opacity) * 0.08;
    if (lm.opacity > 0.01) {
      const a = (w.wind.dirDeg * Math.PI) / 180;
      const sp = w.wind.active ? 0.35 : 0.12;
      const [dx, dz] = [Math.cos(a) * sp, Math.sin(a) * sp];
      for (let i = 0; i < this.leafPos.length; i += 3) {
        let x = this.leafPos[i]! + dx;
        let z = this.leafPos[i + 2]! + dz;
        if (x > 18) x -= 36;
        if (x < -18) x += 36;
        if (z > 18) z -= 36;
        if (z < -18) z += 36;
        this.leafPos[i] = x;
        this.leafPos[i + 2] = z;
        this.leafPos[i + 1] = ((this.leafPos[i + 1]! + 0.01 * Math.sin(t * 3 + i)) % 5 + 5) % 5;
      }
      this.leaves.geometry.getAttribute("position").needsUpdate = true;
      this.leaves.position.set(p.pos[0], p.pos[1], p.pos[2]);
    }
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.glow.dispose();
  }
}
