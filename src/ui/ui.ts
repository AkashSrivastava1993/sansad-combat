import Phaser from 'phaser';
import { FONT_FAMILY } from '../config';

export const textStyle = (size: number, color = '#ffffff'): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  fontStyle: 'bold',
  color,
});

export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  width = 280,
  height = 60,
): Phaser.GameObjects.Container {
  const bg = scene.add.rectangle(0, 0, width, height, 0x2b3350).setStrokeStyle(3, 0x8fa0ff);
  const text = scene.add.text(0, 0, label, textStyle(28)).setOrigin(0.5);
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => bg.setFillStyle(0x3d4875));
  bg.on('pointerout', () => bg.setFillStyle(0x2b3350));
  bg.on('pointerup', onClick);
  return scene.add.container(x, y, [bg, text]);
}
