import Phaser from 'phaser';
import { GAME_WIDTH, GROUND_Y } from '../../config';
import type { FighterSnapshot, MatchState, ProjectileSnapshot } from '../../core/match/state';
import type { ToScreen } from '../FighterView';
import { FX_DEPTH, finalState, floatText, gather, placer, puff, smooth, type Pt, type SpecialFx } from './kit';

const GOLD = 0xffcf3a;
const BLUE = 0x2f6bff;
const LIGHT = 0x8fc4ff;
const CORE = 0xe8f6ff;
const CREASE = 0x2a4fb8;
/** Local hand height in px at scale 1; the hand's centre is the origin. */
const HAND_H = 120;
/** The drawn hand is a little larger than its hitbox so it reads as giant while staying fair to jump. */
const VISUAL_BOOST = 1.12;
const SHOCK_MS = 750;
const BREAK_PIECES = 16;
const CAPSULE_STEPS = 8;
const GHOSTS = 3;

/** Layers from the outside in: inflation px, colour, alpha. */
const LAYERS = [
  [3.5, GOLD, 1],
  [0, BLUE, 1],
  [-4.5, LIGHT, 0.95],
  [-7.5, CORE, 0.9],
] as const;

/** A rounded bar between two points; the building block of the palm and fingers. */
function capsule(a: Pt, b: Pt, r: number): Pt[] {
  const th = Math.atan2(b.y - a.y, b.x - a.x);
  const pts: Pt[] = [];
  for (let i = 0; i <= CAPSULE_STEPS; i++) {
    const t = th - Math.PI / 2 + (i / CAPSULE_STEPS) * Math.PI;
    pts.push({ x: b.x + Math.cos(t) * r, y: b.y + Math.sin(t) * r });
  }
  for (let i = 0; i <= CAPSULE_STEPS; i++) {
    const t = th + Math.PI / 2 + (i / CAPSULE_STEPS) * Math.PI;
    pts.push({ x: a.x + Math.cos(t) * r, y: a.y + Math.sin(t) * r });
  }
  return pts;
}

/** Open palm facing the viewer, fingers together, thumb out: the silhouette of the party symbol. */
const SHAPE: readonly { a: Pt; b: Pt; r: number }[] = [
  { a: { x: -14, y: 14 }, b: { x: 14, y: 14 }, r: 32 },
  { a: { x: -27, y: -10 }, b: { x: -28, y: -35 }, r: 8 },
  { a: { x: -9, y: -10 }, b: { x: -9, y: -57 }, r: 9 },
  { a: { x: 9, y: -10 }, b: { x: 9, y: -65 }, r: 9 },
  { a: { x: 27, y: -10 }, b: { x: 27, y: -55 }, r: 9 },
  { a: { x: 38, y: 12 }, b: { x: 62, y: -14 }, r: 10 },
];
const CENTRE: Pt = { x: 18, y: -14 };
const CREASES: readonly [Pt, Pt][] = [
  [{ x: -18, y: -8 }, { x: -18, y: -36 }],
  [{ x: 0, y: -8 }, { x: 0, y: -58 }],
  [{ x: 18, y: -8 }, { x: 18, y: -56 }],
];

const recentre = (p: Pt): Pt => ({ x: p.x - CENTRE.x, y: p.y - CENTRE.y });

function handPieces(inflate: number): Pt[][] {
  return SHAPE.map((s) => capsule(recentre(s.a), recentre(s.b), Math.max(1, s.r + inflate)));
}

const easeOut = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

interface Shock {
  x: number;
  y: number;
  dir: 1 | -1;
  blocked: boolean;
  start: number;
}

