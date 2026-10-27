import Phaser from 'phaser';
import { FONT_FAMILY } from '../../config';
import type { Projectile } from '../../systems/combat/Projectile';

/** Above fighters and sparks, below comic impact words. */
export const FX_DEPTH = 11;

export interface Pt {
  x: number;
  y: number;
}

/** Per-fighter visuals for a special move, updated every frame by the fight scene. */
export interface SpecialFx {
  update(now: number, projectiles: readonly Projectile[]): void;
}

export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
export const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/**
 * Maps a shape drawn in local px (x forward, y up negative) to the screen: scaled by `z`, rotated by `rot`
 * (radians, clockwise on screen), mirrored by `dir` and squashed horizontally by `squash`.
 */
export function placer(x: number, y: number, z: number, dir: number, rot = 0, squash = 1): (p: Pt) => Pt {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (p) => ({ x: x + dir * squash * (p.x * c - p.y * s) * z, y: y + (p.x * s + p.y * c) * z });
}

export interface PuffOptions {
  dx?: number;
  dy?: number;
  ms?: number;
  alpha?: number;
  grow?: number;
  additive?: boolean;
}

/** A short-lived particle that drifts away and fades. */
export function puff(scene: Phaser.Scene, x: number, y: number, r: number, color: number, o: PuffOptions = {}): void {
  const dot = scene.add.circle(x, y, r, color, o.alpha ?? 1).setDepth(FX_DEPTH);
  if (o.additive) dot.setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: dot,
    x: x + (o.dx ?? 0),
    y: y + (o.dy ?? 0),
    scale: o.grow ?? 0.3,
    alpha: 0,
    duration: o.ms ?? 500,
    ease: 'Quad.easeOut',
    onComplete: () => dot.destroy(),
  });
}

/** Particle pulled into a point, e.g. energy gathering. */
export function gather(scene: Phaser.Scene, from: Pt, to: Pt, r: number, color: number, ms: number): void {
  const dot = scene.add.circle(from.x, from.y, r, color).setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  scene.tweens.add({ targets: dot, x: to.x, y: to.y, alpha: 1, scale: 0.4, duration: ms, ease: 'Quad.easeIn', onComplete: () => dot.destroy() });
}

/** Small floating comic text, e.g. a whistle blast or page glyphs. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: string, size: number, rise: number, ms: number): void {
  const label = scene.add
    .text(x, y, text, { fontFamily: FONT_FAMILY, fontSize: `${Math.round(size)}px`, fontStyle: 'bold', color, stroke: '#111111', strokeThickness: Math.max(2, size / 6) })
    .setOrigin(0.5)
    .setDepth(FX_DEPTH)
    .setScale(0.4);
  scene.tweens.add({ targets: label, scale: 1, duration: 120, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: label, y: y - rise, alpha: 0, delay: ms * 0.4, duration: ms * 0.6, onComplete: () => label.destroy() });
}

/** Tracks per-projectile counters so effects can react once to a new hit or phase. */
export class Changes<T> {
  private readonly seen = new WeakMap<Projectile, T>();

  /** True the first time `value` differs from the last one seen for `p` (and on first sight if `initial` differs). */
  changed(p: Projectile, value: T, initial: T): boolean {
    const before = this.seen.has(p) ? this.seen.get(p)! : initial;
    this.seen.set(p, value);
    return before !== value;
  }
}
