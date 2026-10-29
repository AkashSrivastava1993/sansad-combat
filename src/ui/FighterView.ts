import Phaser from 'phaser';
import { HIGH_KICK } from '../core/config';
import { GROUND_Y, KNOCKDOWN_FALL_MS, KNOCKDOWN_LAUNCH_HEIGHT, KNOCKDOWN_RISE_MS, KO_FALL_MS, KO_LAUNCH_HEIGHT } from '../config';
import { type Outcome, RigAnimator, type RigFrame, type RigSnapshot } from '../rig/animator';
import type { FighterSnapshot } from '../core/match/state';

/** A drawn fighter in the 3D stage. Positions are game px at the feet; angle is clockwise degrees. */
export interface FighterPuppet {
  render(frame: RigFrame): void;
  /** `spin` squashes the width (-1..1) to fake turning on the spot. */
  /** `turn` is the radians spun on the spot, for rigs that rotate rather than squash. */
  place(x: number, y: number, facing: 1 | -1, angle: number, alpha: number, spin?: number, turn?: number): void;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Screen px per game px at that point. */
  zoom: number;
}

export type ToScreen = (x: number, y: number) => ScreenPoint;

const EMBER_EVERY_MS = 40;
const EMBER_COLORS = [0xff3d0f, 0xff7a1a, 0xffb21a, 0xffe066];

const total = (m: { startupMs: number; activeMs: number; recoveryMs: number }): number => m.startupMs + m.activeMs + m.recoveryMs;

/** How long the attack or special in progress lasts from start to finish, for fitting animation clips to it. */
function actionLength(f: FighterSnapshot): number | undefined {
  if (f.action === 'special') return total(f.data.special);
  if (f.action !== 'attack' || !f.move) return undefined;
  if (f.move === 'light') return total(f.data.moves.light);
  return total(f.data.moves.heavy) + (f.move === 'high' ? HIGH_KICK.extraStartupMs : 0);
}

export class FighterView {
  private readonly animator: RigAnimator;
  private readonly hitbox: Phaser.GameObjects.Rectangle;
  private koStart: number | null = null;
  private outcome: Outcome = null;
  private nextEmber = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    initial: FighterSnapshot,
    private readonly puppet: FighterPuppet,
    private readonly toScreen: ToScreen,
  ) {
    this.animator = new RigAnimator(initial.data);
    this.hitbox = scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0.35).setOrigin(0, 0).setVisible(false);
    this.update(initial);
  }

  /** Round result for this fighter: drives the victory pose and the winning or losing face. */
  setOutcome(outcome: Outcome): void {
    this.outcome = outcome;
  }

  update(f: FighterSnapshot, timeScale = 1): void {
    const now = this.scene.time.now;

    // Real-time clock so the fall keeps its pace during the K.O. slow-motion.
    let lift = 0;
    let angle = 0;
    if (f.action === 'ko') {
      this.koStart ??= now;
      const t = Math.min(1, (now - this.koStart) / KO_FALL_MS);
      angle = -f.facing * 90 * Phaser.Math.Easing.Bounce.Out(t);
      lift = Math.sin(t * Math.PI) * KO_LAUNCH_HEIGHT;
    } else {
      this.koStart = null;
    }
    if (f.thrown) {
      // Swung onto the back over the thrower's head, then held flat while it comes down.
      const turn = f.thrown.stage === 'lift' ? Phaser.Math.Easing.Sine.InOut(Math.min(1, f.thrown.progress / 0.4)) : 1;
      angle = -f.facing * 90 * turn;
    }
    if (f.downed) {
      // Falls with a bounce, lies flat, then springs back up at the end of the hitstun.
      const elapsed = f.downProgress * f.downDurationMs;
      const fall = f.floored ? 1 : Math.min(1, elapsed / KNOCKDOWN_FALL_MS);
      const rise = Math.min(1, (f.downDurationMs - elapsed) / KNOCKDOWN_RISE_MS);
      angle = -f.facing * 90 * Phaser.Math.Easing.Bounce.Out(fall) * Phaser.Math.Easing.Sine.Out(rise);
      lift = Math.sin(fall * Math.PI) * KNOCKDOWN_LAUNCH_HEIGHT;
    }

    const snapshot: RigSnapshot = {
      state: f.downed ? 'ko' : f.action,
      phase: f.phase,
      progress: f.phaseProgress,
      attack: f.move,
      grab: f.grab,
      special: f.currentSpecial?.type ?? null,
      vx: f.vx,
      facing: f.facing,
      grounded: f.y >= GROUND_Y,
    };
    const aura = f.shieldActive
      ? { color: '#ffd24a', alpha: 0.3 }
      : f.action === 'block'
        ? { color: '#66ccff', alpha: 0.16 }
        : f.burning
          ? { color: '#ff5a1a', alpha: 0.2 + 0.08 * Math.sin(now / 45) }
          : undefined;
    this.puppet.render({ ...this.animator.update(snapshot, this.outcome, now), aura, actionMs: actionLength(f), timeScale });

    const vanished = f.action === 'special' && f.phase === 'startup' && f.currentSpecial?.type === 'teleport';
    const turns = f.action === 'special' && f.phase === 'startup' ? (f.currentSpecial?.spinTurns ?? 0) : 0;
    const turn = turns > 0 ? f.phaseProgress * turns * Math.PI * 2 : 0;
    const raw = Math.cos(turn);
    // Never fully zero: a flat 3D transform cannot be inverted for lighting.
    const spin = Math.abs(raw) < 0.05 ? (raw < 0 ? -0.05 : 0.05) : raw;
    this.puppet.place(f.x, f.y - lift, f.facing, angle, vanished ? 0.2 : 1, spin, turn);
    if (f.burning && now >= this.nextEmber) {
      this.nextEmber = now + EMBER_EVERY_MS;
      this.emitEmber(f);
    }

    const hb = f.hitbox;
    this.hitbox.setVisible(hb !== null);
    if (hb) {
      const s = this.toScreen(hb.x, hb.y);
      this.hitbox.setPosition(s.x, s.y).setSize(hb.width * s.zoom, hb.height * s.zoom);
    }
  }

  private emitEmber(f: FighterSnapshot): void {
    const { width, height } = f.data.body;
    const at = this.toScreen(f.x + (Math.random() - 0.5) * width * 0.9, f.y - Math.random() * height * 0.95);
    const ember = this.scene.add
      .circle(at.x, at.y, (4 + Math.random() * 5) * at.zoom, Phaser.Utils.Array.GetRandom(EMBER_COLORS))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(12);
    this.scene.tweens.add({
      targets: ember,
      x: at.x + (Math.random() - 0.5) * 16 * at.zoom,
      y: at.y - (35 + Math.random() * 35) * at.zoom,
      scale: 0.2,
      alpha: 0,
      duration: 420 + Math.random() * 200,
      ease: 'Quad.easeOut',
      onComplete: () => ember.destroy(),
    });
  }
}
