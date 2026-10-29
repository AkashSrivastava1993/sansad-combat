import type { HitboxData } from '../characters/types';
import { GAME_WIDTH } from '../config';

export interface Rect {
  /** Top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Centre of the intersection of two overlapping rects. */
export const overlapCenter = (a: Rect, b: Rect): { x: number; y: number } => {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
};

/** Keeps a body of the given width fully inside the arena. */
export const clampToArena = (x: number, bodyWidth: number): number =>
  Math.min(GAME_WIDTH - bodyWidth / 2, Math.max(bodyWidth / 2, x));

/** World-space box for a hitbox defined relative to a fighter at (x, y) facing `facing`. */
export const forwardRect = (x: number, y: number, facing: 1 | -1, h: HitboxData): Rect => ({
  x: facing === 1 ? x + h.x : x - h.x - h.width,
  y: y - h.y,
  width: h.width,
  height: h.height,
});
