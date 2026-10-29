import type { FighterData } from '../../core/characters/types';
import type { AnimFrame } from '../animator';
import { svgArt, svgImage, SVG_DRAW_ORDER } from './atlas';
import { clothTarget, layoutSvg } from './layout';

/** Draws the SVG fighter facing right with the feet at the canvas origin, in game-pixel units (no cloth lag). */
export function drawSvgRig(ctx: CanvasRenderingContext2D, data: FighterData, frame: AnimFrame): void {
  const cfg = data.svg;
  if (!cfg) return;
  const art = svgArt();
  const present = new Set(SVG_DRAW_ORDER.filter((layer) => svgImage(data.id, layer)));
  const placements = layoutSvg(
    cfg,
    art,
    { pose: frame.pose, bob: frame.bob, grounded: frame.grounded, cloth: clothTarget(cfg, frame.wind, frame.time) },
    present,
  );
  for (const p of placements) {
    const img = svgImage(data.id, p.layer)!;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    ctx.drawImage(img, -p.pivot[0] * cfg.scale, -p.pivot[1] * cfg.scale, art.canvas[0] * cfg.scale, art.canvas[1] * cfg.scale);
    ctx.restore();
  }
}
