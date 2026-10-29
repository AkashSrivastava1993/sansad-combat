export type MoveName = 'light' | 'heavy';

/** Box in world units relative to the fighter, assuming the fighter faces right. */
export interface HitboxData {
  /** Distance forward from the body centre to the box's near edge. */
  x: number;
  /** Height of the box's top edge above the feet. */
  y: number;
  width: number;
  height: number;
}

/** Damage over time left by a clean (unblocked) hit; a fresh burn replaces the old one. */
export interface BurnEffect {
  damagePerSec: number;
  durationMs: number;
}

export interface HitProps {
  damage: number;
  hitstunMs: number;
  blockstunMs: number;
  /** Horizontal launch speed (px/s) applied to the defender. */
  knockback: number;
  /** Ignores blocking: the hit lands for full damage and stun even against a blocker. */
  guardBreak?: boolean;
  burn?: BurnEffect;
  /** A clean hit floors the defender for the hitstun; they cannot be hit again until they are up. */
  knockdown?: boolean;
  /** Comic-book word shown at the point of a clean hit. */
  impact?: string;
}

export interface MoveData extends HitProps {
  startupMs: number;
  activeMs: number;
  recoveryMs: number;
  hitbox: HitboxData;
}

export type SpecialType = 'projectile' | 'dash' | 'shield' | 'stun' | 'teleport' | 'summon';

interface SpecialBase {
  name: string;
  /** One-line player-facing explanation shown on the character select screen. */
  description: string;
  /** Replaces the special-type label on the character select screen. */
  label?: string;
  /** Full turns the fighter spins on the spot during startup. */
  spinTurns?: number;
  /** Energy spent on use. */
  cost: number;
  /** Lockout after use, counted from the moment it starts. */
  cooldownMs: number;
  startupMs: number;
  /** Projectile/summon: spawn window (spawns once at its start). Dash/stun/teleport: strike window. Shield: shield duration. */
  activeMs: number;
  recoveryMs: number;
}

/** Special-move effects that draw their own projectiles; see src/ui/specials. */
export type SpecialFxId = 'constitution' | 'bulldozer' | 'cycle' | 'lathi' | 'panja' | 'broom' | 'mic' | 'baarish' | 'jaadu';

/** Optional behaviour shared by projectile specials and the entities they spawn. */
export interface ProjectileExtras {
  /** Keeps travelling after its hit (it still hits only once) until it leaves the arena. */
  pierce?: boolean;
  /** Stops `standOffX` short of the opponent, strikes `strikes` times on a `beatMs` rhythm, then runs back out (or ends on the spot when `vanish`); `delayMs` waits before the first beat. */
  volley?: { standOffX: number; strikes: number; beatMs: number; vanish?: boolean; delayMs?: number };
  /** Overrides for a volley's last strike. */
  finisher?: Partial<HitProps>;
  fx?: SpecialFxId;
}

export interface ProjectileSpecial extends SpecialBase, HitProps, ProjectileExtras {
  type: 'projectile';
  /** px/s */
  speed: number;
  width: number;
  height: number;
  /** Height of the projectile's top edge above the feet. */
  y: number;
  /** Distance forward from the body centre where it spawns. */
  spawnX: number;
  /** `edge`: enters from the arena edge behind the user; `opponent`: appears on the opponent's spot. */
  spawnFrom?: 'self' | 'edge' | 'opponent';
  lifetimeMs: number;
  /** "#rrggbb"; defaults to the fighter's colour. */
  color?: string;
}

export interface DashSpecial extends SpecialBase, HitProps {
  type: 'dash';
  /** px/s while active. */
  speed: number;
  hitbox: HitboxData;
}

/** `damage` plus `reflectRatio` of the absorbed hit's damage is reflected to whoever strikes the shield. */
export interface ShieldSpecial extends SpecialBase {
  type: 'shield';
  damage: number;
  reflectRatio?: number;
}

export interface StunSpecial extends SpecialBase, HitProps {
  type: 'stun';
  /** Box centred on the fighter, bottom at the feet; hits both sides. */
  area: { width: number; height: number };
}

/** Vanishes during startup, reappears behind the opponent and strikes. */
export interface TeleportSpecial extends SpecialBase, HitProps {
  type: 'teleport';
  /** Distance past the opponent's centre where the user reappears. */
  behindOffset: number;
  hitbox: HitboxData;
}

