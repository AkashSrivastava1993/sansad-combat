import Phaser from 'phaser';
import { GAME_WIDTH, GROUND_Y } from '../../config';
import type { FighterSnapshot, MatchState, ProjectileSnapshot } from '../../core/match/state';
import { STRIKE_CONTACT } from '../../core/combat/Projectile';
import type { ToScreen } from '../FighterView';
import { finalState, floatText, FX_DEPTH, gather, puff, smooth, type SpecialFx } from './kit';

const PURPLE = 0x7a2fd0;
const SMOKE = 0x3a1560;
const BLUE = 0x3f8bff;
const RED = 0xff4a3a;
const CORE = 0xeaf7ff;
const GOLD = 0xffd23a;
const CLOTH = 0xe0c08a;
const THREAD = 0xc4372f;
const INK = 0x1a1a2e;

const RIBBON_STEPS = 22;
const RUNES = 6;
const BURST_MS = 650;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Didi Bangla Jaadu: she stabs a magic needle into a cloth doll while a rune circle and ribbons of smoke strike her opponent's spot. */
export class JaaduFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private tracked: ProjectileSnapshot | null = null;
  private lastPhase = '';
  private lastHits = 0;
  private burst: { x: number; y: number; blocked: boolean; start: number; dir: 1 | -1 } | null = null;
  private nextSmoke = 0;
  private nextSpark = 0;
  private nextGather = 0;

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
    const doll = this.drawDoll(now);

    const live = projectiles.find((p) => p.owner === this.fighter.slot && p.data.fx === 'jaadu' && !p.dead);
    if (live) {
      if (live.id !== this.tracked?.id) this.lastHits = 0;
      this.tracked = live;
      this.drawCurse(live, live.holdMs, doll, now);
      if (live.hitsLanded > this.lastHits) {
        this.lastHits = live.hitsLanded;
        this.burst = { x: live.x, y: live.hitbox.y + live.hitbox.height / 2, blocked: live.blocked, start: now, dir: live.dir };
        this.onHit(live);
      }
    } else if (this.tracked) {
      const last = finalState(this.tracked, state);
      if (last.hitsLanded === 0 && last.x > 0 && last.x < GAME_WIDTH) this.fizzle(last);
      this.tracked = null;
    }
    if (this.burst) this.drawBurst(this.burst, now);
  }

  /** The doll rides her front hand for the whole move; the needle hovers raised, then plunges as the curse launches. */
  private drawDoll(now: number): { x: number; y: number } | null {
    const f = this.fighter;
    const s = f.currentSpecial;
    const phase = f.action === 'special' && s?.type === 'projectile' && s.fx === 'jaadu' ? f.phase : '';
    const prev = this.lastPhase;
    this.lastPhase = phase;
    if (!phase) return null;

    const t = phase === 'startup' ? f.phaseProgress : 1;
    const at = this.toScreen(f.x + f.facing * 50, f.y - f.data.body.height * (0.6 + 0.12 * smooth(t)));
    const z = at.zoom;
    if (phase === 'startup' && prev !== 'startup') {
      floatText(this.scene, at.x, at.y - 80 * z, 'DIDI BANGLA JAADU!', hex(GOLD), 18 * z, 30 * z, 1100);
    }
    if (phase === 'active' && prev !== 'active') this.stab(at.x, at.y, z);

    const power = smooth(t / 0.25);
    const pulse = 0.85 + 0.15 * Math.sin(now / 70);
    this.glow.fillStyle(PURPLE, 0.28 * power * pulse).fillCircle(at.x, at.y, 46 * z);
    this.glow.fillStyle(BLUE, 0.22 * power * pulse).fillCircle(at.x, at.y, 28 * z);
    for (let k = 0; k < 2; k++) {
      const u = (t * 2 + k * 0.5) % 1;
      this.glow.lineStyle(2.5 * z, k ? BLUE : PURPLE, 0.6 * power * u).strokeCircle(at.x, at.y, (1 - u) * 70 * z);
    }
    if (phase === 'startup' && now >= this.nextGather) {
      this.nextGather = now + 30;
      const a = Math.random() * Math.PI * 2;
      const r = (60 + Math.random() * 40) * z;
      gather(this.scene, { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, at, (2 + Math.random() * 2) * z, Math.random() < 0.5 ? PURPLE : RED, 340);
    }

    const tremble = phase === 'startup' ? Math.sin(now / 30) * 1.5 : 0;
    const rise = phase === 'startup' ? 24 + 18 * smooth(t) : 0;
    this.drawDollBody(at.x, at.y + Math.sin(now / 160) * 2 * z, z * (0.4 + 0.6 * power), f.facing, rise, tremble);
    return at;
  }

  /** A tiny stitched cloth doll with a long needle whose tip sits `rise` px above its chest. */
  private drawDollBody(x: number, y: number, z: number, dir: 1 | -1, rise: number, tremble: number): void {
    const g = this.g;
    const px = (v: number): number => x + dir * v * z;
    const py = (v: number): number => y + v * z;
    g.lineStyle(5 * z, INK, 1);
    for (const [ax, ay, bx, by] of [[-7, -4, -17, 2], [7, -4, 17, 2], [-4, 12, -7, 24], [4, 12, 7, 24]] as const) {
      g.lineBetween(px(ax), py(ay), px(bx), py(by));
    }
    g.lineStyle(3 * z, CLOTH, 1);
    for (const [ax, ay, bx, by] of [[-7, -4, -17, 2], [7, -4, 17, 2], [-4, 12, -7, 24], [4, 12, 7, 24]] as const) {
      g.lineBetween(px(ax), py(ay), px(bx), py(by));
    }
    g.fillStyle(CLOTH, 1).fillRoundedRect(px(-9) - (dir < 0 ? 18 * z : 0), py(-8), 18 * z, 22 * z, 6 * z);
    g.lineStyle(2 * z, INK, 1).strokeRoundedRect(px(-9) - (dir < 0 ? 18 * z : 0), py(-8), 18 * z, 22 * z, 6 * z);
    g.fillStyle(CLOTH, 1).fillCircle(px(0), py(-17), 8 * z);
    g.lineStyle(2 * z, INK, 1).strokeCircle(px(0), py(-17), 8 * z);
    g.lineStyle(1.6 * z, INK, 1);
    for (const ex of [-3.2, 3.2]) {
      g.lineBetween(px(ex - 1.6), py(-20), px(ex + 1.6), py(-16));
      g.lineBetween(px(ex + 1.6), py(-20), px(ex - 1.6), py(-16));
    }
    g.lineStyle(1.6 * z, THREAD, 1).lineBetween(px(-3.5), py(-12.5), px(3.5), py(-12.5));
    g.lineStyle(2 * z, THREAD, 1).lineBetween(px(-6), py(-2), px(6), py(8)).lineBetween(px(6), py(-2), px(-6), py(8));

    const tipX = px(1 + tremble * 0.2);
    const tipY = py(-2 - rise);
    g.lineStyle(3.2 * z, 0xdfe6f2, 1).lineBetween(tipX, tipY, tipX - dir * 5 * z, tipY - 36 * z);
    g.fillStyle(GOLD, 1).fillCircle(tipX - dir * 5 * z, tipY - 38 * z, 3.6 * z);
    g.lineStyle(1.5 * z, INK, 1).strokeCircle(tipX - dir * 5 * z, tipY - 38 * z, 3.6 * z);
  }

  private stab(x: number, y: number, z: number): void {
    puff(this.scene, x, y, 18 * z, 0xffffff, { grow: 3.6, ms: 260, additive: true });
    puff(this.scene, x, y, 22 * z, PURPLE, { grow: 3, ms: 380, additive: true, alpha: 0.7 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      puff(this.scene, x, y, (2 + Math.random() * 2) * z, i % 2 ? RED : CORE, { dx: Math.cos(a) * 46 * z, dy: Math.sin(a) * 46 * z, ms: 420, additive: true, grow: 0.2 });
    }
  }

  /** Rune circle under the target and ribbons of smoke linking the doll to it; `h` is 0 at the strike's start. */
  private drawCurse(p: ProjectileSnapshot, h: number, doll: { x: number; y: number } | null, now: number): void {
    const v = p.data.volley!;
    const wait = v.delayMs ?? 0;
    const appear = wait > 0 ? smooth((h + wait) / (wait * 0.5)) : 1;
    const contact = STRIKE_CONTACT * v.beatMs;
    const fade = h > contact ? 1 - smooth((h - contact) / (v.beatMs * 0.9)) : 1;
    const k = appear * fade;
    if (k < 0.02) return;

    const ground = this.toScreen(p.x, GROUND_Y);
    const z = ground.zoom;
    const w = 190 * z * appear;
    const pulse = 0.5 + 0.5 * Math.sin(now / 80);
    this.glow.fillStyle(PURPLE, (0.14 + 0.1 * pulse) * k).fillEllipse(ground.x, ground.y, w, w * 0.16);
    this.glow.lineStyle(3.5 * z, BLUE, 0.85 * k).strokeEllipse(ground.x, ground.y, w, w * 0.16);
    this.glow.lineStyle(2.5 * z, PURPLE, 0.8 * k).strokeEllipse(ground.x, ground.y, w * 0.66, w * 0.105);
    for (let i = 0; i < RUNES; i++) {
      const a = now / 700 + (i / RUNES) * Math.PI * 2;
      const rx = ground.x + Math.cos(a) * w * 0.5 * 0.83;
      const ry = ground.y + Math.sin(a) * w * 0.08 * 0.83;
      const s = 7 * z;
      this.glow.lineStyle(2.4 * z, i % 2 ? CORE : BLUE, 0.9 * k);
      this.glow.lineBetween(rx - s, ry - s * 0.6, rx + s, ry + s * 0.6).lineBetween(rx - s * 0.2, ry - s, rx + s * 0.2, ry + s).lineBetween(rx - s, ry + s * 0.6, rx + s * 0.4, ry);
    }

    if (now >= this.nextSmoke) {
      this.nextSmoke = now + 55;
      const sx = ground.x + (Math.random() - 0.5) * w * 0.8;
      puff(this.scene, sx, ground.y, (9 + Math.random() * 9) * z, SMOKE, { alpha: 0.6 * k, grow: 2.6, ms: 820, dy: -(60 + Math.random() * 50) * z, dx: (Math.random() - 0.5) * 24 * z });
    }
    if (now >= this.nextSpark) {
      this.nextSpark = now + 70;
      const sx = ground.x + (Math.random() - 0.5) * w * 0.7;
      puff(this.scene, sx, ground.y, (2 + Math.random() * 2) * z, RED, { dy: -(50 + Math.random() * 60) * z, ms: 700, additive: true, grow: 0.2 });
    }

    if (!doll) return;
    const chest = this.toScreen(p.x, GROUND_Y - 90);
    for (let r = 0; r < 2; r++) {
      this.glow.lineStyle((r ? 3 : 5) * z, r ? CORE : PURPLE, (r ? 0.7 : 0.55) * k).beginPath();
      for (let i = 0; i <= RIBBON_STEPS; i++) {
        const u = i / RIBBON_STEPS;
        const bx = doll.x + (chest.x - doll.x) * u;
        const by = doll.y + (chest.y - doll.y) * u - Math.sin(u * Math.PI) * 38 * z;
        const sway = Math.sin(u * 9 - now / 90 + r * Math.PI) * 11 * z * Math.sin(u * Math.PI);
        if (i === 0) this.glow.moveTo(bx, by + sway);
        else this.glow.lineTo(bx, by + sway);
      }
      this.glow.strokePath();
    }
  }

  private onHit(p: ProjectileSnapshot): void {
    const c = this.toScreen(p.x, p.hitbox.y + p.hitbox.height / 2);
    const z = c.zoom;
    puff(this.scene, c.x, c.y, 26 * z, 0xffffff, { grow: 4.4, ms: 300, additive: true });
    puff(this.scene, c.x, c.y, 30 * z, PURPLE, { grow: 4, ms: 480, additive: true, alpha: 0.75 });
    const count = p.blocked ? 10 : 24;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = (50 + Math.random() * 80) * z;
      puff(this.scene, c.x, c.y, (3 + Math.random() * 4) * z, i % 3 === 0 ? CORE : i % 2 ? RED : BLUE, { dx: Math.cos(a) * d, dy: Math.sin(a) * d, ms: 520 + Math.random() * 220, additive: true, grow: 0.15 });
    }
    if (p.blocked) return;
    floatText(this.scene, c.x, c.y - 70 * z, 'AAYYY!', hex(GOLD), 26 * z, 40 * z, 900);
    for (let i = 0; i < 3; i++) {
      floatText(this.scene, c.x + (i - 1) * 46 * z, c.y - 30 * z - (i % 2) * 22 * z, '\u2605', hex(i % 2 ? CORE : GOLD), 24 * z, 46 * z, 800);
    }
  }

  private fizzle(p: ProjectileSnapshot): void {
    const c = this.toScreen(p.x, GROUND_Y - 40);
    puff(this.scene, c.x, c.y, 24 * c.zoom, SMOKE, { alpha: 0.7, grow: 3, ms: 600, dy: -40 * c.zoom });
    floatText(this.scene, c.x, c.y - 40 * c.zoom, 'FUSS!', '#c9b8ff', 18 * c.zoom, 28 * c.zoom, 700);
  }

  /** Shockwave: rings expanding on the ground and speed lines flying away from Didi. */
  private drawBurst(b: { x: number; y: number; blocked: boolean; start: number; dir: 1 | -1 }, now: number): void {
    const t = (now - b.start) / BURST_MS;
    if (t >= 1) {
      this.burst = null;
      return;
    }
    const c = this.toScreen(b.x, b.y);
    const z = c.zoom;
    const peak = b.blocked ? 1.5 : 3.2;
    const grow = 1 + (peak - 1) * (1 - Math.pow(1 - t, 3));
    const fade = Math.pow(1 - t, 1.3);
    this.glow.fillStyle(PURPLE, 0.3 * fade).fillCircle(c.x, c.y, 60 * z * grow);
    this.glow.fillStyle(CORE, 0.3 * fade).fillCircle(c.x, c.y, 32 * z * grow);
    const ground = this.toScreen(b.x, GROUND_Y);
    const w = 110 * z * grow * 1.6;
    this.glow.lineStyle(5 * z, BLUE, 0.8 * fade).strokeEllipse(ground.x, ground.y, w, w * 0.14);
    this.glow.lineStyle(3 * z, PURPLE, 0.7 * fade).strokeEllipse(ground.x, ground.y, w * 0.68, w * 0.1);
    for (let i = 0; i < 8; i++) {
      const y = c.y + (i - 3.5) * 16 * z;
      const len = (50 + ((i * 37) % 60)) * z * Math.min(1, t * 3);
      const x0 = c.x + b.dir * (30 + (i % 3) * 14) * z;
      this.glow.lineStyle(3 * z, i % 2 ? CORE : GOLD, 0.6 * fade).lineBetween(x0, y, x0 + b.dir * len, y);
    }
  }
}
