import Phaser from 'phaser';
import { GROUND_Y } from '../../config';
import type { FighterSnapshot, MatchState, ProjectileSnapshot } from '../../core/match/state';
import { STRIKE_CONTACT } from '../../core/combat/Projectile';
import type { ToScreen } from '../FighterView';
import { clamp01, finalState, floatText, FX_DEPTH, puff, smooth, type SpecialFx } from './kit';

/** Visual broom count; they are drawn from a formula into one graphics layer, never as separate objects. */
const COUNT = 100;
const GOLDEN = 2.399963;
const SPIN_RATE = 7;
const MATERIALISE_MS = 520;
const COLUMN_H = 175;
const GIANT_SCALE = 6;
const SWEEP_TAIL_MS = 380;
const PIVOT_BACK = 150;
const PIVOT_LIFT = 40;

const WOOD = 0x8a5a2b;
const STRAW = 0xe3b94a;
const STRAW_DARK = 0xb98a2a;
const BAND = 0x2f6bff;
const WHITE_BLUE = 0xcfe8ff;
const BLUE = 0x6fa8ff;

interface Broom {
  x: number;
  y: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  rot: number;
  s: number;
  depth: number;
}

interface Finale {
  /** Ground-level game x of the storm and its facing. */
  x: number;
  dir: 1 | -1;
  /** Ms relative to the final strike's contact moment, at `start`. */
  dt: number;
  start: number;
  beat: number;
}