/** A helper appears beside the opponent, then lands a single strike after `strikeDelayMs`. */
export interface SummonSpecial extends SpecialBase, HitProps {
  type: 'summon';
  /** Distance from the opponent's centre, on the summoner's side. */
  offsetX: number;
  width: number;
  height: number;
  /** Height of the helper's strike box top edge above the feet. */
  y: number;
  strikeDelayMs: number;
  /** Total time the helper stays on stage; the strike window is what remains after the delay. */
  lifetimeMs: number;
}

export type SpecialData =
  | ProjectileSpecial
  | DashSpecial
  | ShieldSpecial
  | StunSpecial
  | TeleportSpecial
  | SummonSpecial;

/**
 * Pose angles in degrees, measured from straight down with forward (towards the opponent) positive:
 * 90 points forward, 180 straight up. Arms are [shoulder, elbow] with the forearm at shoulder + elbow;
 * legs are [hip, knee] with the shin at hip - knee. `lean` tips the torso forward.
 */
export interface Pose {
  lean: number;
  headTilt: number;
  frontArm: [number, number];
  backArm: [number, number];
  frontLeg: [number, number];
  backLeg: [number, number];
}

export interface PoseMotion {
  /** Vertical bounce in px. */
  bobAmp?: number;
  /** Bounces per second. */
  bobSpeed?: number;
  /** Arm sway in degrees. */
  sway?: number;
}

export type StaticPose = Partial<Pose> & PoseMotion;
export type PhasedPose = Partial<Record<'startup' | 'active' | 'recovery', Partial<Pose>>>;

/** Per-character overrides of the default poses; anything omitted falls back to `rig/defaults`. */
export interface PoseOverrides {
  idle?: StaticPose;
  victory?: StaticPose;
  lose?: StaticPose;
  jump?: StaticPose;
  block?: StaticPose;
  hit?: StaticPose;
  ko?: StaticPose;
  punch?: PhasedPose;
  kick?: PhasedPose;
  special?: PhasedPose;
}

export type Pair = [number, number];

/** Drawing order of the layers an SVG fighter is split into; `legs` becomes the two leg layers. */
export type SvgLayerId =
  | 'back'
  | 'arm-back'
  | 'arm-back-lower'
  | 'leg-back'
  | 'leg-front'
  | 'torso'
  | 'head'
  | 'arm-front'
  | 'arm-front-lower'
  | 'prop';

/**
 * Layered SVG art. Art-space values are in the units of the SVG canvas (see manifest.json); angles are degrees
 * from straight down, forward positive.
 */
export interface SvgConfig {
  /** Id of the fighter in assets/characters/manifest.json. */
  id: string;
  /** Game pixels per art unit. */
  scale: number;
  pivots: {
    shoulderBack: Pair;
    shoulderFront: Pair;
    hipBack: Pair;
    hipFront: Pair;
    neck: Pair;
    /** Sole of each foot, used to keep the lower foot on the ground. */
    footBack: Pair;
    footFront: Pair;
    /** Needed only when the SVG splits an arm into `*-upper` / `*-lower` groups. */
    elbowBack?: Pair;
    elbowFront?: Pair;
  };
  /** Which arm the held prop rides on. */
  propFollows: 'arm-front' | 'arm-back' | 'none';
  anim: {
    /** Angle each limb is drawn at in the art; for split arms `armBack`/`armFront` are the upper arm. */
    restAngles: {
      armBack: number;
      armFront: number;
      legBack: number;
      legFront: number;
      armBackLower?: number;
      armFrontLower?: number;
    };
    /** Share of the elbow bend folded into the single straight arm segment. */
    elbowWeight: number;
    /** Elbow angle of the character's idle pose; arm reach is zero here. */
    restElbow: number;
    /** Elbow angle at which the arm is fully folded in. */
    extendElbow: number;
    /** Art units the arm slides along itself between folded and fully extended. */
    reach: number;
    /** Share of the knee bend folded into the straight leg. */
    kneeWeight: number;
    leanScale: number;
    headScale: number;
    bobScale: number;
    /** The `back` layer (cape, pallu, backpack) swings about `pivot` and lags behind movement. */
    cloth: { pivot: Pair; windSwing: number; swing: number; speed: number; /** Catch-up rate per second; lower lags more. */ lag: number; breeze: number };
  };
}

export type HairStyle = 'bald' | 'short' | 'bun' | 'curly' | 'wavy';
export type PropKind = 'kettle' | 'broom' | 'mic';

