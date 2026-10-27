import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { DIFFICULTIES, type Difficulty } from '../systems/ai/difficulty';
import { createButton, textStyle } from '../ui/ui';
import { SceneKey, type CharacterSelectData } from './sceneData';

const DIFFICULTY_KEY = 'difficulty';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Menu);
  }

  private get difficulty(): Difficulty {
    return (this.registry.get(DIFFICULTY_KEY) as Difficulty | undefined) ?? 'normal';
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 110, 'SANSAD COMBAT', textStyle(72)).setOrigin(0.5);

    const start = (mode: CharacterSelectData['mode']) => () =>
      this.scene.start(SceneKey.CharacterSelect, { mode, difficulty: this.difficulty } satisfies CharacterSelectData);
    createButton(this, cx, 270, 'VS CPU', start('cpu'));
    createButton(this, cx, 350, 'LOCAL 2P', start('local'));

    const label = () => `CPU LEVEL: ${this.difficulty.toUpperCase()}`;
    const levelButton = createButton(
      this,
      cx,
      425,
      label(),
      () => {
        const next = DIFFICULTIES[(DIFFICULTIES.indexOf(this.difficulty) + 1) % DIFFICULTIES.length]!;
        this.registry.set(DIFFICULTY_KEY, next);
        (levelButton.getAt(1) as Phaser.GameObjects.Text).setText(label());
      },
      360,
      50,
    );

    this.add
      .text(
        cx,
        GAME_HEIGHT - 50,
        'P1: WASD move/jump/block, F light, G heavy, H special\nP2: Arrows move/jump/block, , light, . heavy, / special',
        { ...textStyle(16, '#aab2d5'), align: 'center' },
      )
      .setOrigin(0.5);
  }
}
