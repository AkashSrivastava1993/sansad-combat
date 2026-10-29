import type { FighterData, PhasedPose, Pose, SpecialType, StaticPose } from '../core/characters/types';
import { HIGH_KICK_POSE, IDLE_POSE, KICK_POSE, PUNCH_POSE, SPECIAL_POSES, STATIC_POSES } from './defaults';

export type StaticName = keyof typeof STATIC_POSES;

export interface StaticEntry {
  pose: Pose;
  bobAmp: number;
  bobSpeed: number;
  sway: number;
}

export interface PhasedEntry {
  startup: Pose;
  active: Pose;
}

export interface ResolvedPoses {
  statics: Record<StaticName, StaticEntry>;
  punch: PhasedEntry;
  /** The low kick. */
  kick: PhasedEntry;
  highKick: PhasedEntry;
  special: PhasedEntry;
}

const copyPair = (p: readonly [number, number]): [number, number] => [p[0], p[1]];

export function fullPose(base: Pose, over?: Partial<Pose>): Pose {
  return {
    lean: over?.lean ?? base.lean,
    headTilt: over?.headTilt ?? base.headTilt,
    frontArm: copyPair(over?.frontArm ?? base.frontArm),
    backArm: copyPair(over?.backArm ?? base.backArm),
    frontLeg: copyPair(over?.frontLeg ?? base.frontLeg),
    backLeg: copyPair(over?.backLeg ?? base.backLeg),
  };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixPair = (a: readonly [number, number], b: readonly [number, number], t: number): [number, number] => [mix(a[0], b[0], t), mix(a[1], b[1], t)];

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    lean: mix(a.lean, b.lean, t),
    headTilt: mix(a.headTilt, b.headTilt, t),
    frontArm: mixPair(a.frontArm, b.frontArm, t),
    backArm: mixPair(a.backArm, b.backArm, t),
    frontLeg: mixPair(a.frontLeg, b.frontLeg, t),
    backLeg: mixPair(a.backLeg, b.backLeg, t),
  };
}

const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function staticEntry(name: StaticName, override: StaticPose | undefined): StaticEntry {
  const base = STATIC_POSES[name];
  const merged: StaticPose = { ...base, ...override };
  return {
    pose: fullPose(IDLE_POSE, merged),
    bobAmp: merged.bobAmp ?? 0,
    bobSpeed: merged.bobSpeed ?? 1,
    sway: merged.sway ?? 0,
  };
}

function phasedEntry(base: PhasedPose, override: PhasedPose | undefined, rest: Pose): PhasedEntry {
  const startup = fullPose(rest, { ...base.startup, ...override?.startup });
  const active = fullPose(startup, { ...base.active, ...override?.active });
  return { startup, active };
}

const cache = new WeakMap<FighterData, ResolvedPoses>();

/** Merges the defaults with the character's JSON overrides. */
export function resolvePoses(data: FighterData): ResolvedPoses {
  const hit = cache.get(data);
  if (hit) return hit;
  const o = data.poses;
  const statics = {
    idle: staticEntry('idle', o?.idle),
    victory: staticEntry('victory', o?.victory),
    lose: staticEntry('lose', o?.lose),
    jump: staticEntry('jump', o?.jump),
    block: staticEntry('block', o?.block),
    hit: staticEntry('hit', o?.hit),
    ko: staticEntry('ko', o?.ko),
  };
  const rest = statics.idle.pose;
  const type: SpecialType = data.special.type;
  const resolved: ResolvedPoses = {
    statics,
    punch: phasedEntry(PUNCH_POSE, o?.punch, rest),
    kick: phasedEntry(KICK_POSE, o?.kick, rest),
    highKick: phasedEntry(HIGH_KICK_POSE, undefined, rest),
    special: phasedEntry(SPECIAL_POSES[type], o?.special, rest),
  };
  cache.set(data, resolved);
  return resolved;
}

/** Eases the rest pose into the wind-up, snaps to the strike, then returns to rest. */
export function phasePose(keys: PhasedEntry, rest: Pose, phase: 'startup' | 'active' | 'recovery', progress: number): Pose {
  if (phase === 'startup') return lerpPose(rest, keys.startup, smooth(progress));
  if (phase === 'active') return lerpPose(keys.startup, keys.active, Math.min(1, progress * 4));
  return lerpPose(keys.active, rest, smooth(progress));
}
