import Phaser from 'phaser';
import { SPARK_BASE_COUNT, SPARK_COUNT_PER_DAMAGE, SPARK_LIFETIME_MS } from '../config';

export type SparkKind = 'hit' | 'block' | 'shield' | 'ko';

const COLORS: Record<SparkKind, number> = {
  hit: 0xffd24a,
  block: 0x66ccff,
  shield: 0xfff2a8,
  ko: 0xff5a4a,
};

const DEPTH = 10;

export class HitSparks {
  constructor(private readonly scene: Phaser.Scene) {}

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
