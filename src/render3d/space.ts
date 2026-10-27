import { GAME_WIDTH, GROUND_Y } from '../config';

/** World units per game px: the fight plane is z = 0, the floor y = 0 and x = 0 is the arena centre. */
export const PX = 0.01;
export const DEG = Math.PI / 180;

export const worldX = (gx: number): number => (gx - GAME_WIDTH / 2) * PX;
export const worldY = (gy: number): number => (GROUND_Y - gy) * PX;
