import Phaser from 'phaser';
import type { FighterData, SvgLayerId } from '../../characters/types';
import type { FighterRigView } from '../../ui/FighterRig';
import type { RigFrame } from '../draw';
import { svgArt, svgTextureKey, SVG_DRAW_ORDER, TEXTURE_SCALE } from './atlas';
import { clothTarget, layoutSvg } from './layout';

/** Skeletal puppet of layered SVG textures; pivots and animation values come from the character JSON. */
export class SvgRig implements FighterRigView {
  readonly root: Phaser.GameObjects.Container;
  private readonly aura: Phaser.GameObjects.Graphics;
  private readonly sprites = new Map<SvgLayerId, Phaser.GameObjects.Image>();
  private readonly present = new Set<SvgLayerId>();
  private cloth = 0;
  private lastTime: number | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly data: FighterData,
  ) {
    const cfg = data.svg!;
    this.aura = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.aura]);
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
    const cfg = this.data.svg!;
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

    this.aura.clear();
    if (frame.aura) {
      const { width, height } = this.data.body;
      this.aura.fillStyle(parseInt(frame.aura.color.slice(1), 16), frame.aura.alpha);
      this.aura.fillEllipse(0, -height / 2, width * 1.7, height * 1.15);
    }
  }
}
