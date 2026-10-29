import Phaser from 'phaser';
import { ENERGY_MAX, GAME_WIDTH, ROUNDS_TO_WIN } from '../config';
import type { FighterSnapshot, MatchState } from '../core/match/state';
import { texts } from '../content/texts';
import { textStyle } from './ui';

const BAR_WIDTH = 380;
const BAR_HEIGHT = 24;
const BAR_Y = 24;
const MARGIN = 30;
const ENERGY_WIDTH = 260;
const ENERGY_HEIGHT = 10;
const ENERGY_Y = BAR_Y + BAR_HEIGHT + 4;
const NAME_Y = ENERGY_Y + ENERGY_HEIGHT + 4;
const PIP_RADIUS = 8;
const PIP_SPACING = 24;
const PIP_Y = BAR_Y + BAR_HEIGHT + 24;

export class Hud {
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly timer: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    { fighters, wins }: MatchState,
  ) {
    this.bars = scene.add.graphics();
    this.drawPips(scene, wins);
    this.timer = scene.add.text(GAME_WIDTH / 2, BAR_Y + BAR_HEIGHT / 2, '', textStyle(32)).setOrigin(0.5);
    scene.add.text(MARGIN, NAME_Y, `${texts.hud.p1}  ${fighters[0].data.name}`, textStyle(18));
    scene
      .add.text(GAME_WIDTH - MARGIN, NAME_Y, `${fighters[1].data.name}  ${texts.hud.p2}`, textStyle(18))
      .setOrigin(1, 0);
  }

  /** Round-win markers sit either side of the timer, filling outward from the centre. */
  private drawPips(scene: Phaser.Scene, wins: readonly [number, number]): void {
    const g = scene.add.graphics();
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      const offset = PIP_SPACING * (i + 1);
      for (const [side, count] of [
        [-1, wins[0]],
        [1, wins[1]],
      ] as const) {
        const x = GAME_WIDTH / 2 + side * offset;
        if (i < count) g.fillStyle(0xffd24a).fillCircle(x, PIP_Y, PIP_RADIUS);
        else g.lineStyle(2, 0x8fa0ff).strokeCircle(x, PIP_Y, PIP_RADIUS);
      }
    }
  }

  update({ fighters, timeLeftMs }: MatchState): void {
    const [a, b] = fighters;
    const leftX = MARGIN;
    const rightX = GAME_WIDTH - MARGIN - BAR_WIDTH;
    const ratio = (f: FighterSnapshot) => Math.max(0, f.health / f.maxHealth);

    this.bars.clear();
    this.bars.fillStyle(0x222222).fillRect(leftX, BAR_Y, BAR_WIDTH, BAR_HEIGHT);
    this.bars.fillRect(rightX, BAR_Y, BAR_WIDTH, BAR_HEIGHT);
    this.bars.fillStyle(0xe5483f);
    // P1 drains toward the left edge, P2 toward the right edge.
    const wa = BAR_WIDTH * ratio(a);
    const wb = BAR_WIDTH * ratio(b);
    this.bars.fillRect(leftX + BAR_WIDTH - wa, BAR_Y, wa, BAR_HEIGHT);
    this.bars.fillRect(rightX, BAR_Y, wb, BAR_HEIGHT);

    this.drawEnergy(a, leftX, 1);
    this.drawEnergy(b, GAME_WIDTH - MARGIN, -1);

    this.timer.setText(String(Math.ceil(Math.max(0, timeLeftMs) / 1000)));
  }

  /** Fills from the outer screen edge; gold when the special is usable, with a tick at its cost. */
  private drawEnergy(f: FighterSnapshot, edgeX: number, dir: 1 | -1): void {
    const left = dir === 1 ? edgeX : edgeX - ENERGY_WIDTH;
    const fill = ENERGY_WIDTH * (f.energy / ENERGY_MAX);
    this.bars.fillStyle(0x222222).fillRect(left, ENERGY_Y, ENERGY_WIDTH, ENERGY_HEIGHT);
    this.bars.fillStyle(f.canSpecial ? 0xffd24a : 0x3fa7e5);
    this.bars.fillRect(dir === 1 ? left : left + ENERGY_WIDTH - fill, ENERGY_Y, fill, ENERGY_HEIGHT);
    const tickX = edgeX + dir * ENERGY_WIDTH * (f.data.special.cost / ENERGY_MAX);
    this.bars.fillStyle(0xffffff).fillRect(tickX - 1, ENERGY_Y - 2, 2, ENERGY_HEIGHT + 4);
  }
}
