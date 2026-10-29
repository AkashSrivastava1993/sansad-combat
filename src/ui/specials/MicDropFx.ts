import Phaser from 'phaser';
import { FONT_FAMILY, GAME_WIDTH, GROUND_Y } from '../../config';
import type { FighterSnapshot, MatchState, ProjectileSnapshot } from '../../core/match/state';
import type { ToScreen } from '../FighterView';
import { clamp01, finalState, floatText, FX_DEPTH, gather, placer, puff, smooth, type Pt, type SpecialFx } from './kit';

const RED = 0xe5243b;
const GOLD = 0xffc93a;
const HOT = 0xff7a3a;
const CREAM = 0xfff1c9;
const STEEL = 0xd8dce3;
const BLACK = 0x1d1d24;
const WORDS = ['BOLD!', 'WOW!', '!!!', 'NO FILTER', 'DRAMA!', 'ENCORE!'];
const BUBBLE_WORDS = ['BREAKING!', 'NO FILTER!', 'MY TAKE!', 'DRAMA!'];
/** Offsets from the mic in px; each bubble gets its own spot so they never pile up. */
const BUBBLE_SLOTS: readonly (readonly [number, number])[] = [
  [-78, -62],
  [78, -92],
  [-68, -118],
  [82, -38],
];
/** The drawn wave is a little larger than its hitbox so it reads as big while staying fair to dodge. */
const VISUAL_BOOST = 1.15;
const IMPACT_MS = 700;
const MAX_BUBBLES = 4;

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

interface MicPose {
  /** Px forward of the body centre and above the ground. */
  fwd: number;
  up: number;
  /** Clockwise radians from upright. */
  rot: number;
  alpha: number;
}

interface Impact {
  x: number;
  y: number;
  dir: 1 | -1;
  blocked: boolean;
  start: number;
}

