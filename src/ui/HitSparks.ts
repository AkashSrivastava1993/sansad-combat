import Phaser from 'phaser';
import { FONT_FAMILY, SPARK_BASE_COUNT, SPARK_COUNT_PER_DAMAGE, SPARK_LIFETIME_MS } from '../config';

export type SparkKind = 'hit' | 'block' | 'shield' | 'ko';

const COLORS: Record<SparkKind, number> = {
  hit: 0xffd24a,
  block: 0x66ccff,
  shield: 0xfff2a8,
  ko: 0xff5a4a,
};

const DEPTH = 10;
const COMIC_DEPTH = 14;
const COMIC_MS = 650;
const COMIC_POINTS = 12;

export class HitSparks {
  constructor(private readonly scene: Phaser.Scene) {}

  /** Comic-book starburst with a word, e.g. "BOOM!"; `size` scales it. */
  comic(x: number, y: number, word: string, color: number, size = 1): void {
    const r = 62 * size;
    const g = this.scene.add.graphics();
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < COMIC_POINTS * 2; i++) {
      const a = (i / (COMIC_POINTS * 2)) * Math.PI * 2;
      const k = i % 2 === 0 ? 1 : 0.58 + Math.random() * 0.08;
      pts.push({ x: Math.cos(a) * r * k, y: Math.sin(a) * r * k * 0.8 });
    }
    g.fillStyle(0xffffff).fillPoints(pts, true);
    g.fillStyle(color).fillPoints(pts.map((p) => ({ x: p.x * 0.84, y: p.y * 0.84 })), true);
    g.lineStyle(4, 0x111111).strokePoints(pts, true);
    const label = this.scene.add
      .text(0, 0, word, {
        fontFamily: FONT_FAMILY,
        fontSize: `${Math.round(30 * size)}px`,
        fontStyle: 'bold italic',
        color: '#ffffff',
        stroke: '#111111',
        strokeThickness: Math.max(4, 6 * size),
      })
      .setOrigin(0.5);
    const burst = this.scene.add
      .container(x, y - 30 * size, [g, label])
      .setDepth(COMIC_DEPTH)
      .setScale(0.2)
      .setAngle(Phaser.Math.Between(-12, 12));
    this.scene.tweens.add({ targets: burst, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: burst,
      alpha: 0,
      y: burst.y - 18,
      delay: COMIC_MS - 220,
      duration: 220,
      onComplete: () => burst.destroy(),
    });
  }

  /** `dir` is the direction the hit travels; shards fan out around it (all around for K.O.). */
  burst(x: number, y: number, kind: SparkKind, dir: 1 | -1, damage: number): void {
    const color = COLORS[kind];
    const scale = kind === 'ko' ? 2 : kind === 'hit' ? 1 : 0.6;
    const count = Math.round((SPARK_BASE_COUNT + damage * SPARK_COUNT_PER_DAMAGE) * (kind === 'ko' ? 2 : scale));

    const ring = this.scene.add.circle(x, y, 8, 0xffffff, 0.9).setStrokeStyle(3, color).setDepth(DEPTH);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.5 * scale,
      alpha: 0,
      duration: SPARK_LIFETIME_MS * 0.7,
      onComplete: () => ring.destroy(),
    });

    const forward = dir === 1 ? 0 : Math.PI;
    for (let i = 0; i < count; i++) {
      const angle =
        kind === 'ko' ? Math.random() * Math.PI * 2 : forward + Phaser.Math.FloatBetween(-1, 1) * (Math.PI / 2.2);
      const dist = Phaser.Math.Between(30, 80) * scale;
      const shard = this.scene.add
        .rectangle(x, y, 14 * scale, 4, i % 3 === 0 ? 0xffffff : color)
        .setRotation(angle)
        .setDepth(DEPTH);
      this.scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.3,
        duration: SPARK_LIFETIME_MS,
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }
}
