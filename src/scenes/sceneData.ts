import type Phaser from 'phaser';
import { ARENA_IDS, DEFAULT_ARENA, type ArenaId } from '../content/arenas';
import type { Difficulty } from '../core/ai/difficulty';

export const SceneKey = {
  Boot: 'Boot',
  Menu: 'Menu',
  CharacterSelect: 'CharacterSelect',
  Fight: 'Fight',
  Result: 'Result',
} as const;

export type GameMode = 'cpu' | 'local';

export type { Difficulty };

export interface CharacterSelectData {
  mode: GameMode;
  difficulty: Difficulty;
}

export interface FightData {
  mode: GameMode;
  difficulty: Difficulty;
  p1: string;
  p2: string;
  /** 1-based round number; defaults to 1. */
  round?: number;
  /** Rounds won so far by [P1, P2]; defaults to [0, 0]. */
  wins?: readonly [number, number];
}

export interface ResultData extends FightData {
  /** Index of the winning player, or null for a draw. */
  winner: 0 | 1 | null;
}

const ARENA_KEY = 'arena';

/** The arena picked on the menu; it is remembered for the rest of the session. */
export const getArena = (registry: Phaser.Data.DataManager): ArenaId => {
  const id = registry.get(ARENA_KEY) as ArenaId | undefined;
  return id && ARENA_IDS.includes(id) ? id : DEFAULT_ARENA;
};

export const setArena = (registry: Phaser.Data.DataManager, id: ArenaId): void => {
  registry.set(ARENA_KEY, id);
};
