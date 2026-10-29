import * as THREE from 'three';
import { FONT_FAMILY } from '../config';

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const TAU = Math.PI * 2;
const RANGOLI = ['#e63e8b', '#f6a21e', '#18a39b', '#f4efe1', '#7b3fc4', '#e8452c'];

/** A symmetrical floor mandala: rings of petals, diamonds, dots and a star, in powder colours. */
export const rangoliTexture = (): THREE.CanvasTexture =>
  canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = '#1c1226';
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.translate(512, 512);
    ctx.lineJoin = 'round';
    const ring = (n: number, draw: (i: number) => void): void => {
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.rotate((i * TAU) / n);
        draw(i);
        ctx.restore();
      }
    };
    const petal = (r0: number, r1: number, w: number, fill: string, stroke?: string): void => {
      const k = r1 - r0;
      ctx.beginPath();
      ctx.moveTo(0, -r0);
      ctx.bezierCurveTo(w, -r0 - k * 0.3, w * 0.6, -r1 + k * 0.25, 0, -r1);
      ctx.bezierCurveTo(-w * 0.6, -r1 + k * 0.25, -w, -r0 - k * 0.3, 0, -r0);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    };
    const dot = (y: number, r: number, fill: string): void => {
      ctx.beginPath();
      ctx.arc(0, y, r, 0, TAU);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const circle = (r: number, color: string, width: number): void => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    circle(498, '#f6c34a', 8);
    circle(484, '#f4efe1', 3);
    ring(72, (i) => dot(-466, 6, i % 2 ? '#f4efe1' : '#f6a21e'));
    ring(24, (i) => {
      petal(330, 455, 34, RANGOLI[i % 6]!, '#f4efe1');
      petal(352, 425, 15, '#1c1226');
    });
    ring(24, (i) => dot(-318, 5, RANGOLI[(i + 3) % 6]!));
    ring(36, (i) => {
      ctx.save();
      ctx.translate(0, -300);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = RANGOLI[(i * 2) % 6]!;
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
    });
    circle(282, '#f6c34a', 5);
    circle(268, '#f4efe1', 2);
    ring(16, (i) => {
      petal(140, 262, 40, RANGOLI[(i * 2 + 1) % 6]!, '#f4efe1');
      petal(165, 235, 17, RANGOLI[(i * 2 + 4) % 6]!);
    });
    // Twelve-pointed star {12/5} inside the lotus.
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i * 5 * TAU) / 12;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.sin(a) * 132, -Math.cos(a) * 132);
    }
    ctx.strokeStyle = '#f6c34a';
    ctx.lineWidth = 4;
    ctx.stroke();
    ring(8, (i) => petal(40, 118, 26, RANGOLI[(i * 3) % 6]!, '#f4efe1'));
    dot(0, 44, '#f6c34a');
    dot(0, 30, '#e63e8b');
    dot(0, 12, '#f4efe1');
  });

/** The curved wall behind the colonnade: a repeating arcade of dim, warm niches. */
export const wallTexture = (): THREE.CanvasTexture =>
  canvasTexture(2048, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#120a14');
    g.addColorStop(1, '#3a1f2a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2048, 512);
    const n = 32;
    const w = 2048 / n;
    for (let i = 0; i < n; i++) {
      const x = i * w + w * 0.15;
      const aw = w * 0.7;
      const top = 110;
      ctx.beginPath();
      ctx.moveTo(x, 512);
      ctx.lineTo(x, top + aw / 2);
      ctx.arc(x + aw / 2, top + aw / 2, aw / 2, Math.PI, 0);
      ctx.lineTo(x + aw, 512);
      ctx.closePath();
      const glow = ctx.createLinearGradient(0, top, 0, 512);
      glow.addColorStop(0, '#2a1626');
      glow.addColorStop(1, '#6a3d2c');
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });

/** Hanging banner: three horizontal stripes with a darker header and a gold fringe. */
export const flagTexture = (stripes: readonly string[]): THREE.CanvasTexture =>
  canvasTexture(64, 192, (ctx) => {
    const band = 192 / stripes.length;
    stripes.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, i * band, 64, band + 1);
    });
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = '#f6c34a';
    ctx.fillRect(0, 186, 64, 6);
    ctx.fillRect(0, 0, 3, 192);
    ctx.fillRect(61, 0, 3, 192);
  });

export const bannerTexture = (text: string, sub: string, color: string, w: number, h: number): THREE.CanvasTexture =>
  canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#10131f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(h * 0.42);
    ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    while (ctx.measureText(text).width > w * 0.88 && size > 10) ctx.font = `bold ${(size -= 2)}px ${FONT_FAMILY}`;
    ctx.fillText(text, w / 2, h * (sub ? 0.42 : 0.5));
    if (sub) {
      ctx.fillStyle = color;
      let subSize = Math.round(h * 0.16);
      ctx.font = `bold ${subSize}px ${FONT_FAMILY}`;
      while (ctx.measureText(sub).width > w * 0.9 && subSize > 8) ctx.font = `bold ${(subSize -= 1)}px ${FONT_FAMILY}`;
      ctx.fillText(sub, w / 2, h * 0.78);
    }
  });

/** Hindi slogans need a Devanagari face; the system one is used when the first is missing. */
const PLACARD_FONT = `${FONT_FAMILY}, 'Noto Sans Devanagari', 'Devanagari Sangam MN', Mangal, sans-serif`;
/** Line height as a multiple of the font size; Devanagari marks above and below the line need room. */
const LINE = 1.3;

/** A hand-painted placard: the slogan wrapped onto as many lines as it needs, in one big face. */
export const placardTexture = (text: string, bg: string, fg: string): THREE.CanvasTexture =>
  canvasTexture(512, 232, (ctx) => {
    const w = 512;
    const h = 232;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = text.split(' ');
    for (let size = 64; size >= 18; size -= 2) {
      ctx.font = `bold ${size}px ${PLACARD_FONT}`;
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > w - 70) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
      const fits = lines.every((l) => ctx.measureText(l).width <= w - 70) && lines.length * size * LINE <= h - 40;
      if (!fits && size > 18) continue;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * LINE));
      break;
    }
  });
