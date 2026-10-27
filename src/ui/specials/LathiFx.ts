import Phaser from 'phaser';
import { GROUND_Y } from '../../config';
import type { Fighter } from '../../systems/combat/Fighter';
import { STRIKE_CONTACT, type Projectile } from '../../systems/combat/Projectile';
import type { ToScreen } from '../FighterView';
import { Changes, FX_DEPTH, floatText, placer, puff, smooth, type Pt, type SpecialFx } from './kit';

const KHAKI = 0xc9ad6a;
const KHAKI_DARK = 0x9c8550;
const BELT = 0x5a3a1a;
const CAP = 0x2a3a6b;
const SKIN = 0xc68e5f;
const CANE = 0xc9a24a;
const SHIELD = 0xb8913a;
const DUST = 0x8a7560;
/** Formation: forward offset, size and height lift (back rows look further away). */
const SQUAD = [
  { off: 18, scale: 1, lift: 0 },
  { off: -22, scale: 0.93, lift: -7 },
  { off: -60, scale: 0.86, lift: -14 },
] as const;
/** Baton angles in radians from the forward axis (screen y down): ready, raised behind the head, follow-through. */
const READY = -1.05;
const RAISED = -2.6;
const STRUCK = 0.35;

/** Amit's Police Lathi Charge: a whistle, then a three-constable squad runs in, lands a beat of baton hits and runs off. */
export class LathiFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly phases = new Changes<string>();
  private whistled = false;
  private nextDust = 0;

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
    const f = this.fighter;
    if (f.state === 'special' && f.currentSpecial?.type === 'projectile' && f.phase === 'startup') {
      this.drawWhistle(now, f.phaseProgress);
    } else {
      this.whistled = false;
    }
    for (const p of projectiles) {
      if (p.owner !== f || p.data.fx !== 'lathi' || p.dead) continue;
      if (this.phases.changed(p, p.volleyPhase, 'enter') && p.volleyPhase === 'strike') this.formUp(p);
      this.drawSquad(p, now);
    }
  }

  private drawWhistle(now: number, t: number): void {
    const f = this.fighter;
    const { height, width } = f.data.body;
    const mouth = this.toScreen(f.x + f.facing * width * 0.22, f.y - height * 0.84);
    const z = mouth.zoom;
    const a = smooth(t / 0.2);
    const map = placer(mouth.x, mouth.y, z, f.facing);
    const body = [{ x: 0, y: -3 }, { x: 12, y: -3 }, { x: 14, y: 4 }, { x: 0, y: 4 }].map(map);
    this.g.fillStyle(0xd7dce3, a).fillPoints(body, true).lineStyle(1.5 * z, 0x6a717c, a).strokePoints(body, true);
    const bell = map({ x: 14, y: 2 });
    this.g.fillStyle(0xd7dce3, a).fillCircle(bell.x, bell.y, 5 * z);
    for (let k = 0; k < 3; k++) {
      const r = ((now / 3 + k * 22) % 66) * z;
      const fade = 1 - r / (66 * z);
      const pts: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const ang = -0.7 + (i / 8) * 1.4;
        pts.push({ x: bell.x + f.facing * Math.cos(ang) * (r + 10 * z), y: bell.y + Math.sin(ang) * (r + 10 * z) });
      }
      this.glow.lineStyle(3 * z, 0xffffff, 0.7 * fade * a).strokePoints(pts);
    }
    if (!this.whistled && t > 0.2) {
      this.whistled = true;
      floatText(this.scene, bell.x + f.facing * 46 * z, bell.y - 26 * z, 'TWEEET!', '#ffffff', 22 * z, 30 * z, 800);
    }
  }

  /** Arrival flash and a call-out when the squad locks into formation. */
  private formUp(p: Projectile): void {
    const at = this.toScreen(p.x, GROUND_Y - 120);
    const z = at.zoom;
    puff(this.scene, at.x, at.y + 60 * z, 40 * z, 0xffd24a, { grow: 2.5, ms: 360, additive: true, alpha: 0.6 });
    floatText(this.scene, at.x, at.y - 20 * z, 'LATHI CHARGE!', '#ffd24a', 20 * z, 34 * z, 900);
    for (const m of SQUAD) {
      const foot = this.toScreen(p.x + p.dir * m.off, GROUND_Y);
      puff(this.scene, foot.x, foot.y, 10 * z, DUST, { dx: -p.dir * 30 * z, dy: -16 * z, alpha: 0.6, grow: 2.2, ms: 500 });
    }
  }

  private drawSquad(p: Projectile, now: number): void {
    const v = p.data.volley!;
    const running = p.volleyPhase !== 'strike';
    const beat = Math.floor(p.holdMs / v.beatMs);
    const u = (p.holdMs % v.beatMs) / v.beatMs;
    for (let i = SQUAD.length - 1; i >= 0; i--) {
      const m = SQUAD[i]!;
      const striking = !running && beat < v.strikes && beat % SQUAD.length === i;
      let baton = READY + Math.sin(now / 160 + i) * 0.08;
      if (running) baton = RAISED * 0.6 + Math.sin(p.age / 70 + i) * 0.15;
      else if (striking) baton = batonSwing(u);
      const foot = this.toScreen(p.x + p.dir * m.off, GROUND_Y);
      this.drawConstable(foot.x, foot.y + m.lift * foot.zoom, foot.zoom * m.scale, p.dir, running ? p.age / 70 + i * 1.3 : null, baton);
    }
    if (running && now >= this.nextDust) {
      this.nextDust = now + 55;
      const m = SQUAD[Math.floor(Math.random() * SQUAD.length)]!;
      const foot = this.toScreen(p.x + p.dir * m.off, GROUND_Y);
      puff(this.scene, foot.x, foot.y - 4, 7 * foot.zoom, DUST, { dx: -p.dir * 24 * foot.zoom, dy: -14 * foot.zoom, alpha: 0.5, grow: 2, ms: 420 });
    }
  }

  /** `stride` is the running cycle phase, or null when standing. Local px: x forward, y up negative. */
  private drawConstable(x: number, y: number, z: number, dir: 1 | -1, stride: number | null, baton: number): void {
    const map = placer(x, y, z, dir);
    const g = this.g;
    const limb = (a: Pt, b: Pt, width: number, color: number): void => {
      const [m, n] = [map(a), map(b)];
      g.lineStyle(width * z, color).lineBetween(m.x, m.y, n.x, n.y);
    };
    const dot = (c: Pt, r: number, color: number): void => {
      const m = map(c);
      g.fillStyle(color).fillCircle(m.x, m.y, r * z);
    };

    g.fillStyle(0x000000, 0.3).fillEllipse(x, y, 46 * z, 8 * z);
    const swing = stride === null ? 0.18 : Math.sin(stride) * 0.6;
    const hip: Pt = { x: 0, y: -46 };
    for (const s of [-1, 1]) {
      const foot = { x: hip.x + Math.sin(swing * s) * 46, y: hip.y + Math.cos(swing * s) * 46 };
      limb(hip, foot, 9, s === 1 ? KHAKI : KHAKI_DARK);
      limb(foot, { x: foot.x + 9, y: foot.y }, 7, 0x151515);
    }

    // Cane shield on the back arm.
    const shield = map({ x: -14, y: -70 });
    g.fillStyle(SHIELD).fillCircle(shield.x, shield.y, 17 * z);
    g.lineStyle(1.5 * z, 0x7a5a1a);
    for (let k = -2; k <= 2; k++) {
      g.lineBetween(shield.x + k * 6 * z, shield.y - 15 * z, shield.x + k * 6 * z, shield.y + 15 * z);
      g.lineBetween(shield.x - 15 * z, shield.y + k * 6 * z, shield.x + 15 * z, shield.y + k * 6 * z);
    }
    g.lineStyle(2.5 * z, 0x5a3a10).strokeCircle(shield.x, shield.y, 17 * z);

    const torso = [{ x: -11, y: -94 }, { x: 11, y: -94 }, { x: 13, y: -46 }, { x: -13, y: -46 }].map(map);
    g.fillStyle(KHAKI).fillPoints(torso, true).lineStyle(1.5 * z, KHAKI_DARK).strokePoints(torso, true);
    const belt = [{ x: -13, y: -54 }, { x: 13, y: -54 }, { x: 13, y: -47 }, { x: -13, y: -47 }].map(map);
    g.fillStyle(BELT).fillPoints(belt, true);
    dot({ x: 2, y: -50.5 }, 2.5, 0xd4a84a);
    limb({ x: -9, y: -92 }, { x: 11, y: -55 }, 3, BELT);

    dot({ x: 2, y: -105 }, 11, SKIN);
    limb({ x: 6, y: -101 }, { x: 13, y: -101 }, 3, 0x2a1a10);
    dot({ x: 8, y: -108 }, 1.6, 0x111111);
    const cap = map({ x: 1, y: -113 });
    g.fillStyle(CAP).fillEllipse(cap.x, cap.y, 26 * z, 12 * z);
    limb({ x: 6, y: -110 }, { x: 17, y: -109 }, 3, 0x111111);
    dot({ x: 3, y: -115 }, 2, 0xd4a84a);

    const shoulder: Pt = { x: 4, y: -86 };
    const hand: Pt = { x: shoulder.x + Math.cos(baton) * 24, y: shoulder.y + Math.sin(baton) * 24 };
    const tip: Pt = { x: hand.x + Math.cos(baton) * 62, y: hand.y + Math.sin(baton) * 62 };
    const butt: Pt = { x: hand.x - Math.cos(baton) * 8, y: hand.y - Math.sin(baton) * 8 };
    limb(butt, tip, 5, CANE);
    limb({ x: tip.x - Math.cos(baton) * 6, y: tip.y - Math.sin(baton) * 6 }, tip, 5.5, 0x3a2a10);
    limb(shoulder, hand, 7, KHAKI);
    dot(hand, 4, SKIN);
  }
}

/** Wind up behind the head, whip down so the baton lands on the contact beat, then recover. */
function batonSwing(u: number): number {
  const whipFrom = STRIKE_CONTACT - 0.1;
  const whipTo = STRIKE_CONTACT + 0.02;
  if (u < whipFrom) return READY + (RAISED - READY) * smooth(u / whipFrom);
  if (u < whipTo) return RAISED + (STRUCK - RAISED) * smooth((u - whipFrom) / (whipTo - whipFrom));
  return STRUCK + (READY - STRUCK) * smooth((u - whipTo) / (1 - whipTo));
}
