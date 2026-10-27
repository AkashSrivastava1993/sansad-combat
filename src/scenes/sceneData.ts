import type { Difficulty } from '../systems/ai/difficulty';

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
