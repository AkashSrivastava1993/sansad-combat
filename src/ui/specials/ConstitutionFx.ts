import Phaser from 'phaser';
import { GROUND_Y } from '../../config';
import type { FighterSnapshot, MatchState, ProjectileSnapshot } from '../../core/match/state';
import type { ToScreen } from '../FighterView';
import { clamp01, floatText, FX_DEPTH, gather, placer, puff, smooth, type Pt, type SpecialFx } from './kit';

const NAVY = 0x1b2a5c;
const GOLD = 0xffd24a;
const BLUE = 0x4da6ff;
const PAGE = 0xfff4d6;
const INK = 0x5a6488;
const GLYPHS = ['\u00A7', 'Art. 14', '\u00B6', 'Art. 21', 'Art. 19', '\u00A7'];
/** Book size in px: one page. */
const PAGE_W = 26;
const PAGE_H = 34;
const WAVE_SEGMENTS = 12;
const BOOK_FOLLOW_RATE = 18;

interface BookPose {
  fwd: number;
  /** Fraction of body height above the feet. */
  up: number;
  open: number;
  alpha: number;
}

/** Rahul's Constitution Shockwave: the book is raised, opens and glows, then a ground wave rolls out. */
export class ConstitutionFx implements SpecialFx {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly g: Phaser.GameObjects.Graphics;
  private book: BookPose = { fwd: 26, up: 0.6, open: 0, alpha: 0 };
  private lastNow: number | null = null;
  private lastPhase = '';
  private nextGather = 0;
  private nextGlyph = 0;
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
    const dt = this.lastNow === null ? 0 : Math.min(0.1, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.glow.clear();
    this.g.clear();
    this.updateBook(now, dt);
    for (const p of projectiles) {
      if (p.owner === this.fighter.slot && p.data.fx === 'constitution' && !p.dead) this.drawWave(p, now);
    }
  }

  private targetPose(): BookPose | null {
    const f = this.fighter;
    if (f.action !== 'special' || f.currentSpecial?.type !== 'projectile') return null;
    const t = f.phaseProgress;
    if (f.phase === 'startup') {
      const raise = smooth(t / 0.55);
      return { fwd: 26 - 12 * raise, up: 0.6 + 0.52 * raise, open: smooth((t - 0.5) / 0.4), alpha: smooth(t / 0.15) };
    }
    if (f.phase === 'active') return { fwd: 46, up: 0.78, open: 1, alpha: 1 };
    return { fwd: 46, up: 0.78, open: 1 - smooth(t / 0.6), alpha: 1 - smooth((t - 0.6) / 0.4) };
  }

  private updateBook(now: number, dt: number): void {
    const f = this.fighter;
    const target = this.targetPose() ?? { ...this.book, open: 0, alpha: 0 };
    const k = dt === 0 ? 1 : 1 - Math.exp(-(target.alpha > 0 ? BOOK_FOLLOW_RATE : BOOK_FOLLOW_RATE / 2) * dt);
    const b = this.book;
    b.fwd += (target.fwd - b.fwd) * k;
    b.up += (target.up - b.up) * k;
    b.open += (target.open - b.open) * k;
    b.alpha += (target.alpha - b.alpha) * k;
    if (b.alpha < 0.02) {
      this.lastPhase = '';
      return;
    }

    const at = this.toScreen(f.x + f.facing * b.fwd, f.y - b.up * f.data.body.height);
    const z = at.zoom;
    const phase = f.action === 'special' ? f.phase : '';
    if (phase === 'active' && this.lastPhase !== 'active') this.release(at);
    this.lastPhase = phase;

    const pulse = 0.85 + 0.15 * Math.sin(now / 70);
    const o = b.open;
    if (o > 0.05) {
      this.glow.fillStyle(BLUE, 0.16 * o * b.alpha).fillCircle(at.x, at.y, 64 * z * o * pulse);
      this.glow.fillStyle(GOLD, 0.22 * o * b.alpha).fillCircle(at.x, at.y, 40 * z * pulse);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + now / 900;
        const len = (70 + 18 * Math.sin(now / 120 + i)) * z * o;
        const spread = 0.07;
        this.glow
          .fillStyle(i % 2 ? GOLD : BLUE, 0.2 * o * b.alpha)
          .fillTriangle(at.x, at.y, at.x + Math.cos(a - spread) * len, at.y + Math.sin(a - spread) * len, at.x + Math.cos(a + spread) * len, at.y + Math.sin(a + spread) * len);
      }
    }
    this.drawBook(at, z, f.facing, o, b.alpha, pulse);

    if (phase === 'startup' && o > 0.15 && now >= this.nextGather) {
      this.nextGather = now + 26;
      const a = Math.random() * Math.PI * 2;
      const r = (95 + Math.random() * 35) * z;
      gather(this.scene, { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, at, (2 + Math.random() * 2.5) * z, Math.random() < 0.5 ? BLUE : GOLD, 380);
    }
    if (o > 0.5 && now >= this.nextGlyph) {
      this.nextGlyph = now + 150;
      const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
      floatText(this.scene, at.x + (Math.random() - 0.5) * 50 * z, at.y - 14 * z, glyph, '#ffe7a0', 12 * z, 46 * z, 700);
    }
  }

