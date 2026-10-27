import Phaser from 'phaser';
import type { Projectile } from '../systems/combat/Projectile';

export class ProjectileLayer {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics();
  }

  update(projectiles: readonly Projectile[]): void {
    this.gfx.clear();
    for (const p of projectiles) {
      const { x, y, width, height } = p.hitbox;
      const color = Phaser.Display.Color.HexStringToColor(p.color).color;
      if (p.kind === 'helper') {
        // Translucent until it can strike, so the opponent can read the delay.
        const alpha = p.armed ? 1 : 0.35;
        this.gfx.fillStyle(color, alpha).fillRect(x, y, width, height);
        this.gfx.fillCircle(x + width / 2, y - 12, 14);
        this.gfx.lineStyle(2, 0xffffff, alpha).strokeRect(x, y, width, height);
        continue;
      }
      this.gfx.fillStyle(color);
      this.gfx.fillRect(x, y, width, height);
      this.gfx.lineStyle(2, 0xffffff).strokeRect(x, y, width, height);
    }
  }
}