/** Kangana's Mic Drop: raise the mic, gather speech bubbles and rings, hurl a soundwave, drop the mic. */
export class MicDropFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private tracked: ProjectileSnapshot | null = null;
  private impact: Impact | null = null;
  private lastPhase = '';
  private landed = false;
  private bubbles = 0;
  private slot = 0;
  private nextGather = 0;
  private nextBubble = 0;
  private nextLetter = 0;

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
    this.drawMic(now);

    const live = projectiles.find((p) => p.owner === this.fighter.slot && p.data.fx === 'mic' && !p.dead);
    if (live) {
      this.tracked = live;
      this.drawWave(live, now);
    } else if (this.tracked) {
      this.resolveEnd(finalState(this.tracked, state), now);
      this.tracked = null;
    }
    if (this.impact) this.drawImpact(this.impact, now);
  }

  /** Where the microphone is at this moment of the move, or null when it is not in play. */
  private micPose(): MicPose | null {
    const f = this.fighter;
    const s = f.currentSpecial;
    if (f.action !== 'special' || s?.type !== 'projectile' || s.fx !== 'mic') return null;
    const h = f.data.body.height;
    const t = f.phaseProgress;
    if (f.phase === 'startup') {
      const raise = smooth(t / 0.6);
      return { fwd: 34 - 18 * raise, up: h * (0.62 + 0.5 * raise), rot: 0.35 * (1 - raise) - 0.1 * raise, alpha: smooth(t / 0.12) };
    }
    const hand: MicPose = { fwd: s.spawnX - 12, up: 82, rot: 1.25, alpha: 1 };
    if (f.phase === 'active') return hand;
    // Recovery: the mic is let go, tumbles to the floor, bounces and settles.
    const fall = clamp01(t / 0.45);
    const bounce = clamp01((t - 0.45) / 0.3);
    const lift = fall < 1 ? 1 - fall * fall : Math.abs(Math.sin(bounce * Math.PI * 1.5)) * 0.22 * (1 - bounce);
    return {
      fwd: hand.fwd + 14 * fall,
      up: 8 + (hand.up - 8) * lift,
      rot: hand.rot + (Math.PI * 4 + Math.PI / 2 - hand.rot) * fall * fall,
      alpha: 1 - smooth((t - 0.8) / 0.2),
    };
  }

  private drawMic(now: number): void {
    const f = this.fighter;
    const pose = this.micPose();
    const phase = pose ? f.phase : '';
    if (phase !== this.lastPhase) {
      if (phase === 'active' && pose) this.release(pose);
      if (phase !== 'recovery') this.landed = false;
    }
    this.lastPhase = phase;
    if (!pose || pose.alpha <= 0.01) return;

    const at = this.toScreen(f.x + f.facing * pose.fwd, f.y - pose.up);
    const z = at.zoom;
    if (phase === 'startup') this.charge(at, z, f.phaseProgress, now);
    if (phase === 'recovery' && !this.landed && f.phaseProgress > 0.45) {
      this.landed = true;
      this.thud(f);
    }
    this.drawMicShape(at.x, at.y, z * 1.15, f.facing, pose.rot, pose.alpha);
  }

  /** Red-gold rings close in on the raised mic while speech bubbles pop up around it. */
  private charge(at: { x: number; y: number }, z: number, t: number, now: number): void {
    const power = smooth(t / 0.3);
    for (let k = 0; k < 3; k++) {
      const u = (t * 2.4 + k / 3) % 1;
      const r = (1 - u) * 90 * z * (0.5 + power * 0.5);
      this.glow.lineStyle(3 * z, k % 2 ? GOLD : RED, 0.65 * power * u).strokeCircle(at.x, at.y - 16 * z, r);
    }
    this.glow.fillStyle(RED, 0.18 * power).fillCircle(at.x, at.y - 16 * z, 46 * z * power);
    this.glow.fillStyle(GOLD, 0.2 * power).fillCircle(at.x, at.y - 16 * z, 26 * z * power);
    if (now >= this.nextGather) {
      this.nextGather = now + 30;
      const a = Math.random() * Math.PI * 2;
      const r = (85 + Math.random() * 40) * z;
      gather(this.scene, { x: at.x + Math.cos(a) * r, y: at.y - 16 * z + Math.sin(a) * r }, { x: at.x, y: at.y - 16 * z }, (2 + Math.random() * 2) * z, Math.random() < 0.5 ? GOLD : RED, 340);
    }
    if (t > 0.2 && now >= this.nextBubble && this.bubbles < MAX_BUBBLES) {
      this.nextBubble = now + 110;
      const slot = this.slot++ % BUBBLE_SLOTS.length;
      const [sx, sy] = BUBBLE_SLOTS[slot]!;
      this.bubble(at.x + sx * z, at.y + sy * z, BUBBLE_WORDS[slot % BUBBLE_WORDS.length]!, Math.sign(sx), z);
    }
  }

  /** A comic speech bubble that pops in, floats up and fades; it removes itself. */
  private bubble(x: number, y: number, text: string, side: number, z: number): void {
    const label = this.scene.add
      .text(0, 0, text, { fontFamily: FONT_FAMILY, fontSize: `${Math.round(15 * z)}px`, fontStyle: 'bold italic', color: '#1b1b22' })
      .setOrigin(0.5);
    const w = label.width + 18 * z;
    const h = label.height + 10 * z;
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff).fillRoundedRect(-w / 2, -h / 2, w, h, 10 * z);
    g.fillTriangle(-side * w * 0.2, h / 2 - 1, -side * w * 0.2 + side * 12 * z, h / 2 - 1, -side * w * 0.2 - side * 4 * z, h / 2 + 12 * z);
    g.lineStyle(2.5 * z, RED).strokeRoundedRect(-w / 2, -h / 2, w, h, 10 * z);
    const box = this.scene.add.container(x, y, [g, label]).setDepth(FX_DEPTH + 2).setScale(0.2).setAngle(side * 6);
    this.bubbles++;
    this.scene.tweens.add({ targets: box, scale: 1, duration: 130, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: box,
      y: y - 26 * z,
      alpha: 0,
      delay: 420,
      duration: 300,
      onComplete: () => {
        this.bubbles--;
        box.destroy();
      },
    });
  }

  private release(pose: MicPose): void {
    const f = this.fighter;
    const at = this.toScreen(f.x + f.facing * pose.fwd, f.y - pose.up);
    puff(this.scene, at.x, at.y, 26 * at.zoom, 0xffffff, { grow: 3, ms: 280, additive: true, alpha: 0.6 });
    puff(this.scene, at.x, at.y, 30 * at.zoom, GOLD, { grow: 3.4, ms: 380, additive: true, alpha: 0.6 });
    floatText(this.scene, at.x, at.y - 70 * at.zoom, 'QUEEN OF CONTROVERSY!', '#ffe08a', 15 * at.zoom, 34 * at.zoom, 1000);
  }

  /** The dropped mic hits the floor. */
  private thud(f: FighterSnapshot): void {
    const at = this.toScreen(f.x + f.facing * (f.currentSpecial?.type === 'projectile' ? f.currentSpecial.spawnX + 2 : 60), GROUND_Y);
    const z = at.zoom;
    this.glow.lineStyle(3 * z, GOLD, 0.8).strokeEllipse(at.x, at.y, 40 * z, 10 * z);
    puff(this.scene, at.x, at.y - 4 * z, 12 * z, 0x8a7560, { dy: -10 * z, alpha: 0.6, grow: 3, ms: 420 });
    puff(this.scene, at.x, at.y - 4 * z, 16 * z, GOLD, { grow: 3.5, ms: 380, additive: true, alpha: 0.5 });
    floatText(this.scene, at.x, at.y - 34 * z, 'MIC DROP.', '#ffffff', 17 * z, 30 * z, 900);
  }

  /** A stage microphone in local px: grip at the origin, head at -y. */
  private drawMicShape(x: number, y: number, z: number, dir: 1 | -1, rot: number, alpha: number): void {
    const map = placer(x, y, z, dir, rot);
    const g = this.g;
    const poly = (color: number, pts: readonly Pt[]): void => {
      g.fillStyle(color, alpha).fillPoints(pts.map(map), true);
    };
    poly(BLACK, [{ x: -5, y: -4 }, { x: 5, y: -4 }, { x: 4, y: 30 }, { x: -4, y: 30 }]);
    poly(GOLD, [{ x: -5.5, y: 3 }, { x: 5.5, y: 3 }, { x: 5.5, y: 8 }, { x: -5.5, y: 8 }]);
    poly(RED, [{ x: -4.6, y: 14 }, { x: 4.6, y: 14 }, { x: 4.3, y: 18 }, { x: -4.3, y: 18 }]);
    poly(STEEL, [{ x: -5, y: -4 }, { x: 5, y: -4 }, { x: 8, y: -13 }, { x: -8, y: -13 }]);
    const head = map({ x: 0, y: -23 });
    g.fillStyle(STEEL, alpha).fillCircle(head.x, head.y, 13 * z);
    g.lineStyle(1.6 * z, 0x7d8590, alpha).strokeCircle(head.x, head.y, 13 * z);
    for (const [a, b] of [
      [{ x: -12, y: -23 }, { x: 12, y: -23 }],
      [{ x: 0, y: -35 }, { x: 0, y: -11 }],
      [{ x: -8.5, y: -31.5 }, { x: 8.5, y: -14.5 }],
      [{ x: 8.5, y: -31.5 }, { x: -8.5, y: -14.5 }],
    ] as const) {
      const [m, n] = [map(a), map(b)];
      g.lineStyle(1.1 * z, 0x7d8590, alpha * 0.8).lineBetween(m.x, m.y, n.x, n.y);
    }
    g.lineStyle(2 * z, GOLD, alpha).strokeCircle(head.x, head.y, 14.5 * z);
  }

  /** Layered rings pulsing outwards from a glowing core, with trails and comic lettering behind. */
  private drawWave(p: ProjectileSnapshot, now: number): void {
    const hb = p.hitbox;
    const c = this.toScreen(p.x, hb.y + hb.height / 2);
    const z = c.zoom;
    const size = (hb.height / 96) * VISUAL_BOOST;
    const dir = p.dir;

    for (let i = 0; i < 6; i++) {
      const y = c.y + (i - 2.5) * 17 * z * size;
      const len = (70 + ((i * 47 + now / 3) % 80)) * z;
      this.glow.lineStyle(3 * z, i % 2 ? GOLD : HOT, 0.45).lineBetween(c.x - dir * 34 * z, y, c.x - dir * (34 * z + len), y);
    }
    this.glow.fillStyle(RED, 0.3).fillEllipse(c.x, c.y, 80 * z * size, 92 * z * size);
    this.glow.fillStyle(GOLD, 0.35).fillEllipse(c.x, c.y, 42 * z * size, 52 * z * size);
    this.glow.fillStyle(CREAM, 0.5).fillEllipse(c.x, c.y, 18 * z * size, 24 * z * size);

    for (let k = 0; k < 5; k++) {
      const phase = (p.age / 300 + k / 5) % 1;
      const r = (14 + phase * 82) * z * size;
      const arc: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i <= 14; i++) {
        const a = -1 + (i / 14) * 2;
        arc.push({ x: c.x + dir * Math.cos(a) * r, y: c.y + Math.sin(a) * r * 1.1 });
      }
      const alpha = (1 - phase) * 0.95;
      this.glow.lineStyle((11 * (1 - phase) + 2) * z, k % 2 ? GOLD : RED, alpha).strokePoints(arc);
      this.g.lineStyle(Math.max(1, (4 * (1 - phase) + 1) * z), CREAM, alpha * 0.7).strokePoints(arc);
    }

    if (now >= this.nextLetter) {
      this.nextLetter = now + 130;
      const behind = this.toScreen(p.x - dir * (30 + Math.random() * 50), hb.y + hb.height * (0.1 + Math.random() * 0.8));
      floatText(this.scene, behind.x, behind.y, pick(WORDS), Math.random() < 0.5 ? '#ffd24a' : '#ff6a6a', (12 + Math.random() * 8) * z, 26 * z, 520);
    }
  }

  private resolveEnd(p: ProjectileSnapshot, now: number): void {
    const hb = p.hitbox;
    const y = hb.y + hb.height / 2;
    if (p.hitsLanded > 0) {
      this.impact = { x: p.x, y, dir: p.dir, blocked: p.blocked, start: now };
      this.shatter(p.x, y, p.blocked ? 10 : 24, p.dir);
      if (!p.blocked) {
        const c = this.toScreen(p.x, y);
        for (const [word, dx, dy] of [['!!!', -70, -50], ['BOLD!', 80, -30], ['?!', 10, -90]] as const) {
          floatText(this.scene, c.x + dx * c.zoom, c.y + dy * c.zoom, word, '#ffd24a', 20 * c.zoom, 30 * c.zoom, 700);
        }
      }
    } else if (p.x > 0 && p.x < GAME_WIDTH) {
      this.shatter(p.x, y, 16, p.dir);
    }
  }

  private shatter(gx: number, gy: number, count: number, dir: 1 | -1): void {
    const c = this.toScreen(gx, gy);
    const z = c.zoom;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = (50 + Math.random() * 80) * z;
      puff(this.scene, c.x, c.y, (3 + Math.random() * 4) * z, i % 3 === 0 ? CREAM : i % 2 ? GOLD : RED, {
        dx: Math.cos(a) * d + dir * 20 * z,
        dy: Math.sin(a) * d,
        ms: 520 + Math.random() * 240,
        additive: true,
        grow: 0.15,
      });
    }
  }

  /** Big concentric rings spreading out from the point of impact, with radiating spikes. */
  private drawImpact(im: Impact, now: number): void {
    const t = (now - im.start) / IMPACT_MS;
    if (t >= 1) {
      this.impact = null;
      return;
    }
    const c = this.toScreen(im.x, im.y);
    const z = c.zoom;
    const peak = im.blocked ? 70 : 170;
    const fade = Math.pow(1 - t, 1.2);
    for (let k = 0; k < 5; k++) {
      const u = clamp01(t * 1.25 - k * 0.1);
      if (u <= 0) continue;
      const r = (14 + peak * (1 - Math.pow(1 - u, 2.4))) * z;
      this.glow.lineStyle((12 * (1 - u) + 2) * z, k % 2 ? GOLD : RED, 0.9 * (1 - u)).strokeEllipse(c.x, c.y, r * 2, r * 1.7);
    }
    this.glow.fillStyle(CREAM, 0.4 * fade).fillCircle(c.x, c.y, 30 * z * (1 + t * 2));
    const spikes = im.blocked ? 8 : 16;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const r0 = (24 + peak * 0.2) * z;
      const r1 = r0 + (24 + 30 * (i % 3)) * z * Math.min(1, t * 3) * (im.blocked ? 0.5 : 1);
      this.glow.lineStyle(3.5 * z, i % 2 ? GOLD : HOT, 0.7 * fade).lineBetween(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0, c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
    }
  }
}
