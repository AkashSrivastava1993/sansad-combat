import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ARENA_IDS, arenaText } from '../content/arenas';
import { texts } from '../content/texts';
import { DIFFICULTIES, type Difficulty } from '../core/ai/difficulty';
import { needsHomeScreenInstall } from '../ui/platform';
import { createButton, textStyle } from '../ui/ui';
import { getArena, SceneKey, setArena, type CharacterSelectData } from './sceneData';

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
    createButton(this, cx, 230, 'VS CPU', start('cpu'));
    createButton(this, cx, 300, 'LOCAL 2P', start('local'));

    const label = () => `CPU LEVEL: ${this.difficulty.toUpperCase()}`;
    const levelButton = createButton(
      this,
      cx,
      370,
      label(),
      () => {
        const next = DIFFICULTIES[(DIFFICULTIES.indexOf(this.difficulty) + 1) % DIFFICULTIES.length]!;
        this.registry.set(DIFFICULTY_KEY, next);
        (levelButton.getAt(1) as Phaser.GameObjects.Text).setText(label());
      },
      360,
      50,
    );

    const arenaLabel = () => `ARENA: ${arenaText(getArena(this.registry)).name}`;
    const arenaButton = createButton(
      this,
      cx,
      435,
      arenaLabel(),
      () => {
        setArena(this.registry, ARENA_IDS[(ARENA_IDS.indexOf(getArena(this.registry)) + 1) % ARENA_IDS.length]!);
        (arenaButton.getAt(1) as Phaser.GameObjects.Text).setText(arenaLabel());
      },
      420,
      50,
    );

    if (needsHomeScreenInstall) {
      this.add.text(cx, 20, texts.menu.homeScreenHint, { ...textStyle(13, '#ffd24a'), align: 'center' }).setOrigin(0.5);
    }

    this.add
      .text(
        cx,
        GAME_HEIGHT - 28,
        texts.menu.controls,
        { ...textStyle(16, '#aab2d5'), align: 'center' },
      )
      .setOrigin(0.5);
  }
}