/** Kejriwal's Jhaadu Storm: a spinning broom seeds a cyclone of ~100 brooms that ends in a giant sweep. */
export class BroomStormFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly pool: Broom[] = Array.from({ length: COUNT }, () => ({ x: 0, y: 0, x2: 0, y2: 0, x3: 0, y3: 0, rot: 0, s: 1, depth: 0 }));
  private tracked: ProjectileSnapshot | null = null;
  private finale: Finale | null = null;
  private lastHits = 0;
  private grabbed = false;
  private nextDust = 0;

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
    this.drawWindUp(now);

    const live = projectiles.find((p) => p.owner === this.fighter.slot && p.data.fx === 'broom' && !p.dead);
    if (live) {
      if (live.id !== this.tracked?.id) {
        this.lastHits = 0;
        this.release(live);
      }
      this.tracked = live;
      this.drawStorm(live, now);
    } else if (this.tracked) {
      this.end(finalState(this.tracked, state), now);
      this.tracked = null;
    }
    if (this.finale) this.drawFinale(now);
  }

  /** Grabs the broom, spins it faster and faster, and a small wind spiral rises from it. */
  private drawWindUp(now: number): void {
    const f = this.fighter;
    const s = f.currentSpecial;
    const on = f.action === 'special' && s?.type === 'projectile' && s.fx === 'broom' && f.phase === 'startup';
    if (!on) {
      this.grabbed = false;
      return;
    }
    const t = f.phaseProgress;
    const hand = this.toScreen(f.x + f.facing * 34, f.y - f.data.body.height * 0.62);
    const z = hand.zoom;
    const spin = Math.PI * 2 * 3.4 * t * t;
    const alpha = smooth(t / 0.14);
    if (!this.grabbed && t > 0.03) {
      this.grabbed = true;
      puff(this.scene, hand.x, hand.y, 18 * z, 0xffffff, { grow: 3, ms: 240, additive: true, alpha: 0.7 });
    }

    const arc: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = spin - 1.7 * (1 - i / 14) * (0.4 + t);
      arc.push({ x: hand.x + Math.cos(a) * 34 * z, y: hand.y + Math.sin(a) * 34 * z });
    }
    this.glow.lineStyle(3.5 * z, WHITE_BLUE, 0.55 * alpha).strokePoints(arc);
    for (let k = 4; k >= 1; k--) this.drawBroom(this.g, hand.x, hand.y, spin - k * 0.45 * (0.25 + t), 1.25 * z, alpha * (0.34 / k), false, -5);
    this.drawBroom(this.g, hand.x, hand.y, spin, 1.25 * z, alpha, true, -5);

    const power = smooth((t - 0.3) / 0.5);
    if (power > 0) {
      for (let arm = 0; arm < 3; arm++) {
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          const a = now / 110 + arm * ((Math.PI * 2) / 3) + u * Math.PI * 3;
          pts.push({ x: hand.x + Math.cos(a) * u * 40 * z * power, y: hand.y - u * 75 * z * power + Math.sin(a) * u * 8 * z });
        }
        this.glow.lineStyle(3 * z, arm ? WHITE_BLUE : BLUE, 0.5 * power).strokePoints(pts);
      }
    }
  }

  private release(p: ProjectileSnapshot): void {
    const c = this.toScreen(p.x, GROUND_Y - 100);
    puff(this.scene, c.x, c.y, 24 * c.zoom, 0xffffff, { grow: 2.6, ms: 300, additive: true, alpha: 0.45 });
    floatText(this.scene, c.x, c.y - 80 * c.zoom, 'JHAADU STORM!', '#cfe8ff', 20 * c.zoom, 34 * c.zoom, 1000);
  }

  /** Lays out `visible` brooms of the cyclone into the pool. */
  private layout(cx: number, gy: number, z: number, t: number, visible: number, spread: number): void {
    for (let i = 0; i < Math.min(COUNT, Math.ceil(visible)); i++) {
      const b = this.pool[i]!;
      const u = (i + 0.5) / COUNT;
      const th = i * GOLDEN + t * SPIN_RATE * (1.4 - 0.6 * u);
      const r = (34 + 92 * Math.pow(u, 0.75)) * spread * z;
      const h = (8 + u * COLUMN_H) * z * (0.6 + 0.4 * spread);
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      b.x = cx + cos * r;
      b.y = gy - h + sin * r * 0.22;
      b.x2 = cx + Math.cos(th - 0.32) * r;
      b.y2 = gy - h + Math.sin(th - 0.32) * r * 0.22;
      b.x3 = cx + Math.cos(th - 0.64) * r;
      b.y3 = gy - h + Math.sin(th - 0.64) * r * 0.22;
      b.rot = Math.atan2(cos * r * 0.22, -sin * r);
      b.depth = sin;
      b.s = (0.62 + 0.4 * u) * (0.82 + 0.18 * sin) * z;
    }
  }

  private drawStorm(p: ProjectileSnapshot, now: number): void {
    const v = p.data.volley!;
    const base = this.toScreen(p.x, GROUND_Y);
    const z = base.zoom;
    const arriving = p.volleyPhase === 'enter';
    const grow = smooth(p.age / MATERIALISE_MS);
    const visible = COUNT * grow;
    this.layout(base.x, base.y, z, p.age / 1000, visible, arriving ? 0.55 + 0.45 * grow : 1);

    const count = Math.min(COUNT, Math.ceil(visible));
    for (let i = 0; i < count; i++) {
      const b = this.pool[i]!;
      const a = clamp01(visible - i) * (0.55 + 0.45 * clamp01((b.depth + 1) / 2 + 0.2));
      this.glow.lineStyle(Math.max(1.5, 3.2 * b.s), WHITE_BLUE, 0.4 * a).lineBetween(b.x, b.y, b.x2, b.y2);
      this.glow.lineStyle(Math.max(1.2, 2.2 * b.s), BLUE, 0.25 * a).lineBetween(b.x2, b.y2, b.x3, b.y3);
    }
    for (const front of [false, true]) {
      for (let i = 0; i < count; i++) {
        const b = this.pool[i]!;
        if (b.depth >= 0 !== front) continue;
        this.drawBroom(this.g, b.x, b.y, b.rot, b.s, clamp01(visible - i) * (front ? 1 : 0.6), front && b.s > 0.5 * z, 0);
      }
    }

    const ring = 0.5 + 0.5 * Math.sin(now / 90);
    this.glow.lineStyle(3 * z, BLUE, 0.3 + 0.2 * ring).strokeEllipse(base.x, base.y, 230 * z * grow, 34 * z * grow);
    this.glow.lineStyle(2 * z, WHITE_BLUE, 0.25).strokeEllipse(base.x, base.y, 150 * z * grow, 22 * z * grow);
    if (now >= this.nextDust) {
      this.nextDust = now + 55;
      const a = Math.random() * Math.PI * 2;
      puff(this.scene, base.x + Math.cos(a) * 95 * z, base.y - 4 * z, 7 * z, 0x8a7560, { dx: Math.cos(a + 1.5) * 40 * z, dy: -22 * z, alpha: 0.45, grow: 2.2, ms: 480 });
    }

    if (p.hitsLanded > this.lastHits) {
      for (let i = this.lastHits; i < p.hitsLanded; i++) this.flash(p, i === v.strikes - 1);
      this.lastHits = p.hitsLanded;
    }

    if (p.volleyPhase === 'strike') {
      const contact = (v.strikes - 1 + STRIKE_CONTACT) * v.beatMs;
      this.drawGiant(p.dir, this.sweepAt(p.holdMs - contact, v.beatMs), p.x);
    }
  }

  /** A bright burst somewhere in the cyclone for each registered hit. */
  private flash(p: ProjectileSnapshot, last: boolean): void {
    const hb = p.hitbox;
    const c = this.toScreen(p.x + (Math.random() - 0.5) * hb.width * 0.5, hb.y + hb.height * (0.3 + Math.random() * 0.4));
    const z = c.zoom;
    puff(this.scene, c.x, c.y, (last ? 34 : 22) * z, 0xffffff, { grow: last ? 3.4 : 2.4, ms: last ? 340 : 230, additive: true, alpha: 0.55 });
    puff(this.scene, c.x, c.y, (last ? 40 : 26) * z, BLUE, { grow: last ? 3.2 : 2.6, ms: last ? 400 : 280, additive: true, alpha: 0.5 });
    const n = last ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const d = (50 + Math.random() * 40) * z * (last ? 1.5 : 1);
      puff(this.scene, c.x, c.y, 3 * z, WHITE_BLUE, { dx: Math.cos(a) * d, dy: Math.sin(a) * d, ms: 300, additive: true, grow: 0.2 });
    }
  }

  /** Giant broom angle (local clockwise radians, 1π = behind, 1.5π = overhead, 2π = forward) at `dt` ms from the final contact. */
  private sweepAt(dt: number, beat: number): { rot: number; alpha: number; whip: number } | null {
    const rise0 = -2 * beat;
    const rise1 = -0.45 * beat;
    if (dt < rise0 || dt >= SWEEP_TAIL_MS) return null;
    if (dt < rise1) {
      const k = (dt - rise0) / (rise1 - rise0);
      return { rot: Math.PI * (0.92 + 0.2 * smooth(k)), alpha: 0.6 * smooth(k * 2), whip: 0 };
    }
    if (dt < 0) {
      const k = (dt - rise1) / -rise1;
      return { rot: Math.PI * (1.12 + 0.88 * k * k), alpha: 1, whip: k };
    }
    const k = dt / SWEEP_TAIL_MS;
    return { rot: Math.PI * (2 + 0.2 * (1 - (1 - k) * (1 - k))), alpha: 1 - k, whip: 1 - k };
  }

  private drawGiant(dir: 1 | -1, sweep: { rot: number; alpha: number; whip: number } | null, gx: number): void {
    if (!sweep || sweep.alpha <= 0.01) return;
    const pivot = this.toScreen(gx - dir * PIVOT_BACK, GROUND_Y - PIVOT_LIFT);
    const zz = pivot.zoom;
    const mirror = (r: number): number => (dir === 1 ? r : Math.PI - r);
    const reach = GIANT_SCALE * zz * 50;
    if (sweep.whip > 0.02) {
      const span = Math.min(0.9, sweep.whip * 1.1) * Math.PI * 0.5;
      for (let i = 0; i < 7; i++) {
        const a0 = mirror(sweep.rot - (span * i) / 7);
        const a1 = mirror(sweep.rot - (span * (i + 1)) / 7);
        this.glow
          .fillStyle(i % 2 ? WHITE_BLUE : BLUE, 0.2 * sweep.alpha * (1 - i / 7))
          .fillTriangle(pivot.x, pivot.y, pivot.x + Math.cos(a0) * reach, pivot.y + Math.sin(a0) * reach, pivot.x + Math.cos(a1) * reach, pivot.y + Math.sin(a1) * reach);
      }
    }
    this.drawBroom(this.g, pivot.x, pivot.y, mirror(sweep.rot), GIANT_SCALE * zz, sweep.alpha, true, 20);
  }

  /** The storm is over: brooms scatter into particles, and the giant sweep follows through if it was cut off. */
  private end(p: ProjectileSnapshot, now: number): void {
    const v = p.data.volley!;
    const contact = (v.strikes - 1 + STRIKE_CONTACT) * v.beatMs;
    this.finale = { x: p.x, dir: p.dir, dt: p.holdMs - contact, start: now, beat: v.beatMs };
    const base = this.toScreen(p.x, GROUND_Y);
    const z = base.zoom;
    for (let i = 0; i < 36; i++) {
      const u = Math.random();
      const a = Math.random() * Math.PI * 2;
      const r = (30 + 90 * Math.pow(u, 0.75)) * z;
      puff(this.scene, base.x + Math.cos(a) * r, base.y - (8 + u * COLUMN_H) * z, (2.5 + Math.random() * 3) * z, i % 3 ? WHITE_BLUE : BLUE, {
        dx: Math.cos(a + 1.5) * 60 * z,
        dy: -(30 + Math.random() * 60) * z,
        ms: 600 + Math.random() * 300,
        additive: true,
        grow: 0.15,
      });
    }
  }

  private drawFinale(now: number): void {
    const fin = this.finale!;
    const dt = fin.dt + (now - fin.start);
    const sweep = this.sweepAt(dt, fin.beat);
    if (!sweep || dt >= SWEEP_TAIL_MS) {
      this.finale = null;
      return;
    }
    this.drawGiant(fin.dir, sweep, fin.x);
  }

  /**
   * A stylised broom along the local x axis, handle end at -20 and flared straw head at +30; `rot` is the screen angle,
   * `shift` slides the local origin along the broom so it can pivot about any point.
   */
  private drawBroom(g: Phaser.GameObjects.Graphics, x: number, y: number, rot: number, s: number, alpha: number, detail: boolean, shift: number): void {
    if (alpha <= 0.01) return;
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const X = (lx: number, ly: number): number => x + ((lx + shift) * c - ly * sn) * s;
    const Y = (lx: number, ly: number): number => y + ((lx + shift) * sn + ly * c) * s;
    g.lineStyle(Math.max(1.4, 3 * s), WOOD, alpha).lineBetween(X(-20, 0), Y(-20, 0), X(9, 0), Y(9, 0));
    g.fillStyle(STRAW, alpha);
    g.fillTriangle(X(7, -3.5), Y(7, -3.5), X(30, -10), Y(30, -10), X(30, 10), Y(30, 10));
    g.fillTriangle(X(7, -3.5), Y(7, -3.5), X(30, 10), Y(30, 10), X(7, 3.5), Y(7, 3.5));
    if (detail) {
      g.lineStyle(Math.max(1, 0.9 * s), STRAW_DARK, alpha * 0.8);
      for (const k of [-6, -2, 2, 6]) g.lineBetween(X(10, k * 0.3), Y(10, k * 0.3), X(30, k * 1.5), Y(30, k * 1.5));
    }
    g.lineStyle(Math.max(1.5, 3.4 * s), BAND, alpha).lineBetween(X(8, -4.4), Y(8, -4.4), X(8, 4.4), Y(8, 4.4));
  }
}
