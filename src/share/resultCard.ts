import { lookHeight } from '../characters/look';
import type { FighterData } from '../characters/types';
import { FONT_FAMILY } from '../config';
import { factionOf } from '../characters/registry';
import { RigAnimator } from '../rig/animator';
import { drawRig } from '../rig/draw';
import { CanvasPainter } from '../rig/painter';
import { hasSvg } from '../rig/svg/atlas';
import { drawSvgRig } from '../rig/svg/canvas';

const CARD_SIZE = 1080;

export interface CardData {
  /** Winning fighter, or null for a draw. */
  winner: FighterData | null;
  /** Shown instead of a single winner when the match is drawn. */
  fighters: readonly [FighterData, FighterData];
  /** Label such as "P1" for the winner. */
  winnerLabel: string | null;
  /** Rounds won by [P1, P2], when known. */
  score: readonly [number, number] | null;
  quote: string;
  footer: string;
}

const font = (size: number, style = 'bold') => `${style} ${size}px ${FONT_FAMILY}`;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** `scale` maps rig units to pixels; `mirror` makes the fighter face left. */
function drawFighter(
  ctx: CanvasRenderingContext2D,
  f: FighterData,
  cx: number,
  baseY: number,
  scale: number,
  pose: 'idle' | 'victory',
  mirror = false,
): void {
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(mirror ? -scale : scale, scale);
  const frame = RigAnimator.still(f, pose);
  if (f.svg && hasSvg(f.id)) drawSvgRig(ctx, f, frame);
  else drawRig(new CanvasPainter(ctx), f, frame);
  ctx.restore();
}

const MAX_FIGHTER_PX = 340;

export function renderResultCard(data: CardData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = CARD_SIZE / 2;
  const accent = data.winner?.color ?? '#8fa0ff';

  const bg = ctx.createLinearGradient(0, 0, 0, CARD_SIZE);
  bg.addColorStop(0, '#1d2540');
  bg.addColorStop(1, '#0b0d12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, CARD_SIZE, 16);
  ctx.fillRect(0, CARD_SIZE - 16, CARD_SIZE, 16);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#aab2d5';
  ctx.font = font(44);
  ctx.fillText('FIGHT NIGHT', cx, 95);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(120);
  ctx.fillText(data.winnerLabel ? `${data.winnerLabel} WINS` : 'DRAW', cx, 225);

  const baseY = 640;
  ctx.fillStyle = '#2a3148';
  ctx.fillRect(80, baseY, CARD_SIZE - 160, 6);
  if (data.winner) {
    drawFighter(ctx, data.winner, cx, baseY, Math.min(2.2, MAX_FIGHTER_PX / lookHeight(data.winner)), 'victory');
  } else {
    for (const [f, dx, mirror] of [
      [data.fighters[0], -170, false],
      [data.fighters[1], 170, true],
    ] as const) {
      drawFighter(ctx, f, cx + dx, baseY, Math.min(1.8, MAX_FIGHTER_PX / lookHeight(f)), 'idle', mirror);
    }
  }

  ctx.fillStyle = accent;
  ctx.font = font(60);
  ctx.fillText(data.winner ? data.winner.name.toUpperCase() : data.fighters.map((f) => f.name.toUpperCase()).join('  vs  '), cx, 715);

  if (data.winner) {
    ctx.fillStyle = '#aab2d5';
    ctx.font = font(26);
    ctx.fillText(factionOf(data.winner).toUpperCase(), cx, 752);
  }

  if (data.score) {
    ctx.fillStyle = '#aab2d5';
    ctx.font = font(36);
    ctx.fillText(`ROUNDS  ${data.score[0]} - ${data.score[1]}`, cx, 805);
  }

  ctx.fillStyle = '#ffffff';
  const maxWidth = CARD_SIZE - 160;
  let size = 40;
  ctx.font = font(size, 'italic bold');
  let lines = wrap(ctx, `\u201C${data.quote}\u201D`, maxWidth);
  if (lines.length > 2) {
    size = 32;
    ctx.font = font(size, 'italic bold');
    lines = wrap(ctx, `\u201C${data.quote}\u201D`, maxWidth);
  }
  lines.forEach((line, i) => ctx.fillText(line, cx, 880 + i * (size + 14)));

  if (data.winner) {
    ctx.fillStyle = accent;
    ctx.font = font(30);
    ctx.fillText(`\u2014 ${data.winner.name}`, cx, 880 + lines.length * (size + 14) + 10);
  }

  ctx.fillStyle = '#6f7aa8';
  ctx.font = font(26, 'normal');
  ctx.fillText(data.footer, cx, CARD_SIZE - 40);

  return canvas;
}

export const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
