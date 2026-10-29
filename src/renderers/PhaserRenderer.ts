import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y } from '../config';
import type { FighterData } from '../core/characters/types';
import type { MatchState } from '../core/match/state';
import { SvgRig } from '../rig/svg/SvgRig';
import type { FighterPuppet, ScreenPoint } from '../ui/FighterView';
import type { FightRenderer } from './FightRenderer';

/** Flat 2D fight drawn entirely by Phaser: the SVG rigs on a plain backdrop. */
export class PhaserRenderer implements FightRenderer {
  readonly kind = 'phaser';
  private projectiles!: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {}

  readonly project = (x: number, y: number): ScreenPoint => ({ x, y, zoom: 1 });

  begin(): void {
    const { scene } = this;
    scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x141a2b);
    scene.add.rectangle(GAME_WIDTH / 2, GROUND_Y + (GAME_HEIGHT - GROUND_Y) / 2, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, 0x2a3148);
    // Above the fighters, which share depth 0 and are created after the backdrop.
    this.projectiles = scene.add.graphics().setDepth(1);
  }

  end(): void {}

  addFighter(data: FighterData): FighterPuppet {
    const rig = new SvgRig(this.scene, data);
    const aura = this.scene.add.ellipse(0, -data.body.height / 2, data.body.width * 1.7, data.body.height * 1.15, 0xffffff, 0).setBlendMode(Phaser.BlendModes.ADD);
    rig.root.addAt(aura, 0);
    return {
      render: (frame) => {
        rig.render(frame);
        aura.setVisible(frame.aura !== undefined);
        if (frame.aura) aura.setFillStyle(Phaser.Display.Color.HexStringToColor(frame.aura.color).color, frame.aura.alpha * 1.5);
      },
      place: (x, y, facing, angle, alpha, spin = 1) => {
        rig.root.setPosition(x, y).setScale(facing * spin, 1).setAngle(angle).setAlpha(alpha);
      },
    };
  }

  draw(state: MatchState): void {
    const g = this.projectiles;
    g.clear();
    for (const p of state.projectiles) {
      if (p.data.fx) continue; // Drawn by the special's own effect.
      const { x, y, width, height } = p.hitbox;
      const color = Phaser.Display.Color.HexStringToColor(p.color).color;
      if (p.kind === 'helper') {
        // Translucent until it can strike, so the opponent can read the delay.
        const alpha = p.armed ? 1 : 0.35;
        g.fillStyle(color, alpha).fillRect(x, y, width, height);
        g.fillCircle(x + width / 2, y - 12, 14);
        g.lineStyle(2, 0xffffff, alpha).strokeRect(x, y, width, height);
        continue;
      }
      g.fillStyle(color).fillRect(x, y, width, height);
      g.lineStyle(2, 0xffffff).strokeRect(x, y, width, height);
    }
  }

  shake(ms: number, intensity: number, force = false): void {
    this.scene.cameras.main.shake(ms, intensity, force);
  }

  cheer(): void {}
}
