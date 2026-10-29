import type { SpecialType } from './core/characters/types';

// Stage geometry and meter sizes come from the game core; renderers import them from here.
export { ENERGY_MAX, GAME_WIDTH, GROUND_Y, ROUNDS_TO_WIN } from './core/config';

/** Phaser canvas height. */
export const GAME_HEIGHT = 540;

export const FIGHT_BANNER_MS = 600;

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
  'INDI Alliance': { color: '#2b8c8c', blurb: 'Many parties, one very long press conference' },
  'NDA': { color: '#b5452c', blurb: 'One front, zero dissent (officially)' },
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
};
