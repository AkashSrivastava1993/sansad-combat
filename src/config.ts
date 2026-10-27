import type { SpecialType } from './characters/types';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const GROUND_Y = 470;
export const GRAVITY = 2400;

export const P1_START_X = 300;
export const P2_START_X = 660;

// Match flow
export const ROUND_TIME_MS = 99_000;
/** Best-of-3: first to this many round wins takes the match. */
export const ROUNDS_TO_WIN = 2;
export const ROUND_INTRO_MS = 1000;
export const FIGHT_BANNER_MS = 600;
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

// Screen shake on impact; intensity scales with damage relative to SHAKE_REF_DAMAGE (clamped to 0.5-1.5x).
export const HIT_SHAKE = { ms: 90, intensity: 0.006 };
export const BLOCK_SHAKE = { ms: 40, intensity: 0.002 };
export const SHAKE_REF_DAMAGE = 12;

// Hit sparks
export const SPARK_BASE_COUNT = 6;
export const SPARK_COUNT_PER_DAMAGE = 0.5;
export const SPARK_LIFETIME_MS = 260;

// K.O. presentation
export const KO_SHAKE = { ms: 450, intensity: 0.016 };
export const KO_FLASH_MS = 160;
/** Real-time length of the slow-motion, and the speed multiplier during it. */
export const KO_SLOWMO_MS = 800;
export const KO_SLOWMO_SCALE = 0.25;
export const KO_FALL_MS = 700;
export const KO_LAUNCH_HEIGHT = 50;

// Knockdowns from special moves: fall, lie for the rest of the hitstun, then spring back up.
export const KNOCKDOWN_FALL_MS = 420;
export const KNOCKDOWN_RISE_MS = 320;
export const KNOCKDOWN_LAUNCH_HEIGHT = 36;
export const KNOCKDOWN_SHAKE = { ms: 260, intensity: 0.012 };
export const KNOCKDOWN_FLASH_MS = 90;

export const FONT_FAMILY = 'Arial, Helvetica, sans-serif';

// Factions shown as banners on the character select screen; list order is display order.
export interface FactionStyle {
  color: string;
  blurb: string;
}

export const FACTIONS: Record<string, FactionStyle> = {
  'Gathbandhan Alliance': { color: '#2b8c8c', blurb: 'Many parties, one very long press conference' },
  'Rashtriya Morcha': { color: '#b5452c', blurb: 'One front, zero dissent (officially)' },
};
/** Banner style for a faction missing from FACTIONS. */
export const DEFAULT_FACTION_STYLE: FactionStyle = { color: '#5a6490', blurb: '' };

// Taunt speech bubbles at the start of a round
export const TAUNT_SHOW_MS = 1700;

export const SPECIAL_TYPE_LABELS: Record<SpecialType, string> = {
  projectile: 'Projectile',
  dash: 'Dash strike',
  shield: 'Shield',
  stun: 'Area stun',
  teleport: 'Teleport strike',
  summon: 'Summon',
  pour: 'Divine pour',
};
