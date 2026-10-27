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

export type SpecialType = 'projectile' | 'dash' | 'shield' | 'stun' | 'teleport' | 'summon' | 'pour';

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
export type SpecialFxId = 'constitution' | 'bulldozer' | 'cycle' | 'lathi' | 'panja' | 'broom' | 'mic';

/** Optional behaviour shared by projectile specials and the entities they spawn. */
export interface ProjectileExtras {
  /** Keeps travelling after its hit (it still hits only once) until it leaves the arena. */
  pierce?: boolean;
  /** Stops `standOffX` short of the opponent, strikes `strikes` times on a `beatMs` rhythm, then runs back out (or ends on the spot when `vanish`). */
  volley?: { standOffX: number; strikes: number; beatMs: number; vanish?: boolean };
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
  /** `edge`: enters from the arena edge behind the user instead of from their hand. */
  spawnFrom?: 'self' | 'edge';
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

/**
 * Rises into the sky during startup, glides above the opponent, pours a stream straight down while active and
 * floats back down in recovery. Untouchable for the whole move.
 */
export interface PourSpecial extends SpecialBase, HitProps {
  type: 'pour';
  /** How high the feet rise above the ground, px. */
  riseHeight: number;
  /** Where the stream leaves the kettle: forward of the body centre and height above the feet. */
  spoutX: number;
  spoutY: number;
  /** Width of the stream. */
  width: number;
  /** px/s the fighter drifts to keep the stream on the opponent while pouring. */
  trackSpeed: number;
  /** "#rrggbb" of the liquid; defaults to the fighter's colour. */
  color?: string;
}

export type SpecialData =
  | ProjectileSpecial
  | DashSpecial
  | ShieldSpecial
  | StunSpecial
  | TeleportSpecial
  | SummonSpecial
  | PourSpecial;

export type LookShape = 'rect' | 'ellipse' | 'triangle';

/** Colour token ("primary", "secondary", "accent", "skin", "dark") or "#rrggbb". */
export type ColorRef = string;

export interface FighterPalette {
  secondary: string;
  accent: string;
  skin: string;
  dark: string;
}

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

export interface LookPoses {
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

/** Pixel sizes; legLength + torsoHeight + neck + headHeight should equal body.height. */
export interface Proportions {
  legLength: number;
  torsoHeight: number;
  neck: number;
  headWidth: number;
  headHeight: number;
  shoulderWidth: number;
  waistWidth: number;
  /** Gap between the hip joints. */
  hipWidth: number;
  upperArm: number;
  foreArm: number;
  armWidth: number;
  legWidth: number;
  footLength: number;
}

export type HairStyle = 'bald' | 'short' | 'messy' | 'slick' | 'long' | 'bun' | 'volume' | 'braid';
export type EyeStyle = 'round' | 'narrow' | 'wide';
export type MouthStyle = 'flat' | 'smile' | 'smirk' | 'open';

export interface FaceData {
  eyes: EyeStyle;
  brows: { thickness: number; color: ColorRef; /** Degrees; positive slopes down towards the nose. */ tilt?: number };
  /** Resting mouth; expressions override it. */
  mouth: MouthStyle;
  /** Shadowed bags under the eyes. */
  tired?: boolean;
}

export type PropAnchor = 'head' | 'torso' | 'back' | 'handFront' | 'handBack' | 'feet';

export type OutfitLayer =
  | { type: 'kurta'; color: ColorRef; trim?: ColorRef; /** Hem drop below the waist, px. */ length: number; flare?: number }
  | { type: 'vest'; color: ColorRef; trim?: ColorRef; /** Fraction of the torso covered; default 0.85. */ length?: number }
  | { type: 'shawl'; color: ColorRef; trim?: ColorRef; tail: number; /** Constant breeze, -1..1, added to the motion wind. */ wind?: number }
  | { type: 'scarf'; color: ColorRef; band?: ColorRef; tail: number; wind?: number; /** Band thickness in px; default 14. */ thickness?: number }
  | { type: 'checks'; color: ColorRef; rows: number; cols: number; thickness?: number }
  | { type: 'cap'; style: 'topi' | 'woolen' | 'crown' | 'band' | 'turban' | 'hardhat'; color: ColorRef; trim?: ColorRef; /** Turban tail length in px. */ tail?: number }
  | { type: 'moustache'; style: 'handlebar' | 'thick' | 'thin'; color: ColorRef }
  | { type: 'beard'; style: 'full' | 'goatee' | 'stubble'; color: ColorRef; size?: number }
  | { type: 'glasses'; style: 'round' | 'shades' | 'pushed'; color: ColorRef; /** Rim thickness in px. */ thickness?: number }
  | {
      type: 'shape';
      anchor: PropAnchor;
      layer?: 'behind' | 'front';
      shape: LookShape;
      /** Centre relative to the anchor, x forward and y up. */
      x: number;
      y: number;
      width: number;
      height: number;
      color: ColorRef;
      /** Clockwise degrees; triangles point up at 0. */
      angle?: number;
      /** 0-1; use for glows. */
      alpha?: number;
    };

export interface FighterLook {
  proportions: Proportions;
  head?: { shape: 'oval' | 'round' | 'square' };
  hair: { style: HairStyle; color: ColorRef; /** Highlight streak painted across the front. */ streak?: ColorRef };
  face: FaceData;
  base?: { top?: ColorRef; pants?: ColorRef; shoes?: ColorRef; /** Defaults to `top`. */ sleeveColor?: ColorRef; sleeves?: 'long' | 'short' | 'none' };
  outfit?: OutfitLayer[];
  poses?: LookPoses;
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
 * Layered SVG art driven by the same poses as the procedural rig. Art-space values are in the units of the
 * SVG canvas (see manifest.json); angles are degrees from straight down, forward positive.
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

export interface FighterData {
  id: string;
  name: string;
  /** Signature colour; also the palette's primary. */
  color: string;
  /** Group shown on the character select screen; fights are always between different factions. */
  faction: string;
  palette?: FighterPalette;
  /** Layered-shape rig description; a plain look is generated from the body size when absent. */
  look?: FighterLook;
  /** Layered SVG art; the procedural `look` is used when it is absent or fails to load. */
  svg?: SvgConfig;
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
