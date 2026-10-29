import Phaser from 'phaser';
import type { FighterData, SvgLayerId } from '../../core/characters/types';
import type { RigFrame } from '../animator';
import { svgArt, svgTextureKey, SVG_DRAW_ORDER, TEXTURE_SCALE } from './atlas';
import { clothTarget, layoutSvg } from './layout';

/** Skeletal puppet of layered SVG textures for menus; pivots and animation values come from the character JSON. */
export class SvgRig {
  readonly root: Phaser.GameObjects.Container;
  private readonly sprites = new Map<SvgLayerId, Phaser.GameObjects.Image>();
  private readonly present = new Set<SvgLayerId>();
  private cloth = 0;
  private lastTime: number | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly data: FighterData,
  ) {
    const cfg = data.svg;
    this.root = scene.add.container(0, 0);
    for (const layer of SVG_DRAW_ORDER) {
      const key = svgTextureKey(data.id, layer);
      if (!scene.textures.exists(key)) continue;
      const sprite = scene.add.image(0, 0, key).setScale(cfg.scale / TEXTURE_SCALE);
      this.sprites.set(layer, sprite);
      this.present.add(layer);
      this.root.add(sprite);
    }
  }

  render(frame: RigFrame): void {
    const cfg = this.data.svg;
    const art = svgArt();

    const dt = this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    const target = clothTarget(cfg, frame.wind, frame.time);
    this.cloth += (target - this.cloth) * (1 - Math.exp(-cfg.anim.cloth.lag * dt));

    const placements = layoutSvg(
      cfg,
      art,
      { pose: frame.pose, bob: frame.bob, grounded: frame.grounded, cloth: dt === 0 ? target : this.cloth },
      this.present,
    );
    for (const p of placements) {
      this.sprites
        .get(p.layer)!
        .setOrigin(p.pivot[0] / art.canvas[0], p.pivot[1] / art.canvas[1])
        .setPosition(p.x, p.y)
        .setAngle(p.rot);
    }

    // The art has a fixed face, so pain and K.O. are shown with a red flush on the head instead.
    const head = this.sprites.get('head');
    if (frame.expression === 'hurt' || frame.expression === 'ko') head?.setTint(0xffb4b4);
    else head?.clearTint();
  }
}