/** Look of the low-poly 3D figure drawn in the 3D arena; every colour is "#rrggbb". */
export interface FigureConfig {
  skin: string;
  /** Body width multiplier; 1 is average. */
  bulk?: number;
  hair?: { style: HairStyle; color: string };
  beard?: { color: string; length: 'short' | 'full' | 'long' };
  /** Colour of a moustache. */
  moustache?: string;
  /** `frame` is a pair of thin rectangular frames with arms; `clear` round rims; `dark` solid dark lenses. */
  glasses?: 'clear' | 'dark' | 'frame';
  /** A cloth cap with a band, e.g. a Gandhi topi. */
  topi?: { color: string; band?: string };
  earring?: boolean;
  /** Shirt or kurta; `sleeves` defaults to bare skin and `length` knee hangs a kurta over the thighs. */
  top: { color: string; sleeves?: string; length: 'short' | 'knee' };
  /** Sleeveless jacket worn over the top. */
  vest?: string;
  /** Scarf hanging down the chest. */
  stole?: string;
  /** Thin vertical stripes on the skirt and pallu, e.g. a handloom saree. */
  stripes?: string;
  /** A watch on the front wrist. */
  watch?: string;
  /** Thin bangles on both wrists. */
  bangles?: string;
  /** Saree border: a diagonal band across the chest and the pallu edges. */
  border?: string;
  /** Trousers, or a long skirt (saree) when `skirt` is set; `trim` is the hem band. */
  bottom: { color: string; skirt?: boolean; trim?: string };
  /** Cloth hanging down the back, e.g. the end of a saree. */
  pallu?: string;
  shoes: string;
  /** Held in the front hand. */
  prop?: PropKind;
}

/** Animation states a 3D model can play; a fighter's current core action maps onto one of these. */
export type ModelAction = 'idle' | 'walk' | 'jump' | 'punch' | 'kick' | 'block' | 'hit' | 'ko' | 'win' | 'special';

export interface ModelClip {
  /** Name of the animation clip inside the GLB. */
  clip: string;
  /** Repeat while the action lasts; otherwise play once and hold the last frame. Defaults to true for idle, walk, block and win. */
  loop?: boolean;
  /** Playback speed multiplier; defaults to 1. */
  timeScale?: number;
  /** Crossfade seconds into this clip; defaults to the model's `fade`. */
  fade?: number;
  /** Stretch or squeeze the clip to the length of the move it plays for, so it lines up with the real attack timing. Defaults to true for punch, kick and special. */
  fit?: boolean;
}

/**
 * A rigged GLB that replaces the cut-out art in the 3D arena. Without a clip for an action the model falls back
 * (special -> kick -> punch -> idle, ko -> hit -> idle, anything else -> idle).
 */
export interface ModelConfig {
  /** Path of the GLB relative to the site root, e.g. "assets/models/didi.glb". */
  url: string;
  /** Uniform scale; 1 means one glTF unit (a metre) per world unit, so a 1.8 m model stands about 180 game px tall. */
  scale?: number;
  /** World units to raise (or sink, if negative) the model so its feet rest on the floor. */
  groundOffset?: number;
  /** Degrees to turn the model so it faces the opponent when facing right; 0 for the glTF convention of facing +z. */
  yaw?: number;
  /** Default crossfade between clips, in seconds. */
  fade?: number;
  /** Also pin the root bone's height; by default only its sideways travel is removed. */
  lockRootY?: boolean;
  /** Whether the model casts shadows on the floor; defaults to true. */
  castShadow?: boolean;
  /** Whether the model receives shadows from others; defaults to false. */
  receiveShadow?: boolean;
  /** Clip for each action; `idle` is required. */
  animations: { idle: string | ModelClip } & Partial<Record<Exclude<ModelAction, 'idle'>, string | ModelClip>>;
}

export interface FighterData {
  id: string;
  name: string;
  /** Signature colour, used by the HUD and special-move effects. */
  color: string;
  /** Group shown on the character select screen; fights are always between different factions. */
  faction: string;
  /** Layered SVG art; every fighter needs it. */
  svg: SvgConfig;
  /** Optional 3D model; when set, the 3D arena draws it instead of anything else. */
  model?: ModelConfig;
  /** Low-poly 3D figure drawn in the 3D arena when there is no `model`; without it the SVG art is used. */
  figure?: FigureConfig;
  poses?: PoseOverrides;
  /** Height in px used to scale this fighter on the select screen and result card. */
  previewHeight: number;
  /** Lines shown in a speech bubble at the start of a round; one is picked at random. */
  taunts?: string[];
  /** Quote on the result card when this fighter wins. */
  winQuote?: string;
  stats: {
    maxHealth: number;
    /** px/s */
    walkSpeed: number;
    /** px/s, upward */
    jumpVelocity: number;
  };
  body: { width: number; height: number };
  moves: Record<MoveName, MoveData>;
  special: SpecialData;
}
