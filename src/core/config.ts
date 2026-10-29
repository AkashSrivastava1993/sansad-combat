// Gameplay constants. Presentation settings (shake, sparks, fonts, factions) live in src/config.ts.

/** Width of the fight plane; fighters and projectiles live in [0, GAME_WIDTH] game px. */
export const GAME_WIDTH = 960;

export const GROUND_Y = 470;
export const GRAVITY = 2400;

export const P1_START_X = 300;
export const P2_START_X = 660;

/** Longest simulated step; a longer frame is clamped so a stall cannot tunnel through hits. */
export const MAX_FRAME_MS = 50;

// Match flow
export const ROUND_TIME_MS = 99_000;
/** Best-of-3: first to this many round wins takes the match. */
export const ROUNDS_TO_WIN = 2;
export const ROUND_INTRO_MS = 1000;
export const ROUND_OUTRO_MS = 2000;

// Combat
export const BLOCK_CHIP_RATIO = 0.1;
export const BLOCK_KNOCKBACK_RATIO = 0.4;
/** Fraction of horizontal velocity kept after one second while grounded and not walking. */
export const SLIDE_RETENTION = 0.002;

// Energy meter
export const ENERGY_MAX = 100;
/** Energy gained per point of damage dealt / taken. */
export const ENERGY_PER_DAMAGE_DEALT = 0.8;
export const ENERGY_PER_DAMAGE_TAKEN = 1.2;

/** Both fighters freeze for this long when a hit lands, so it reads as an impact. */
export const HIT_STOP_MS = { hit: 60, block: 30, special: 110, slam: 150, ko: 180 };

/** Kicks alternate between a low one (the move's own hitbox) and this high one at head height. */
export const HIGH_KICK = { top: 128, height: 40, extraStartupMs: 40, reachTrimPx: 4 };

/** Grab and slam: beats blocking, but is slow and easy to jump or back away from. */
export const GRAB = {
  startupMs: 140,
  /** How long the grabbing hands can catch someone. */
  windowMs: 90,
  liftMs: 380,
  slamMs: 170,
  recoveryMs: 380,
  whiffRecoveryMs: 480,
  /** Reach beyond the front of the body. */
  reachPx: 62,
  /** Slam damage as a multiple of the fighter's heavy-kick damage. */
  damageRatio: 1.7,
  hitstunMs: 1100,
  knockback: 380,
  /** Height of the held fighter's feet over the ground, as a share of the thrower's height. */
  holdHeight: 1.2,
  holdBehindPx: 60,
  landAheadPx: 45,
};

// Time scaling: slow-motion changes how fast the simulation runs relative to real time.
/** Real-time length of the K.O. slow-motion, and the speed multiplier during it. */
export const KO_SLOWMO_MS = 800;
export const KO_SLOWMO_SCALE = 0.25;
/** Whole fight runs at this speed while a special is on screen so its effect can be seen. */
export const SPECIAL_SLOW_SCALE = 0.6;
/** Extra slow-motion beat when a special connects. */
export const SPECIAL_HIT_SLOWMO = { ms: 450, scale: 0.3 };
