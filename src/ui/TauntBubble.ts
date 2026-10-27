import Phaser from 'phaser';
import { GAME_WIDTH, TAUNT_SHOW_MS } from '../config';
import { textStyle } from './ui';

const BUBBLE_Y = 135;
const MAX_TEXT_WIDTH = 260;
const EDGE_PAD = 10;

/** Speech bubble centred on `x` (kept on screen) whose tail points down at the speaker. */
export function showTaunt(scene: Phaser.Scene, x: number, line: string, outline: number): void {
  const label = scene.add
    .text(0, 0, line, { ...textStyle(16, '#1b1f33'), align: 'center', wordWrap: { width: MAX_TEXT_WIDTH } })
    .setOrigin(0.5);
  const w = label.width + 24;
  const h = label.height + 16;
  const cx = Phaser.Math.Clamp(x, w / 2 + EDGE_PAD, GAME_WIDTH - w / 2 - EDGE_PAD);

  const bg = scene.add.rectangle(0, 0, w, h, 0xffffff).setStrokeStyle(3, outline);
  const tail = scene.add.triangle(x - cx, h / 2 + 5, 0, 0, 16, 0, 8, 12, 0xffffff).setStrokeStyle(3, outline);
  const bubble = scene.add.container(cx, BUBBLE_Y, [tail, bg, label]).setDepth(15);

  scene.tweens.add({
    targets: bubble,
    alpha: 0,
    delay: TAUNT_SHOW_MS,
    duration: 250,
    onComplete: () => bubble.destroy(),
  });
}
