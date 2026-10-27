import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { DIFFICULTIES, type Difficulty } from '../systems/ai/difficulty';
import { createButton, textStyle } from '../ui/ui';
import { SceneKey, VIEW_MODE_KEY, VIEW_MODES, type CharacterSelectData, type ViewMode } from './sceneData';

const DIFFICULTY_KEY = 'difficulty';
const VIEW_LABELS: Record<ViewMode, string> = { '3d-art': '3D ART', '3d-models': '3D MODELS', '2d': '2D CLASSIC' };

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Menu);
  }

  private get difficulty(): Difficulty {
    return (this.registry.get(DIFFICULTY_KEY) as Difficulty | undefined) ?? 'normal';
  }

  private get viewMode(): ViewMode {
    return (this.registry.get(VIEW_MODE_KEY) as ViewMode | undefined) ?? VIEW_MODES[0]!;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 100, 'FIGHT NIGHT', textStyle(72)).setOrigin(0.5);

    const start = (mode: CharacterSelectData['mode']) => () =>
      this.scene.start(SceneKey.CharacterSelect, { mode, difficulty: this.difficulty } satisfies CharacterSelectData);
    createButton(this, cx, 220, 'VS CPU', start('cpu'));
    createButton(this, cx, 295, 'LOCAL 2P', start('local'));

    const label = () => `CPU LEVEL: ${this.difficulty.toUpperCase()}`;
    const levelButton = createButton(
      this,
      cx,
      365,
      label(),
      () => {
        const next = DIFFICULTIES[(DIFFICULTIES.indexOf(this.difficulty) + 1) % DIFFICULTIES.length]!;
        this.registry.set(DIFFICULTY_KEY, next);
        (levelButton.getAt(1) as Phaser.GameObjects.Text).setText(label());
      },
      360,
      50,
    );

    const viewLabel = () => `VIEW: ${VIEW_LABELS[this.viewMode]}`;
    const viewButton = createButton(
      this,
      cx,
      425,
      viewLabel(),
      () => {
        const next = VIEW_MODES[(VIEW_MODES.indexOf(this.viewMode) + 1) % VIEW_MODES.length]!;
        this.registry.set(VIEW_MODE_KEY, next);
        (viewButton.getAt(1) as Phaser.GameObjects.Text).setText(viewLabel());
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
