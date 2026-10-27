import type Phaser from 'phaser';

export interface V {
  x: number;
  y: number;
}

/** Everything is drawn as filled polygons so the same rig renders to Phaser and to a 2D canvas. */
export interface Painter {
  poly(points: readonly V[], color: string, alpha?: number): void;
}

export const v = (x: number, y: number): V => ({ x, y });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
export const lerpV = (a: V, b: V, t: number): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Rotates clockwise on screen (y down). */
export function rotate(p: V, deg: number): V {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function ellipsePoints(cx: number, cy: number, w: number, h: number, rotDeg = 0, n = 16): V[] {
  const pts: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(add({ x: cx, y: cy }, rotate({ x: (Math.cos(a) * w) / 2, y: (Math.sin(a) * h) / 2 }, rotDeg)));
  }
  return pts;
}

export const circlePoints = (cx: number, cy: number, r: number, n = 12): V[] => ellipsePoints(cx, cy, r * 2, r * 2, 0, n);

/** A thick segment with round ends. */
export function line(p: Painter, a: V, b: V, width: number, color: string, alpha?: number): void {
  const d = sub(b, a);
  const len = Math.hypot(d.x, d.y) || 1;
  const n = { x: (-d.y / len) * (width / 2), y: (d.x / len) * (width / 2) };
  p.poly([add(a, n), add(b, n), sub(b, n), sub(a, n)], color, alpha);
  p.poly(circlePoints(a.x, a.y, width / 2, 8), color, alpha);
  p.poly(circlePoints(b.x, b.y, width / 2, 8), color, alpha);
}

export function polyline(p: Painter, pts: readonly V[], width: number, color: string, alpha?: number): void {
  for (let i = 0; i < pts.length - 1; i++) line(p, pts[i]!, pts[i + 1]!, width, color, alpha);
}

const toInt = (hex: string): number => parseInt(hex.slice(1), 16);

export class PhaserPainter implements Painter {
  constructor(private readonly g: Phaser.GameObjects.Graphics) {}

  poly(points: readonly V[], color: string, alpha = 1): void {
    this.g.fillStyle(toInt(color), alpha);
    this.g.fillPoints(points as V[], true, true);
  }
}

export class CanvasPainter implements Painter {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  poly(points: readonly V[], color: string, alpha = 1): void {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
