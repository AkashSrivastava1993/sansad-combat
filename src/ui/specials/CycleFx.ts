import Phaser from 'phaser';
import type { Fighter } from '../../systems/combat/Fighter';
import type { Projectile } from '../../systems/combat/Projectile';
import type { ToScreen } from '../FighterView';
import { Changes, FX_DEPTH, floatText, placer, puff, smooth, type Pt, type SpecialFx } from './kit';

const RED = 0xe5243b;
const GREEN = 0x1d8f3c;
const TYRE = 0x161616;
const RIM = 0xc9ced6;
const WHEEL_R = 20;
const REAR: Pt = { x: -30, y: 10 };
const FRONT: Pt = { x: 30, y: 10 };
const CRANK: Pt = { x: -2, y: 10 };
const SEAT: Pt = { x: -12, y: -16 };
const HEAD: Pt = { x: 20, y: -16 };
/** Cartwheel speed of the thrown bicycle, rad/s. */
const ROLL_SPEED = 14;
const TRAIL_GHOSTS = 4;

/** Akhilesh's Cycle Cyclone: a bicycle appears overhead, he spins, and hurls it in a cartwheeling arc. */
export class CycleFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly hits = new Changes<number>();
  private summoned = false;
  private nextSwirl = 0;

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
    const s = f.currentSpecial;
    if (f.state === 'special' && s?.type === 'projectile' && f.phase === 'startup') {
      this.drawWindUp(now, f.phaseProgress, s.spinTurns ?? 0);
    } else {
      this.summoned = false;
    }
    for (const p of projectiles) {
      if (p.owner !== f || p.data.fx !== 'cycle' || p.dead) continue;
      this.drawFlight(p, now);
      if (this.hits.changed(p, p.hitsLanded, 0)) {
        const at = this.centre(p);
        puff(this.scene, at.x, at.y, 26 * at.zoom, 0xffffff, { grow: 3.5, ms: 260, additive: true });
      }
    }
  }

  private drawWindUp(now: number, t: number, turns: number): void {
    const f = this.fighter;
    const { height, width } = f.data.body;
    const over = this.toScreen(f.x, f.y - height * 1.12);
    const z = over.zoom;
    if (!this.summoned && t > 0.04) {
      this.summoned = true;
      puff(this.scene, over.x, over.y, 30 * z, 0xffffff, { grow: 3, ms: 300, additive: true, alpha: 0.8 });
      floatText(this.scene, over.x, over.y - 40 * z, 'CYCLE!', '#ff5a6a', 18 * z, 30 * z, 700);
    }
    const squash = turns > 0 ? Math.cos(t * turns * Math.PI * 2) : 1;
    this.drawBike(over, z, f.facing, 0, squash, smooth(t / 0.2), 0);

    // Cyclone swirl around the spinning fighter.
    const mid = this.toScreen(f.x, f.y - height / 2);
    const power = smooth(t / 0.3);
    for (let k = 0; k < 3; k++) {
      const pts: Pt[] = [];
      const phase = now / 90 + k * 2.1;
      for (let i = 0; i <= 14; i++) {
        const a = phase + (i / 14) * Math.PI * 1.1;
        pts.push({ x: mid.x + Math.cos(a) * width * (0.9 + k * 0.25) * z, y: mid.y - height * (0.35 - k * 0.3) * z + Math.sin(a) * 14 * z });
      }
      this.glow.lineStyle(3 * z, k === 1 ? 0x7fe0ff : 0xffffff, 0.45 * power).strokePoints(pts);
    }
    if (now >= this.nextSwirl) {
      this.nextSwirl = now + 60;
      const a = Math.random() * Math.PI * 2;
      puff(this.scene, mid.x + Math.cos(a) * width * z, this.toScreen(f.x, f.y).y - 4 * z, 6 * z, 0x8a7560, {
        dx: -Math.sin(a) * 30 * z,
        dy: -20 * z,
        alpha: 0.5,
        grow: 2,
        ms: 450,
      });
    }
  }

  private centre(p: Projectile): { x: number; y: number; zoom: number } {
    const hb = p.hitbox;
    return this.toScreen(p.x, hb.y + hb.height / 2);
  }

  private drawFlight(p: Projectile, now: number): void {
    const at = this.centre(p);
    const z = at.zoom;
    const roll = (p.age / 1000) * ROLL_SPEED;
    for (let i = 0; i < 5; i++) {
      const y = at.y + (i - 2) * 16 * z;
      const len = (50 + ((i * 29 + now / 3) % 60)) * z;
      this.glow.lineStyle(3 * z, 0xffffff, 0.4).lineBetween(at.x - p.dir * 50 * z, y, at.x - p.dir * (50 * z + len), y);
    }
    for (let k = TRAIL_GHOSTS; k >= 1; k--) {
      const ghost = { x: at.x - p.dir * k * 24 * z, y: at.y };
      this.drawBike(ghost, z, p.dir, roll - k * 0.35, 1, 0.32 / k, roll * 2);
    }
    this.drawBike(at, z, p.dir, roll, 1, 1, roll * 2);
    for (let k = 0; k < 2; k++) {
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = -roll * 1.3 + k * Math.PI + (i / 12) * Math.PI * 0.9;
        pts.push({ x: at.x + Math.cos(a) * 62 * z, y: at.y + Math.sin(a) * 52 * z });
      }
      this.glow.lineStyle(3 * z, 0x7fe0ff, 0.5).strokePoints(pts);
    }
  }

  /** A side-on bicycle; `squash` narrows it to show it turning, `wheelSpin` turns the spokes. */
  private drawBike(at: Pt, z: number, dir: number, rot: number, squash: number, alpha: number, wheelSpin: number): void {
    if (alpha <= 0.01) return;
    const map = placer(at.x, at.y, z, dir, rot, squash);
    const g = this.g;
    const bar = (a: Pt, b: Pt, width: number, color: number): void => {
      const [m, n] = [map(a), map(b)];
      g.lineStyle(width * z, color, alpha).lineBetween(m.x, m.y, n.x, n.y);
    };
    const rx = WHEEL_R * z * Math.max(0.08, Math.abs(squash));
    for (const hub of [REAR, FRONT]) {
      const c = map(hub);
      g.lineStyle(4.5 * z, TYRE, alpha).strokeEllipse(c.x, c.y, rx * 2, WHEEL_R * z * 2);
      g.lineStyle(1.5 * z, RIM, alpha).strokeEllipse(c.x, c.y, rx * 1.7, WHEEL_R * z * 1.7);
      for (let k = 0; k < 4; k++) {
        const a = wheelSpin + (k * Math.PI) / 4;
        bar({ x: hub.x - Math.cos(a) * 17, y: hub.y - Math.sin(a) * 17 }, { x: hub.x + Math.cos(a) * 17, y: hub.y + Math.sin(a) * 17 }, 1, RIM);
      }
    }
    bar(REAR, CRANK, 3.5, GREEN);
    bar(REAR, SEAT, 3.5, GREEN);
    bar(CRANK, SEAT, 4.5, RED);
    bar(SEAT, HEAD, 4.5, RED);
    bar(CRANK, HEAD, 4.5, RED);
    bar(HEAD, FRONT, 4, 0x9aa1ad);
    bar(HEAD, { x: 24, y: -26 }, 3, 0x9aa1ad);
    bar({ x: 17, y: -28 }, { x: 31, y: -25 }, 3.5, 0x222222);
    bar({ x: -20, y: -20 }, { x: -5, y: -20 }, 5, 0x222222);
    const crank = map(CRANK);
    g.fillStyle(0x333333, alpha).fillCircle(crank.x, crank.y, 4.5 * z);
    bar({ x: CRANK.x - 7, y: CRANK.y + 5 }, { x: CRANK.x + 7, y: CRANK.y - 5 }, 2.5, 0x333333);
  }
}
