export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export interface AIProfile {
  /** Average time between decisions; also the AI's reaction delay. */
  reactionMs: number;
  /** Chance to attack when in range, per decision; otherwise it backs off. */
  aggression: number;
  /** Chance to block when a threat is detected, per decision. */
  blockChance: number;
  /** Chance to use the special when it is affordable and well positioned, per decision. */
  specialChance: number;
  /** How long a retreat lasts. */
  retreatMs: number;
  /** Chance to try a grab when in range, per decision; tripled against a blocker. */
  grabChance: number;
}

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  easy: { reactionMs: 450, aggression: 0.3, blockChance: 0.15, specialChance: 0.2, retreatMs: 700, grabChance: 0.04 },
  normal: { reactionMs: 250, aggression: 0.6, blockChance: 0.5, specialChance: 0.5, retreatMs: 500, grabChance: 0.08 },
  hard: { reactionMs: 120, aggression: 0.85, blockChance: 0.85, specialChance: 0.8, retreatMs: 300, grabChance: 0.14 },
};