  /** The book is upright and faces the camera; pages spread backwards from the spine as it opens. */
  private drawBook(at: Pt, z: number, dir: 1 | -1, open: number, alpha: number, pulse: number): void {
    const g = this.g;
    const w = PAGE_W * z;
    const h = PAGE_H * z;
    const back = w * open;
    const span = (from: number, to: number): [number, number] => {
      const a = at.x + dir * from;
      const b = at.x + dir * to;
      return [Math.min(a, b), Math.abs(b - a)];
    };
    const [coverX, coverW] = span(-back - 2 * z, w + 2 * z);
    g.fillStyle(NAVY, alpha).fillRect(coverX, at.y - h / 2 - 2 * z, coverW, h + 4 * z);
    g.lineStyle(2 * z, GOLD, alpha).strokeRect(coverX, at.y - h / 2 - 2 * z, coverW, h + 4 * z);

    const pages = smooth((open - 0.1) / 0.3);
    if (pages < 0.05) {
      // Closed cover: national-emblem style wheel and title bars.
      const cx = at.x + (dir * w) / 2;
      g.lineStyle(1.5 * z, GOLD, alpha).strokeCircle(cx, at.y, 7 * z);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        g.lineBetween(cx - Math.cos(a) * 7 * z, at.y - Math.sin(a) * 7 * z, cx + Math.cos(a) * 7 * z, at.y + Math.sin(a) * 7 * z);
      }
      g.fillStyle(GOLD, alpha).fillRect(cx - 9 * z, at.y - 13 * z, 18 * z, 2 * z).fillRect(cx - 7 * z, at.y + 11 * z, 14 * z, 2 * z);
      return;
    }

    const a = alpha * pages;
    for (const [from, to] of [
      [-back, 0],
      [0, w],
    ] as const) {
      const [x, pw] = span(from, to);
      if (pw < 1) continue;
      g.fillStyle(PAGE, a).fillRect(x, at.y - h / 2, pw, h);
      for (let line = 0; line < 6; line++) {
        const ly = at.y - h / 2 + (8 + line * 4.4) * z;
        const inset = 3 * z;
        const len = Math.max(0, pw - 2 * inset) * (line === 5 ? 0.6 : 1);
        g.fillStyle(INK, a * 0.75).fillRect(x + inset, ly, len, 1.4 * z);
      }
    }
    // A small wheel heads the forward page.
    const [px, pw] = span(0, w);
    g.lineStyle(1.2 * z, NAVY, a).strokeCircle(px + pw / 2, at.y - h / 2 + 4.5 * z, 2.6 * z);
    g.lineStyle(1.5 * z, 0x9a8a60, a).lineBetween(at.x, at.y - h / 2, at.x, at.y + h / 2);
    this.glow.fillStyle(0x9fd8ff, 0.3 * open * alpha * pulse).fillRect(coverX, at.y - h / 2, coverW, h);
  }

  /** Flash as the wave is released from the book. */
  private release(at: Pt): void {
    const z = this.toScreen(0, 0).zoom;
    puff(this.scene, at.x, at.y, 24 * z, 0xffffff, { grow: 4, ms: 320, additive: true });
    puff(this.scene, at.x, at.y, 30 * z, GOLD, { grow: 3, ms: 420, additive: true, alpha: 0.7 });
    floatText(this.scene, at.x, at.y - 46 * z, 'WE THE PEOPLE', '#ffe7a0', 16 * z, 36 * z, 900);
  }

  private drawWave(p: ProjectileSnapshot, now: number): void {
    const hb = p.hitbox;
    const H = GROUND_Y - hb.y;
    const W = hb.width;
    const base = this.toScreen(p.x, GROUND_Y);
    const z = base.zoom;
    const map = placer(base.x, base.y, z, p.dir);
    const flicker = 1 + 0.05 * Math.sin(now / 35);

    this.glow.fillStyle(BLUE, 0.45).fillEllipse(base.x, base.y, W * 1.9 * z, 18 * z);
    for (let i = 0; i < 6; i++) {
      const y = -H * (0.12 + i * 0.15);
      const len = W * (0.7 + 0.5 * Math.abs(Math.sin(now / 90 + i * 1.7)));
      const [a, b] = [map({ x: -W * 0.1, y }), map({ x: -W * 0.1 - len, y })];
      this.glow.lineStyle(3 * z, i % 2 ? GOLD : 0x7fc8ff, 0.45).lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const [scale, color, alpha] of [
      [1, BLUE, 0.55],
      [0.72, 0xbfe6ff, 0.7],
      [0.45, GOLD, 0.85],
    ] as const) {
      const outer: Pt[] = [];
      const inner: Pt[] = [];
      for (let k = 0; k <= WAVE_SEGMENTS; k++) {
        const s = k / WAVE_SEGMENTS;
        const bulge = Math.sin(s * Math.PI);
        const y = -s * H * 1.2 * scale * flicker;
        const ox = (W / 2) * (0.15 + 0.85 * bulge) * flicker;
        outer.push(map({ x: ox, y }));
        inner.unshift(map({ x: ox - W * 0.42 * scale * bulge - 2, y }));
      }
      this.glow.fillStyle(color, alpha).fillPoints([...outer, ...inner], true);
    }

    if (now >= this.nextDust) {
      this.nextDust = now + 45;
      const tail = map({ x: -W * 0.3, y: -4 });
      puff(this.scene, tail.x, tail.y, (5 + Math.random() * 5) * z, 0x8fa6c8, { dy: -18 * z, dx: -p.dir * 20 * z, alpha: 0.5, grow: 2, ms: 500 });
      if (Math.random() < 0.5) {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
        const at = map({ x: 0, y: -H * clamp01(0.4 + Math.random() * 0.6) });
        floatText(this.scene, at.x, at.y, glyph, '#ffe7a0', 11 * z, 30 * z, 600);
      }
    }
  }
}
