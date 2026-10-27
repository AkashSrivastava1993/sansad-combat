import type { PhasedPose, Pose, SpecialType, StaticPose } from '../characters/types';

// Angle conventions are documented on `Pose`. Characters override any of these in their JSON `look.poses`.

export const IDLE_POSE: Pose = {
  lean: 4,
  headTilt: 0,
  frontArm: [28, 70],
  backArm: [-8, 55],
  frontLeg: [14, 8],
  backLeg: [-16, 10],
};

export const STATIC_POSES: Record<'idle' | 'victory' | 'lose' | 'jump' | 'block' | 'hit' | 'ko', StaticPose> = {
  idle: { ...IDLE_POSE, bobAmp: 2.5, bobSpeed: 1.6, sway: 4 },
  victory: {
    lean: -4,
    headTilt: -8,
    frontArm: [170, 15],
    backArm: [-25, 30],
    frontLeg: [12, 10],
    backLeg: [-14, 12],
    bobAmp: 6,
    bobSpeed: 2.4,
    sway: 6,
  },
  lose: {
    lean: 14,
    headTilt: 22,
    frontArm: [8, 10],
    backArm: [-6, 10],
    frontLeg: [8, 6],
    backLeg: [-8, 6],
    bobAmp: 0.8,
    bobSpeed: 0.8,
    sway: 0,
  },
  jump: {
    lean: 0,
    headTilt: -4,
    frontArm: [150, 30],
    backArm: [130, 30],
    frontLeg: [55, 85],
    backLeg: [-5, 75],
  },
  block: {
    lean: -6,
    headTilt: 0,
    frontArm: [75, 110],
    backArm: [55, 115],
    frontLeg: [40, 70],
    backLeg: [-20, 40],
  },
  hit: {
    lean: -20,
    headTilt: -16,
    frontArm: [-35, 15],
    backArm: [25, 40],
    frontLeg: [22, 24],
    backLeg: [-28, 12],
  },
  ko: {
    lean: -10,
    headTilt: -25,
    frontArm: [120, 5],
    backArm: [-100, 5],
    frontLeg: [35, 10],
    backLeg: [-30, 15],
  },
};

export const PUNCH_POSE: PhasedPose = {
  startup: { lean: -8, frontArm: [15, 125], backArm: [60, 100] },
  active: { lean: 16, headTilt: 4, frontArm: [88, 0], backArm: [40, 110] },
};

export const KICK_POSE: PhasedPose = {
  startup: { lean: -10, frontLeg: [60, 115], frontArm: [40, 90], backArm: [30, 90], backLeg: [-4, 5] },
  active: { lean: -20, frontLeg: [92, 0], frontArm: [-20, 30], backArm: [70, 40], backLeg: [-4, 5] },
};

export const SPECIAL_POSES: Record<SpecialType, PhasedPose> = {
  projectile: {
    startup: { lean: -10, frontArm: [40, 110], backArm: [30, 110] },
    active: { lean: 10, frontArm: [90, 0], backArm: [88, 0] },
  },
  dash: {
    startup: { lean: 12, frontArm: [-30, 40], backArm: [-45, 40], frontLeg: [35, 70], backLeg: [-30, 55] },
    active: { lean: 30, frontArm: [85, 0], backArm: [-60, 20], frontLeg: [70, 60], backLeg: [-50, 80] },
  },
  shield: {
    startup: { lean: -8, headTilt: 6, frontArm: [110, 130], backArm: [100, 130], frontLeg: [30, 60], backLeg: [-24, 50] },
    active: { lean: -8, headTilt: 6, frontArm: [110, 130], backArm: [100, 130], frontLeg: [30, 60], backLeg: [-24, 50] },
  },
  stun: {
    startup: { lean: -14, frontArm: [170, 10], backArm: [165, 10] },
    active: { lean: 22, frontArm: [40, 10], backArm: [35, 10], frontLeg: [30, 50], backLeg: [-28, 40] },
  },
  teleport: {
    startup: { lean: -4, frontArm: [110, 120], backArm: [100, 120] },
    active: { lean: 20, frontArm: [88, 0], backArm: [-40, 40] },
  },
  summon: {
    startup: { lean: -6, frontArm: [170, 20], backArm: [40, 60] },
    active: { lean: 8, frontArm: [90, 10], backArm: [40, 60] },
  },
  // Arms flung wide while ascending, then leaning over to tip the kettle.
  pour: {
    startup: { lean: -8, headTilt: -14, frontArm: [150, 25], backArm: [140, 25], frontLeg: [10, 30], backLeg: [-8, 40] },
    active: { lean: 16, headTilt: 18, frontArm: [80, 15], backArm: [150, 30], frontLeg: [14, 35], backLeg: [-6, 45] },
  },
};

export const RIG = {
  walk: {
    /** Distance covered per half stride, px. */
    stridePx: 60,
    legSwing: 32,
    kneeFlex: 38,
    armSwing: 30,
    lean: 6,
    bob: 3,
  },
  /** Seconds between blinks and how long one lasts. */
  blink: { everyMs: 3200, forMs: 140 },
  /** Smoothing rates (per second) when easing between poses; attacks snap faster. */
  ease: { relaxed: 14, action: 40 },
  /** Time over which the K.O. pose blends in. */
  koBlendMs: 180,
  /** Extra backward lean that decays right after a hit lands. */
  hitRecoil: { lean: -12, decayMs: 120 },
  /** Cloth swing speed (rad/s) and size (deg). */
  cloth: { speed: 2.3, swing: 5, windSwing: 22 },
} as const;
