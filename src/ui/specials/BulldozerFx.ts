import Phaser from 'phaser';
import { GAME_WIDTH, GROUND_Y } from '../../config';
import type { FighterSnapshot, MatchState, ProjectileSnapshot } from '../../core/match/state';
import type { ToScreen } from '../FighterView';
import { Changes, FX_DEPTH, placer, puff, type Pt, type SpecialFx } from './kit';

const ORANGE = 0xf39c12;
const ORANGE_DARK = 0xc0700a;
const YELLOW = 0xf1c40f;
const BLADE = 0xd4a017;
const DARK = 0x2b2b2b;
const STEEL = 0x8a9399;
const GLASS = 0x9fd3ff;
const DUST = 0x8a7560;
const WHEELS: readonly [number, number][] = [
  [-80, 11],
  [-46, 11],
  [-12, 11],
  [22, 11],
  [50, 9],
];

/** Yogi's Bulldozer Rush: a warning at the arena edge, then a bulldozer charges through and drives off. */
export class BulldozerFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly hits = new Changes<number>();
  private nextWarnDust = 0;
  private nextDust = 0;
  private nextSmoke = 0;

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
    const f = this.fighter;
    if (f.action === 'special' && f.currentSpecial?.type === 'projectile' && f.phase === 'startup') this.drawWarning(now, f.phaseProgress);
    for (const p of projectiles) {
      if (p.owner !== f.slot || p.data.fx !== 'bulldozer' || p.dead) continue;
      this.drawDozer(p, now);
      if (this.hits.changed(p, p.hitsLanded, 0)) this.crash(p);
    }
  }

  /** Flashing hazard sign, chevrons and dust at the screen edge the bulldozer will burst from. */
  private drawWarning(now: number, t: number): void {
    const dir = this.fighter.facing;
    const ground = this.toScreen(dir === 1 ? 0 : GAME_WIDTH, GROUND_Y);
    const x = Phaser.Math.Clamp(ground.x, 0, GAME_WIDTH);
    const inward = dir;
    const z = ground.zoom;
    const blink = Math.sin(now / 65) > 0 ? 1 : 0.35;
    const fade = Math.min(1, t * 4);

    for (let i = 0; i < 4; i++) {
      this.glow.fillStyle(0xff8a1a, (0.1 - i * 0.02) * blink * fade).fillRect(inward === 1 ? x : x - (i + 1) * 30, 0, (i + 1) * 30, ground.y);
    }
    const sx = x + inward * 60 * z;
    const sy = ground.y - 170 * z;
    const s = 34 * z;
    this.g.fillStyle(0x111111, fade).fillTriangle(sx, sy - s * 1.12, sx - s * 1.08, sy + s * 0.68, sx + s * 1.08, sy + s * 0.68);
    this.g.fillStyle(YELLOW, fade * blink).fillTriangle(sx, sy - s * 0.9, sx - s * 0.88, sy + s * 0.56, sx + s * 0.88, sy + s * 0.56);
    this.g.fillStyle(0x111111, fade).fillRect(sx - 3 * z, sy - s * 0.45, 6 * z, s * 0.6).fillCircle(sx, sy + s * 0.32, 3.5 * z);

    for (let i = 0; i < 3; i++) {
      const lit = Math.floor(now / 110) % 3 === i ? 1 : 0.3;
      const cx = x + inward * (110 + i * 34) * z;
      const cy = ground.y - 40 * z;
      const h = 18 * z;
      this.g.lineStyle(7 * z, YELLOW, lit * fade);
      this.g.strokePoints([{ x: cx - inward * 10 * z, y: cy - h }, { x: cx + inward * 6 * z, y: cy }, { x: cx - inward * 10 * z, y: cy + h }]);
    }

    if (now >= this.nextWarnDust) {
      this.nextWarnDust = now + 45;
      puff(this.scene, x + inward * Math.random() * 40 * z, ground.y - 6 * z, (8 + Math.random() * 10) * z, DUST, {
        dx: inward * (20 + Math.random() * 30) * z,
        dy: -(25 + Math.random() * 35) * z,
        alpha: 0.55,
        grow: 2.6,
        ms: 650,
      });
    }
  }

  private drawDozer(p: ProjectileSnapshot, now: number): void {
    const base = this.toScreen(p.x, GROUND_Y);
    const z = base.zoom;
    const dist = (p.age / 1000) * p.data.speed;
    const bounce = Math.sin(p.age / 28) * 1.5;
    const map = placer(base.x, base.y + bounce * z, z, p.dir);
    const fill = (color: number, pts: readonly Pt[], alpha = 1): void => {
      this.g.fillStyle(color, alpha).fillPoints(pts.map(map), true);
    };
    const outline = (pts: readonly Pt[], width = 2, color = 0x111111): void => {
      this.g.lineStyle(width * z, color).strokePoints(pts.map(map), true);
    };
    const line = (a: Pt, b: Pt, width: number, color: number, alpha = 1): void => {
      const [m, n] = [map(a), map(b)];
      this.g.lineStyle(width * z, color, alpha).lineBetween(m.x, m.y, n.x, n.y);
    };

    this.g.fillStyle(0x000000, 0.35).fillEllipse(base.x, base.y, 230 * z, 18 * z);
    for (let i = 0; i < 4; i++) {
      const y = -20 - i * 30;
      const len = 60 + ((i * 37 + now / 4) % 50);
      line({ x: -112, y }, { x: -112 - len, y }, 3, 0xffffff, 0.45);
    }

    const tracks: Pt[] = [{ x: -95, y: -32 }, { x: 58, y: -32 }, { x: 70, y: -16 }, { x: 58, y: 0 }, { x: -95, y: 0 }, { x: -107, y: -16 }];
    fill(DARK, tracks);
    for (let i = 0; i < 12; i++) {
      const x = -95 + ((i * 13 + dist) % 153);
      line({ x, y: -32 }, { x: x - 4, y: -27 }, 2, 0x555555);
      line({ x, y: 0 }, { x: x + 4, y: -5 }, 2, 0x555555);
    }
    for (const [wx, r] of WHEELS) {
      const c = map({ x: wx, y: -16 });
      this.g.fillStyle(0x5c5c5c).fillCircle(c.x, c.y, r * z).lineStyle(2 * z, 0x1a1a1a).strokeCircle(c.x, c.y, r * z);
      const spin = (dist / r) * p.dir;
      for (let k = 0; k < 3; k++) {
        const a = spin + (k * Math.PI) / 3;
        this.g.lineStyle(2 * z, 0x2a2a2a).lineBetween(c.x - Math.cos(a) * r * z, c.y - Math.sin(a) * r * z, c.x + Math.cos(a) * r * z, c.y + Math.sin(a) * r * z);
      }
    }

    const body: Pt[] = [{ x: -90, y: -32 }, { x: 48, y: -32 }, { x: 48, y: -62 }, { x: -90, y: -62 }];
    fill(ORANGE, body);
    for (let i = 0; i < 9; i++) {
      const x = -86 + i * 15;
      fill(i % 2 ? YELLOW : 0x111111, [{ x, y: -48 }, { x: x + 8, y: -48 }, { x: x + 13, y: -41 }, { x: x + 5, y: -41 }]);
    }
    outline(body);
    const hood: Pt[] = [{ x: 8, y: -62 }, { x: 48, y: -62 }, { x: 48, y: -82 }, { x: 14, y: -86 }];
    fill(YELLOW, hood);
    outline(hood);
    for (let i = 0; i < 3; i++) line({ x: 22 + i * 8, y: -66 }, { x: 22 + i * 8, y: -80 }, 2, ORANGE_DARK);
    fill(DARK, [{ x: 28, y: -86 }, { x: 35, y: -86 }, { x: 35, y: -106 }, { x: 28, y: -106 }]);

    const cab: Pt[] = [{ x: -84, y: -62 }, { x: -18, y: -62 }, { x: -24, y: -118 }, { x: -80, y: -118 }];
    fill(ORANGE, cab);
    fill(GLASS, [{ x: -76, y: -70 }, { x: -28, y: -70 }, { x: -32, y: -110 }, { x: -73, y: -110 }], 0.85);
    // Driver in a hard hat.
    const head = map({ x: -48, y: -90 });
    this.g.fillStyle(0x3a2a20).fillCircle(head.x, head.y, 8 * z);
    const hat = map({ x: -48, y: -97 });
    this.g.fillStyle(YELLOW).fillEllipse(hat.x, hat.y, 20 * z, 10 * z);
    line({ x: -66, y: -106 }, { x: -40, y: -76 }, 2, 0xffffff, 0.5);
    outline(cab, 2.5);
    fill(ORANGE_DARK, [{ x: -88, y: -118 }, { x: -16, y: -118 }, { x: -16, y: -125 }, { x: -88, y: -125 }]);
    const beacon = map({ x: -52, y: -129 });
    const on = Math.sin(now / 80) > 0;
    this.g.fillStyle(on ? 0xffb020 : 0x8a5a10).fillRect(beacon.x - 5 * z, beacon.y - 4 * z, 10 * z, 8 * z);
    if (on) this.glow.fillStyle(0xffa020, 0.55).fillCircle(beacon.x, beacon.y, 16 * z);

    line({ x: 40, y: -50 }, { x: 80, y: -38 }, 8, DARK);
    line({ x: 30, y: -72 }, { x: 78, y: -58 }, 4, STEEL);
    const blade: Pt[] = [{ x: 74, y: -86 }, { x: 98, y: -82 }, { x: 104, y: 0 }, { x: 78, y: 0 }];
    fill(BLADE, blade);
    for (let i = 1; i < 4; i++) line({ x: 77 + i, y: -86 + i * 21 }, { x: 99 + i, y: -82 + i * 20 }, 2, 0x9a7410);
    outline(blade, 2.5);

    const exhaust = map({ x: 31, y: -108 });
    if (now >= this.nextSmoke) {
      this.nextSmoke = now + 80;
      puff(this.scene, exhaust.x, exhaust.y, (5 + Math.random() * 4) * z, 0x3b3b3b, { dx: -p.dir * 26 * z, dy: -40 * z, alpha: 0.6, grow: 2.6, ms: 700 });
    }
    if (now >= this.nextDust) {
      this.nextDust = now + 38;
      const rear = map({ x: -104, y: -4 });
      puff(this.scene, rear.x, rear.y, (8 + Math.random() * 8) * z, DUST, { dx: -p.dir * (30 + Math.random() * 30) * z, dy: -(18 + Math.random() * 26) * z, alpha: 0.6, grow: 2.4, ms: 600 });
    }
  }

  /** Dust and debris flung off the blade on contact. */
  private crash(p: ProjectileSnapshot): void {
    const front = this.toScreen(p.x + p.dir * 100, GROUND_Y - 40);
    const z = front.zoom;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      puff(this.scene, front.x, front.y, (10 + Math.random() * 10) * z, DUST, {
        dx: (Math.cos(a) * 60 + p.dir * 40) * z,
        dy: Math.sin(a) * 60 * z,
        alpha: 0.7,
        grow: 2.2,
        ms: 700,
      });
    }
    for (let i = 0; i < 6; i++) {
      puff(this.scene, front.x, front.y, 3 * z, 0x3a2a1a, { dx: p.dir * (50 + Math.random() * 70) * z, dy: -(30 + Math.random() * 60) * z, grow: 0.8, ms: 500 });
    }
  }
}
