import type { FighterData, Pose, SpecialType } from '../characters/types';
import { RIG } from './defaults';
import type { Expression } from './expression';
import { fullPose, lerpPose, phasePose, resolvePoses, type StaticEntry } from './pose';

/** Everything a renderer needs to draw a fighter for one frame. */
export interface RigFrame {
  pose: Pose;
  expression: Expression;
  /** Seconds; drives cloth sway. */
  time: number;
  /** -1..1: how hard cloth trails behind (1 = moving forward at full speed). */
  wind: number;
  /** Feet are planted on the ground; otherwise the pose floats freely. */
  grounded: boolean;
  /** Extra lift in px, e.g. the idle bounce. */
  bob: number;
  aura?: { color: string; alpha: number };
}

export type Outcome = 'win' | 'lose' | null;

/** What the animator needs to know about a fighter, independent of the combat classes. */
export interface RigSnapshot {
  state: 'idle' | 'walk' | 'jump' | 'block' | 'attack' | 'special' | 'hitstun' | 'ko';
  phase: 'startup' | 'active' | 'recovery';
  /** 0-1 through the current attack phase. */
  progress: number;
  heavy: boolean;
  special: SpecialType | null;
  vx: number;
  facing: 1 | -1;
  grounded: boolean;
}

export type AnimFrame = Omit<RigFrame, 'aura'>;

const FREE_STATES = new Set<RigSnapshot['state']>(['idle', 'walk', 'block', 'jump']);

/** Turns fighter state into a smoothly eased pose and facial expression. */
export class RigAnimator {
  private readonly poses;
  private current: Pose | null = null;
  private walkPhase = 0;
  private lastNow: number | null = null;
  private lastState: RigSnapshot['state'] | null = null;
  private stateSince = 0;
  private readonly blinkOffset = Math.random() * RIG.blink.everyMs;

  constructor(data: FighterData) {
    this.poses = resolvePoses(data);
  }

  /** A fixed pose for menus and cards. */
  static still(data: FighterData, name: 'idle' | 'victory', timeSec = 0): AnimFrame {
    const entry = resolvePoses(data).statics[name];
    const { pose, bob } = RigAnimator.applyMotion(entry, timeSec);
    return { pose, bob, expression: name === 'victory' ? 'win' : 'neutral', time: timeSec, wind: 0, grounded: true };
  }

  private static applyMotion(entry: StaticEntry, t: number): { pose: Pose; bob: number } {
    const phase = Math.sin(2 * Math.PI * entry.bobSpeed * t);
    const pose = fullPose(entry.pose);
    pose.frontArm[0] += entry.sway * 0.5 * phase;
    pose.frontArm[1] += entry.sway * phase;
    pose.backArm[1] += entry.sway * Math.sin(2 * Math.PI * entry.bobSpeed * t + 1.3);
    return { pose, bob: entry.bobAmp * (0.5 + 0.5 * phase) };
  }

  update(s: RigSnapshot, outcome: Outcome, nowMs: number): AnimFrame {
    const t = nowMs / 1000;
    const dt = this.lastNow === null ? 0 : Math.min(0.1, (nowMs - this.lastNow) / 1000);
    this.lastNow = nowMs;
    if (s.state !== this.lastState) {
      this.lastState = s.state;
      this.stateSince = nowMs;
    }
    const age = nowMs - this.stateSince;
    const { statics } = this.poses;
    const rest = statics.idle.pose;

    let target: Pose = rest;
    let bob = 0;
    let rate: number = RIG.ease.relaxed;
    let expression: Expression = 'neutral';

    const settled = outcome !== null && FREE_STATES.has(s.state);
    if (s.state === 'ko') {
      target = lerpPose(statics.hit.pose, statics.ko.pose, Math.min(1, age / RIG.koBlendMs));
      expression = 'ko';
    } else if (s.state === 'hitstun') {
      target = fullPose(statics.hit.pose);
      target.lean += RIG.hitRecoil.lean * Math.exp(-age / RIG.hitRecoil.decayMs);
      expression = 'hurt';
      rate = RIG.ease.action;
    } else if (s.state === 'attack' || s.state === 'special') {
      const keys = s.state === 'special' ? this.poses.special : s.heavy ? this.poses.kick : this.poses.punch;
      target = phasePose(keys, rest, s.phase, s.progress);
      expression = s.phase === 'startup' ? 'focus' : s.phase === 'active' ? 'shout' : 'neutral';
      rate = RIG.ease.action;
    } else if (settled) {
      const entry = statics[outcome === 'win' ? 'victory' : 'lose'];
      ({ pose: target, bob } = RigAnimator.applyMotion(entry, t));
      expression = outcome === 'win' ? 'win' : 'lose';
    } else if (s.state === 'block') {
      target = statics.block.pose;
      expression = 'grit';
    } else if (s.state === 'jump') {
      target = statics.jump.pose;
    } else if (s.state === 'walk') {
      this.walkPhase += (Math.PI * s.vx * s.facing * dt) / RIG.walk.stridePx;
      const w = RIG.walk;
      const p = this.walkPhase;
      target = fullPose(rest, {
        lean: w.lean,
        frontLeg: [w.legSwing * Math.sin(p), w.kneeFlex * Math.max(0, Math.cos(p))],
        backLeg: [w.legSwing * Math.sin(p + Math.PI), w.kneeFlex * Math.max(0, Math.cos(p + Math.PI))],
        frontArm: [rest.frontArm[0] + w.armSwing * Math.sin(p + Math.PI), rest.frontArm[1]],
        backArm: [rest.backArm[0] + w.armSwing * Math.sin(p), rest.backArm[1]],
      });
      bob = w.bob * Math.abs(Math.sin(p));
    } else {
      ({ pose: target, bob } = RigAnimator.applyMotion(statics.idle, t));
    }

    this.current = this.current ? lerpPose(this.current, target, 1 - Math.exp(-rate * dt)) : target;

    if (expression === 'neutral' && (nowMs + this.blinkOffset) % RIG.blink.everyMs < RIG.blink.forMs) {
      expression = 'blink';
    }
    return {
      pose: this.current,
      bob,
      expression,
      time: t,
      wind: Math.max(-1, Math.min(1, (s.vx * s.facing) / 300)),
      grounded: s.grounded,
    };
  }
}