/** Sonia's Panja Power: High Command. A glowing energy hand is conjured, thrown, and bursts into a palm shockwave. */
export class PanjaFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private tracked: ProjectileSnapshot | null = null;
  private shock: Shock | null = null;
  private lastPhase = '';
  private nextGather = 0;
  private nextSpark = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private fighter: FighterSnapshot,
    private readonly toScreen: ToScreen,
  ) {
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(FX_DEPTH);
    this.g = scene.add.graphics().setDepth(FX_DEPTH);
  }

  update(now: number, state: MatchState): void {
    this.fighter = state.fighters[this.fighter.slot];
    const projectiles = state.projectiles;
    this.glow.clear();
    this.g.clear();
    this.drawCharge(now);

    const live = projectiles.find((p) => p.owner === this.fighter.slot && p.data.fx === 'panja' && !p.dead);
    if (live) {
      this.tracked = live;
      this.drawFlight(live, now);
    } else if (this.tracked) {
      this.resolveEnd(finalState(this.tracked, state), now);
      this.tracked = null;
    }
    if (this.shock) this.drawShock(this.shock, now);
  }

  private anchor(): { x: number; y: number } | null {
    const f = this.fighter;
    const s = f.currentSpecial;
    if (s?.type !== 'projectile') return null;
    return { x: f.x + f.facing * s.spawnX, y: GROUND_Y - s.y + s.height / 2 };
  }

  private drawCharge(now: number): void {
    const f = this.fighter;
    const s = f.currentSpecial;
    const phase = f.action === 'special' && s?.type === 'projectile' && s.fx === 'panja' ? f.phase : '';
    const at = phase === 'startup' ? this.anchor() : null;
    if (phase === 'active' && this.lastPhase !== 'active') this.release();
    this.lastPhase = phase;
    if (!at || s?.type !== 'projectile') return;

    const t = f.phaseProgress;
    const grow = smooth(t / 0.85);
    const bob = Math.sin(now / 110) * 3;
    const c = this.toScreen(at.x, at.y + bob);
    const z = c.zoom;
    const size = ((s.height * VISUAL_BOOST) / HAND_H) * (0.18 + 0.82 * grow);
    const power = smooth(t / 0.2);

    this.drawAura(c, z, size, power, now);
    this.drawHand(c.x, c.y, z * size, f.facing, power, now);

    // Rings contract onto the hand while it charges.
    for (let k = 0; k < 2; k++) {
      const r = (1 - ((t * 2.2 + k * 0.5) % 1)) * 110 * z * (0.5 + grow);
      this.glow.lineStyle(2.5 * z, k ? GOLD : LIGHT, 0.5 * power * (1 - r / (110 * z * 1.5))).strokeCircle(c.x, c.y, r);
    }
    if (now >= this.nextGather) {
      this.nextGather = now + 28;
      const a = Math.random() * Math.PI * 2;
      const r = (90 + Math.random() * 50) * z;
      gather(this.scene, { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }, c, (2 + Math.random() * 2.5) * z, Math.random() < 0.5 ? GOLD : LIGHT, 360);
    }
  }

  /** Light, glow and sparkles around the hand. */
  private drawAura(c: { x: number; y: number }, z: number, size: number, power: number, now: number): void {
    const pulse = 0.85 + 0.15 * Math.sin(now / 75);
    for (const [r, color, a] of [
      [80, BLUE, 0.16],
      [58, LIGHT, 0.2],
      [38, GOLD, 0.2],
    ] as const) {
      this.glow.fillStyle(color, a * power * pulse).fillCircle(c.x, c.y, r * z * size * 1.25);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + now / 800;
      const len = (92 + 16 * Math.sin(now / 110 + i)) * z * size * 1.2;
      const spread = 0.06;
      this.glow
        .fillStyle(i % 2 ? GOLD : LIGHT, 0.16 * power)
        .fillTriangle(c.x, c.y, c.x + Math.cos(a - spread) * len, c.y + Math.sin(a - spread) * len, c.x + Math.cos(a + spread) * len, c.y + Math.sin(a + spread) * len);
    }
    if (now >= this.nextSpark && power > 0.3) {
      this.nextSpark = now + 70;
      const a = Math.random() * Math.PI * 2;
      const r = (30 + Math.random() * 40) * z * size;
      puff(this.scene, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, (2 + Math.random() * 2) * z, Math.random() < 0.5 ? GOLD : CORE, { dy: -(24 + Math.random() * 30) * z, ms: 650, additive: true, grow: 0.2 });
    }
  }

  /** `z` is screen px per local px; `alpha` fades the whole hand. */
  private drawHand(x: number, y: number, z: number, dir: 1 | -1, alpha: number, now: number, g: Phaser.GameObjects.Graphics = this.g): void {
    if (alpha <= 0.01) return;
    const map = placer(x, y, z, dir);
    const shimmer = 0.88 + 0.12 * Math.sin(now / 60);
    for (const [inflate, color, a] of LAYERS) {
      g.fillStyle(color, a * alpha * (inflate < 0 ? shimmer : 1));
      for (const piece of handPieces(inflate)) g.fillPoints(piece.map(map), true);
    }
    g.lineStyle(Math.max(1, 1.6 * z), CREASE, 0.55 * alpha);
    for (const [a, b] of CREASES) {
      const [m, n] = [map(recentre(a)), map(recentre(b))];
      g.lineBetween(m.x, m.y, n.x, n.y);
    }
  }

  private release(): void {
    const at = this.anchor();
    if (!at) return;
    const c = this.toScreen(at.x, at.y);
    puff(this.scene, c.x, c.y, 30 * c.zoom, 0xffffff, { grow: 4, ms: 320, additive: true });
    puff(this.scene, c.x, c.y, 36 * c.zoom, GOLD, { grow: 3.2, ms: 420, additive: true, alpha: 0.7 });
    floatText(this.scene, c.x, c.y - 90 * c.zoom, 'HIGH COMMAND!', '#ffe7a0', 18 * c.zoom, 36 * c.zoom, 900);
  }

  private drawFlight(p: ProjectileSnapshot, now: number): void {
    const hb = p.hitbox;
    const gy = hb.y + hb.height / 2;
    const size = (hb.height * VISUAL_BOOST) / HAND_H;
    const wobble = Math.sin(p.age / 60) * 2;
    const c = this.toScreen(p.x, gy + wobble);
    const z = c.zoom;

    for (let i = 0; i < 6; i++) {
      const y = c.y + (i - 2.5) * 20 * z;
      const len = (60 + ((i * 41 + now / 3) % 70)) * z;
      this.glow.lineStyle(3 * z, i % 2 ? GOLD : CORE, 0.42).lineBetween(c.x - p.dir * 54 * z, y, c.x - p.dir * (54 * z + len), y);
    }
    for (let k = GHOSTS; k >= 1; k--) {
      const gc = this.toScreen(p.x - p.dir * k * 30, gy + wobble);
      this.drawHand(gc.x, gc.y, gc.zoom * size, p.dir, 0.28 / k, now, this.glow);
    }
    this.drawAura(c, z, size, 1, now);
    this.drawHand(c.x, c.y, z * size, p.dir, 1, now);

    if (now >= this.nextSpark) {
      this.nextSpark = now + 35;
      const tail = this.toScreen(p.x - p.dir * 45, gy + (Math.random() - 0.5) * hb.height * 0.8);
      puff(this.scene, tail.x, tail.y, (2.5 + Math.random() * 3) * z, Math.random() < 0.5 ? GOLD : LIGHT, { dx: -p.dir * 30 * z, ms: 420, additive: true, grow: 0.2 });
    }
  }

  /** The hand is gone: a hit becomes a palm shockwave, otherwise it simply breaks apart. */
  private resolveEnd(p: ProjectileSnapshot, now: number): void {
    const hb = p.hitbox;
    const y = hb.y + hb.height / 2;
    if (p.hitsLanded > 0) {
      this.shock = { x: p.x, y, dir: p.dir, blocked: p.blocked, start: now };
      this.shatter(p.x, y, p.blocked ? 10 : BREAK_PIECES + 8, p.dir);
    } else if (p.x > 0 && p.x < GAME_WIDTH) {
      this.shatter(p.x, y, BREAK_PIECES, p.dir);
    }
  }

  /** Energy fragments flung out from where the hand was. */
  private shatter(gx: number, gy: number, count: number, dir: 1 | -1): void {
    const c = this.toScreen(gx, gy);
    const z = c.zoom;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = (50 + Math.random() * 70) * z;
      puff(this.scene, c.x, c.y, (3 + Math.random() * 4) * z, i % 3 === 0 ? CORE : i % 2 ? GOLD : LIGHT, {
        dx: Math.cos(a) * d + dir * 20 * z,
        dy: Math.sin(a) * d,
        ms: 520 + Math.random() * 220,
        additive: true,
        grow: 0.15,
      });
    }
  }

  /** A giant translucent palm that swells outward from the point of impact. */
  private drawShock(s: Shock, now: number): void {
    const t = (now - s.start) / SHOCK_MS;
    if (t >= 1) {
      this.shock = null;
      return;
    }
    const c = this.toScreen(s.x, s.y);
    const z = c.zoom;
    const peak = s.blocked ? 1.7 : 3.6;
    const size = 1 + (peak - 1) * easeOut(t);
    const fade = Math.pow(1 - t, 1.3);
    const map = placer(c.x, c.y, z * size, s.dir);

    for (const [inflate, color, a] of [
      [5, GOLD, 0.34],
      [0, BLUE, 0.3],
      [-6, CORE, 0.3],
    ] as const) {
      this.glow.fillStyle(color, a * fade);
      for (const piece of handPieces(inflate)) this.glow.fillPoints(piece.map(map), true);
    }
    const ground = this.toScreen(s.x, GROUND_Y);
    const w = 110 * z * size * 1.6;
    this.glow.lineStyle(5 * z, GOLD, 0.75 * fade).strokeEllipse(ground.x, ground.y, w, w * 0.14);
    this.glow.lineStyle(3 * z, LIGHT, 0.7 * fade).strokeEllipse(ground.x, ground.y, w * 0.68, w * 0.1);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r0 = 40 * z * size;
      const r1 = r0 + (36 + 22 * (i % 3)) * z * Math.min(1, t * 3);
      this.glow.lineStyle(3 * z, i % 2 ? GOLD : CORE, 0.6 * fade).lineBetween(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0, c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
    }
  }
}
