import Phaser from 'phaser';
import { GROUND_Y } from '../../config';
import type { Fighter } from '../../systems/combat/Fighter';
import { type Projectile, STRIKE_CONTACT } from '../../systems/combat/Projectile';
import type { ToScreen } from '../FighterView';
import { clamp01, floatText, FX_DEPTH, gather, placer, puff, smooth, type Pt, type SpecialFx } from './kit';

const AMBER = 0xe39a2d;
const AMBER_LIGHT = 0xffc65a;
const CREAM = 0xfff1c9;
const GOLD = 0xffc93a;
const BROWN = 0x6b3a14;
const COPPER = 0xd9892a;

/** Where each ordinary stream lands, in game px either side of the target. */
const OFFSETS = [-34, 30, -10, 38] as const;
/** Height of the giant kettle's centre above the ground. */
const KETTLE_HEIGHT = 255;
const SPOUT: Pt = { x: 84, y: -36 };
const POUR_TILT = 0.5;
const TIP_TILT = 0.95;
const FALL_MS = 90;
const STREAM_W = 40;
const FINISH_W = 96;
const STREAM_TAIL_MS = 300;
const FINALE_MS = 620;
const BURST_MS = 650;

const easeOutBack = (t: number): number => {
  const x = clamp01(t) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};

interface Run {
  /** Game x of the target the kettle hovers over. */
  x: number;
  dir: 1 | -1;
  strikes: number;
  beat: number;
  delay: number;
}

