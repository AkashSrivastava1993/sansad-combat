import Phaser from 'phaser';
import { GROUND_Y } from '../config';
import { shade } from '../rig/draw';
import type { Fighter } from '../systems/combat/Fighter';
import type { ToScreen } from './FighterView';

const DEPTH = 11;
const GOLD = 0xffd24a;
const SPLASH_EVERY_MS = 35;
const STEAM_EVERY_MS = 90;
const SPARKLE_EVERY_MS = 60;
const STREAM_SEGMENTS = 14;
/** Kettle outline in px with the spout tip at the origin, x forward and y down. */
const KETTLE_BODY = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  return { x: -26 + Math.cos(a) * 17, y: 8 + Math.sin(a) * 13 };
});
const KETTLE_SPOUT = [
  { x: -14, y: 4 },
  { x: -2, y: -3 },
  { x: 1, y: 0 },
  { x: -12, y: 12 },
];
const KETTLE_HANDLE = [
  { x: -38, y: 0 },
  { x: -47, y: 2 },
  { x: -48, y: 12 },
  { x: -40, y: 18 },
];
/** Degrees the kettle tips forward at full pour. */
const KETTLE_TILT = 40;

const hex = (color: string): number => Phaser.Display.Color.HexStringToColor(color).color;

/** Heavenly ascent and kettle stream drawn over a fighter using a `pour` special. */
export class PourFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly solid: Phaser.GameObjects.Graphics;
  private nextSplash = 0;
  private nextSteam = 0;
  private nextSparkle = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fighter: Fighter,
    private readonly toScreen: ToScreen,
  ) {
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH);
    this.solid = scene.add.graphics().setDepth(DEPTH);
  }

  update(now: number): void {
    this.glow.clear();
    this.solid.clear();
    const f = this.fighter;
    const s = f.currentSpecial;
    if (!f.flying || s?.type !== 'pour') return;

    const t = f.phaseProgress;
    const power = f.phase === 'startup' ? t : f.phase === 'active' ? 1 : 1 - t;
    const { height } = f.data.body;
    const feet = this.toScreen(f.x, f.y);
    const mid = this.toScreen(f.x, f.y - height / 2);
    const head = this.toScreen(f.x, f.y - height);
    const z = mid.zoom;
    const pulse = 0.85 + 0.15 * Math.sin(now / 90);

    // Shaft of light from the heavens.
    this.glow.fillStyle(0xfff2b0, 0.16 * power).fillRect(mid.x - 70 * z, 0, 140 * z, feet.y);
    this.glow.fillStyle(0xffffff, 0.12 * power).fillRect(mid.x - 26 * z, 0, 52 * z, feet.y);
    for (const r of [1, 0.72, 0.46]) {
      this.glow.fillStyle(GOLD, 0.13 * power * pulse).fillCircle(mid.x, mid.y, height * 0.75 * r * z);
    }
    this.glow.lineStyle(5 * z, 0xffe066, 0.9 * power).strokeEllipse(head.x, head.y - 12 * z, 50 * z, 13 * z);

    // The cloud he rides.
    for (const [dx, dy, r] of [[-42, 4, 17], [-20, -4, 22], [4, -6, 25], [28, -2, 21], [48, 5, 15], [-6, 8, 20], [22, 9, 18]] as const) {
      this.solid.fillStyle(0xe8ecff, 0.95 * power).fillCircle(feet.x + dx * z, feet.y + (dy + 12) * z, r * z);
    }

    if (now >= this.nextSparkle && f.phase !== 'recovery') {
      this.nextSparkle = now + SPARKLE_EVERY_MS;
      this.drift(mid.x + (Math.random() - 0.5) * 120 * z, feet.y, 3 * z, GOLD, -(60 + Math.random() * 60) * z, 600, true);
    }

    const stream = f.hitbox;
    if (f.phase === 'active' && stream) this.drawStream(s.color ?? f.data.color, stream, t, now);
    if (f.phase !== 'startup') {
      const tip = this.toScreen(f.x + f.facing * s.spoutX, f.y - s.spoutY);
      const tilt = f.phase === 'active' ? Math.min(1, t * 5) : 1 - t;
      this.drawKettle(tip.x, tip.y, tip.zoom, f.facing, tilt * KETTLE_TILT, f.phase === 'active' ? 1 : 1 - t);
    }
  }

  private drawKettle(x: number, y: number, z: number, facing: 1 | -1, tiltDeg: number, alpha: number): void {
    const a = (tiltDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    // Tip forward (clockwise when facing right) about the spout, then mirror for facing.
    const map = (pts: readonly { x: number; y: number }[]) =>
      pts.map((p) => ({ x: x + facing * (p.x * c - p.y * sn) * z, y: y + (p.x * sn + p.y * c) * z }));
    this.solid.lineStyle(4 * z, 0x5b6170, alpha).strokePoints(map(KETTLE_HANDLE));
    this.solid.fillStyle(0xc9ced6, alpha).fillPoints(map(KETTLE_SPOUT), true);
    this.solid.fillStyle(0xd7dce3, alpha).fillPoints(map(KETTLE_BODY), true);
    this.solid.lineStyle(2 * z, 0x7d8590, alpha).strokePoints(map(KETTLE_BODY), true);
    const [lid, knob, shine] = map([{ x: -26, y: -5 }, { x: -26, y: -9 }, { x: -32, y: 4 }]);
    this.solid.fillStyle(0x9aa1ad, alpha).fillEllipse(lid!.x, lid!.y, 18 * z, 6 * z);
    this.solid.fillStyle(0x5b6170, alpha).fillCircle(knob!.x, knob!.y, 3 * z);
    this.solid.fillStyle(0xffffff, 0.6 * alpha).fillCircle(shine!.x, shine!.y, 4 * z);
  }

  private drawStream(color: string, box: { x: number; y: number; width: number; height: number }, t: number, now: number): void {
    const top = this.toScreen(box.x + box.width / 2, box.y);
    const bottom = this.toScreen(box.x + box.width / 2, GROUND_Y);
    const z = top.zoom;
    // Starts as a trickle and opens into a full pour.
    const w = box.width * z * Math.min(1, t * 6);
    const liquid = hex(color);
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    const back: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i <= STREAM_SEGMENTS; i++) {
      const k = i / STREAM_SEGMENTS;
      const y = top.y + (bottom.y - top.y) * k;
      const half = (w / 2) * (0.4 + 0.6 * k);
      const wobble = Math.sin(now / 55 + i * 0.9) * w * 0.1;
      pts.push({ x: top.x + wobble - half, y });
      back.unshift({ x: top.x + wobble + half, y });
    }
    this.solid.fillStyle(liquid, 0.95).fillPoints([...pts, ...back], true);
    const core = pts.map((p, i) => ({ x: (p.x + back[STREAM_SEGMENTS - i]!.x) / 2, y: p.y }));
    this.solid.lineStyle(Math.max(2, w * 0.22), hex(shade(color, 1.45)), 0.8).strokePoints(core);
    this.solid.fillStyle(liquid, 0.9).fillEllipse(bottom.x, bottom.y, w * 2.2, w * 0.45);

    if (now >= this.nextSplash) {
      this.nextSplash = now + SPLASH_EVERY_MS;
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.drift(bottom.x, bottom.y, (2 + Math.random() * 3) * z, liquid, -(20 + Math.random() * 40) * z, 380, false, dir * (25 + Math.random() * 45) * z);
    }
    if (now >= this.nextSteam) {
      this.nextSteam = now + STEAM_EVERY_MS;
      this.drift(bottom.x + (Math.random() - 0.5) * w * 2, bottom.y - 6 * z, (8 + Math.random() * 6) * z, 0xffffff, -(70 + Math.random() * 40) * z, 900, false, 0, 0.35, 2.2);
    }
  }

  /** A short-lived dot that floats away and fades. */
  private drift(x: number, y: number, r: number, color: number, rise: number, ms: number, additive: boolean, dx = 0, alpha = 1, grow = 0.3): void {
    const dot = this.scene.add.circle(x, y, r, color, alpha).setDepth(DEPTH);
    if (additive) dot.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: dot,
      x: x + dx,
      y: y + rise,
      scale: grow,
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => dot.destroy(),
    });
  }
}