/** Local kettle outline points, built once: x forward, y up negative. */
const ring = (cx: number, cy: number, rx: number, ry: number, n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
const BODY = ring(0, 0, 52, 42, 24);
const LID = ring(0, -40, 27, 9, 14);
const KNOB = ring(0, -52, 6, 6, 8);
const SPOUT_POLY: Pt[] = [{ x: 36, y: -6 }, { x: 40, y: 18 }, { x: 90, y: -30 }, { x: 82, y: -44 }];
const HANDLE: Pt[] = [{ x: -30, y: -38 }, { x: -70, y: -54 }, { x: -98, y: -14 }, { x: -82, y: 22 }, { x: -46, y: 32 }];
const BAND: Pt[] = Array.from({ length: 13 }, (_, i) => {
  const a = Math.PI * (0.12 + (i / 12) * 0.76);
  return { x: Math.cos(a) * 50, y: Math.sin(a) * 39 };
});

/** Chai-wala's Chai Ki Baarish: a giant kettle is summoned over the opponent and rains chai, then tips for the finisher. */
export class BaarishFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private tracked: Projectile | null = null;
  private run: Run | null = null;
  private finale: { run: Run; h: number; start: number } | null = null;
  private lastH = -1e9;
  private lastHits = 0;
  private nextGather = 0;
  private nextDroplet = 0;
  private nextSplash = 0;
  private nextSteam = 0;
  private nextKettleSteam = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fighter: Fighter,
    private readonly toScreen: ToScreen,
  ) {
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(FX_DEPTH);
    this.g = scene.add.graphics().setDepth(FX_DEPTH);
  }

  update(now: number, projectiles: readonly Projectile[]): void {
    this.glow.clear();
    this.g.clear();
    this.drawWindUp(now);

    const live = projectiles.find((p) => p.owner === this.fighter && p.data.fx === 'baarish' && !p.dead);
    if (live) {
      const v = live.data.volley!;
      if (live !== this.tracked) {
        this.tracked = live;
        this.lastHits = 0;
        this.lastH = -1e9;
        this.run = { x: live.x, dir: live.dir, strikes: v.strikes, beat: v.beatMs, delay: v.delayMs ?? 0 };
        this.summonCall();
      }
      if (live.hitsLanded > this.lastHits) {
        for (let i = this.lastHits; i < live.hitsLanded; i++) this.hitFlash(live, i === v.strikes - 1);
        this.lastHits = live.hitsLanded;
      }
      this.frame(live.holdMs, this.run!, now);
    } else if (this.tracked && this.run) {
      this.finale = { run: this.run, h: this.lastH, start: now };
      this.tracked = null;
    }
    if (this.finale) {
      const h = this.finale.h + (now - this.finale.start);
      const run = this.finale.run;
      if (h > run.strikes * run.beat + FINALE_MS) this.finale = null;
      else this.frame(h, run, now);
    }
  }

  /** Raised kettle: warm golden motes stream in around his fist. */
  private drawWindUp(now: number): void {
    const f = this.fighter;
    const s = f.currentSpecial;
    if (f.state !== 'special' || s?.type !== 'projectile' || s.fx !== 'baarish' || f.phase !== 'startup') return;
    const t = f.phaseProgress;
    const power = smooth(t / 0.3);
    const at = this.toScreen(f.x + f.facing * 18, f.y - f.data.body.height * (0.62 + 0.4 * smooth(t / 0.6)));
    const z = at.zoom;
    this.glow.fillStyle(AMBER, 0.2 * power).fillCircle(at.x, at.y, 52 * z * power);
    this.glow.fillStyle(GOLD, 0.25 * power).fillCircle(at.x, at.y, 28 * z * power);
    for (let k = 0; k < 2; k++) {
      const u = (t * 2.2 + k * 0.5) % 1;
      this.glow.lineStyle(2.5 * z, k ? GOLD : AMBER_LIGHT, 0.55 * power * u).strokeCircle(at.x, at.y, (1 - u) * 80 * z);
    }
    if (now >= this.nextGather) {
      this.nextGather = now + 28;
      const a = Math.random() * Math.PI * 2;
      const r = (70 + Math.random() * 40) * z;
      gather(this.scene, { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, at, (2 + Math.random() * 2) * z, Math.random() < 0.5 ? GOLD : AMBER_LIGHT, 340);
    }
  }

  private summonCall(): void {
    const c = this.toScreen(this.run!.x, GROUND_Y - KETTLE_HEIGHT);
    floatText(this.scene, c.x, c.y + 70 * c.zoom, 'CHAI KI BAARISH!', '#ffd98a', 18 * c.zoom, 30 * c.zoom, 1000);
  }

  /**
   * Draws the whole sequence at clock `h` ms (negative while the warning plays, 0 at the first beat), so the
   * visuals can never drift from the hit schedule. Emits one-off particles when `h` crosses an event.
   */
  private frame(h: number, run: Run, now: number): void {
    const { strikes: S, beat, delay } = run;
    const end = S * beat;
    const target = this.toScreen(run.x, GROUND_Y);
    const z = target.zoom;
    const appear = delay > 0 ? clamp01((h + delay) / (delay * 0.75)) : 1;
    const fade = h > end + 250 ? 1 - smooth((h - end - 250) / (FINALE_MS - 250)) : 1;
    const wobble = Math.sin(now / 180) * 3;

    // Warning on the ground: shadow, pulsing rings and falling chevrons that fade once the rain starts.
    const warn = (1 - smooth((h - 0.1 * beat) / (0.5 * beat))) * smooth(appear * 2);
    if (warn > 0.01) this.drawWarning(target.x, target.y, z, warn, appear, now);
    this.g.fillStyle(0x000000, 0.28 * appear * fade).fillEllipse(target.x, target.y, 190 * z * appear, 26 * z * appear);

    // Where the kettle is: slides over each stream, tips a little to pour and a lot for the finisher.
    const bi = h < 0 ? -1 : Math.min(S - 1, Math.floor(h / beat));
    const landing = (i: number): number => (i < 0 || i >= S - 1 ? 0 : OFFSETS[i % OFFSETS.length]!);
    let land = 0;
    let tilt = 0;
    if (bi >= 0 && h < end) {
      const u = (h - bi * beat) / beat;
      land = landing(bi - 1) + (landing(bi) - landing(bi - 1)) * smooth(u / 0.3);
      tilt = bi < S - 1 ? POUR_TILT * smooth(u / 0.22) * (1 - smooth((u - 0.78) / 0.2)) : TIP_TILT * smooth(u / 0.5);
    } else if (h >= end) {
      tilt = TIP_TILT * (1 - smooth((h - end) / 300));
    }

    const kScale = easeOutBack(appear) * z * (1 - 0.15 * (1 - fade));
    const alpha = clamp01(appear * 1.6) * fade;
    const spoutOff = placer(0, 0, kScale, run.dir, tilt)(SPOUT);
    const kx = this.toScreen(run.x + land, GROUND_Y).x - spoutOff.x;
    const ky = this.toScreen(run.x, GROUND_Y - KETTLE_HEIGHT).y + wobble * z - 26 * z * (1 - fade);
    if (alpha > 0.02) {
      this.drawKettle(kx, ky, kScale, run.dir, tilt, alpha);
      if (now >= this.nextKettleSteam && appear > 0.6) {
        this.nextKettleSteam = now + 120;
        puff(this.scene, kx + spoutOff.x, ky + spoutOff.y - 6 * z, 9 * z, CREAM, { dx: run.dir * 14 * z, dy: -36 * z, alpha: 0.4, grow: 2.2, ms: 700 });
      }
    }
    if (appear > 0.2 && appear < 0.98 && now >= this.nextSteam) {
      this.nextSteam = now + 40;
      puff(this.scene, kx + (Math.random() - 0.5) * 120 * z, ky + (Math.random() - 0.5) * 60 * z, (10 + Math.random() * 10) * z, CREAM, { alpha: 0.5, grow: 2.4, ms: 480, dy: -14 * z });
    }

    // Streams: a quick sequence of narrow ones, then one wide finisher.
    const spoutX = kx + spoutOff.x;
    const spoutY = ky + spoutOff.y;
    for (let i = 0; i < S; i++) {
      const u = (h - i * beat) / beat;
      const last = i === S - 1;
      if (!last && (u < 0.2 || u >= 0.92)) continue;
      if (last && (u < 0.3 || h > end + STREAM_TAIL_MS)) continue;
      const start = last ? 0.3 : 0.2;
      const head = clamp01(((u - start) * beat) / FALL_MS);
      const tailStart = last ? (end + STREAM_TAIL_MS - FALL_MS * 0.8 - i * beat) / beat : 0.78;
      const tail = clamp01((u - tailStart) / (last ? 0.3 : 0.14));
      const width = (last ? FINISH_W * smooth((u - 0.3) / 0.1) : STREAM_W) * z;
      if (width < 1) continue;
      this.drawStream(spoutX, spoutY, target.y, head, tail, width, now);
      if (head >= 1) this.splash(spoutX, target.y, z, width, now, last);
    }

    // The finisher's contact: a big steam burst and rings expanding over the impact area.
    const contact = (S - 1 + STRIKE_CONTACT) * beat;
    if (this.lastH < contact && h >= contact) this.finisherBurst(spoutX, target.y, z);
    if (h >= contact && h < contact + BURST_MS) this.drawRings(spoutX, target.y, z, (h - contact) / BURST_MS);
    this.lastH = h;
  }

  private drawWarning(x: number, y: number, z: number, warn: number, appear: number, now: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(now / 80);
    for (let k = 0; k < 3; k++) {
      const u = ((now / 520) + k / 3) % 1;
      const w = (240 * (0.4 + 0.6 * u)) * z * appear;
      this.glow.lineStyle(3.5 * z, k % 2 ? GOLD : AMBER, 0.7 * warn * (1 - u)).strokeEllipse(x, y, w, w * 0.14);
    }
    this.glow.fillStyle(AMBER, (0.1 + 0.1 * pulse) * warn).fillEllipse(x, y, 220 * z * appear, 30 * z * appear);
    for (let i = 0; i < 3; i++) {
      const lit = Math.floor(now / 110) % 3 === i ? 1 : 0.3;
      const cy = y - (70 + i * 26) * z;
      const s = 16 * z;
      this.g.lineStyle(6 * z, GOLD, lit * warn).strokePoints([{ x: x - s, y: cy - s * 0.7 }, { x, y: cy + s * 0.5 }, { x: x + s, y: cy - s * 0.7 }]);
    }
  }

  /** The giant kettle: copper body, lid, spout and bail handle, with a warm glow. */
  private drawKettle(cx: number, cy: number, z: number, dir: 1 | -1, tilt: number, alpha: number): void {
    const map = placer(cx, cy, z, dir, tilt);
    const g = this.g;
    this.glow.fillStyle(AMBER, 0.16 * alpha).fillCircle(cx, cy, 120 * z);
    this.glow.fillStyle(GOLD, 0.14 * alpha).fillCircle(cx, cy, 78 * z);
    const stroke = (pts: readonly Pt[], w: number, color: number, a = alpha): void => {
      g.lineStyle(w * z, color, a).strokePoints(pts.map(map));
    };
    stroke(HANDLE, 11, BROWN);
    stroke(HANDLE, 5.5, GOLD);
    g.fillStyle(COPPER, alpha).fillPoints(SPOUT_POLY.map(map), true);
    g.lineStyle(3 * z, BROWN, alpha).strokePoints(SPOUT_POLY.map(map), true);
    g.fillStyle(COPPER, alpha).fillPoints(BODY.map(map), true);
    const hi = BODY.map((p) => ({ x: p.x * 0.5 - 16, y: p.y * 0.4 - 14 }));
    g.fillStyle(AMBER_LIGHT, 0.55 * alpha).fillPoints(hi.map(map), true);
    stroke(BAND, 6, CREAM, alpha * 0.9);
    g.lineStyle(4 * z, BROWN, alpha).strokePoints(BODY.map(map), true);
    g.fillStyle(0xe9a43c, alpha).fillPoints(LID.map(map), true);
    g.lineStyle(3 * z, BROWN, alpha).strokePoints(LID.map(map), true);
    g.fillStyle(GOLD, alpha).fillPoints(KNOB.map(map), true);
    g.lineStyle(2.5 * z, BROWN, alpha).strokePoints(KNOB.map(map), true);
  }

  /** A wobbling column of amber chai from the spout to the ground; `head`/`tail` are how far the ends have fallen. */
  private drawStream(sx: number, sy: number, groundY: number, head: number, tail: number, w: number, now: number): void {
    const top = sy + (groundY - sy) * tail;
    const bottom = sy + (groundY - sy) * head;
    if (bottom - top < 2) return;
    const left: Phaser.Types.Math.Vector2Like[] = [];
    const right: Phaser.Types.Math.Vector2Like[] = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const y = top + (bottom - top) * k;
      const flare = (0.7 + 0.3 * k) * (i === steps ? 1.15 : 1);
      const half = (w / 2) * flare;
      const sway = Math.sin(now / 55 + y * 0.045) * w * 0.07;
      left.push({ x: sx + sway - half, y });
      right.unshift({ x: sx + sway + half, y });
    }
    this.glow.fillStyle(AMBER, 0.22).fillPoints([...left, ...right].map((p, i, all) => ({ x: p.x + (i < all.length / 2 ? -w * 0.18 : w * 0.18), y: p.y })), true);
    this.g.fillStyle(AMBER, 0.95).fillPoints([...left, ...right], true);
    const inner = (f: number): Phaser.Types.Math.Vector2Like[] => [...left, ...right].map((p) => ({ x: sx + (p.x - sx) * f, y: p.y }));
    this.g.fillStyle(AMBER_LIGHT, 0.95).fillPoints(inner(0.6), true);
    this.g.fillStyle(CREAM, 0.9).fillPoints(inner(0.26), true);
    const lit = Math.floor(now / 70) % 2;
    this.g.lineStyle(Math.max(1.5, w * 0.06), CREAM, 0.7);
    for (const side of [left, right.slice().reverse()]) {
      if (lit) this.g.lineBetween(side[3]!.x, side[3]!.y, side[7]!.x, side[7]!.y);
    }
    if (now >= this.nextDroplet) {
      this.nextDroplet = now + 38;
      const side = Math.random() < 0.5 ? -1 : 1;
      const y = top + (bottom - top) * Math.random();
      puff(this.scene, sx + side * (w / 2), y, (2 + Math.random() * 2.5) * (w / 40) * 0.6 + 1, AMBER_LIGHT, { dx: side * (10 + Math.random() * 22), dy: 24 + Math.random() * 40, ms: 380, grow: 0.5 });
    }
  }

  /** Droplets leaping off the ground, a ripple and a drifting steam puff where a stream lands. */
  private splash(x: number, groundY: number, z: number, w: number, now: number, big: boolean): void {
    this.glow.lineStyle(3 * z, CREAM, 0.7).strokeEllipse(x, groundY, w * 1.9, w * 0.34);
    this.g.fillStyle(AMBER, 0.55).fillEllipse(x, groundY + 1, w * 1.5, w * 0.24);
    if (now < this.nextSplash) return;
    this.nextSplash = now + (big ? 38 : 55);
    const n = big ? 4 : 2;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      puff(this.scene, x + side * Math.random() * w * 0.4, groundY - 3, (2.5 + Math.random() * 3) * z, i % 2 ? AMBER_LIGHT : AMBER, {
        dx: side * (20 + Math.random() * 50) * z,
        dy: -(30 + Math.random() * 55) * z,
        ms: 420,
        grow: 0.4,
      });
    }
    puff(this.scene, x + (Math.random() - 0.5) * w, groundY - 6 * z, (10 + Math.random() * 8) * z, CREAM, { dx: (Math.random() - 0.5) * 30 * z, dy: -(46 + Math.random() * 30) * z, alpha: big ? 0.42 : 0.32, grow: big ? 3 : 2.4, ms: big ? 950 : 700 });
  }

  /** The tipped kettle lands its big pour: steam rolls outwards across the floor. */
  private finisherBurst(x: number, groundY: number, z: number): void {
    floatText(this.scene, x, groundY - 150 * z, 'BOILING POINT!', '#fff1c9', 22 * z, 38 * z, 1100);
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      puff(this.scene, x + side * Math.random() * 40 * z, groundY - 10 * z, (18 + Math.random() * 16) * z, CREAM, {
        dx: side * (60 + Math.random() * 110) * z,
        dy: -(40 + Math.random() * 90) * z,
        alpha: 0.4,
        grow: 3,
        ms: 1000 + Math.random() * 300,
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.PI + (i / 17) * Math.PI;
      const d = (50 + Math.random() * 70) * z;
      puff(this.scene, x, groundY - 6 * z, (3 + Math.random() * 3) * z, i % 3 ? AMBER_LIGHT : GOLD, { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 1.1, ms: 560, additive: true, grow: 0.3 });
    }
  }

  private drawRings(x: number, groundY: number, z: number, t: number): void {
    const fade = Math.pow(1 - t, 1.3);
    for (let k = 0; k < 3; k++) {
      const u = clamp01(t * 1.3 - k * 0.12);
      if (u <= 0) continue;
      const r = (20 + 150 * (1 - Math.pow(1 - u, 2.2))) * z;
      this.glow.lineStyle((10 * (1 - u) + 2) * z, k % 2 ? GOLD : AMBER_LIGHT, 0.85 * (1 - u)).strokeEllipse(x, groundY, r * 2, r * 0.45);
    }
    this.glow.fillStyle(CREAM, 0.28 * fade).fillEllipse(x, groundY - 10 * z, 120 * z * (1 + t), 50 * z * (1 + t));
  }

  /** A bright pop where each registered hit lands, bigger for the finisher. */
  private hitFlash(p: Projectile, last: boolean): void {
    const hb = p.hitbox;
    const c = this.toScreen(p.x + (Math.random() - 0.5) * 40, hb.y + hb.height * 0.78);
    const z = c.zoom;
    puff(this.scene, c.x, c.y, (last ? 38 : 22) * z, 0xffffff, { grow: last ? 3.4 : 2.4, ms: last ? 340 : 230, additive: true, alpha: 0.5 });
    puff(this.scene, c.x, c.y, (last ? 44 : 26) * z, AMBER, { grow: last ? 3.2 : 2.6, ms: last ? 400 : 280, additive: true, alpha: 0.6 });
    const n = last ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const d = (40 + Math.random() * 45) * z * (last ? 1.4 : 1);
      puff(this.scene, c.x, c.y, 3 * z, i % 2 ? AMBER_LIGHT : CREAM, { dx: Math.cos(a) * d, dy: Math.sin(a) * d, ms: 320, additive: true, grow: 0.25 });
    }
  }
}
