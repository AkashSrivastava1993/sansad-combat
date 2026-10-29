import Phaser from 'phaser';
import { emptyInput, type InputAction, type InputSource, type InputState } from '../../core/input/InputState';

export type KeyBindings = Record<InputAction, string>;

// Values are Phaser KeyCodes names.
export const P1_KEYS: KeyBindings = {
  left: 'A',
  right: 'D',
  jump: 'W',
  block: 'S',
  light: 'F',
  heavy: 'G',
  special: 'H',
  grab: 'T',
};

export const P2_KEYS: KeyBindings = {
  left: 'LEFT',
  right: 'RIGHT',
  jump: 'UP',
  block: 'DOWN',
  light: 'COMMA',
  heavy: 'PERIOD',
  special: 'FORWARD_SLASH',
  grab: 'M',
};

export class KeyboardInput implements InputSource {
  private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin | null;
  private readonly bound: [InputAction, Phaser.Input.Keyboard.Key][] = [];

  constructor(scene: Phaser.Scene, ...schemes: KeyBindings[]) {
    this.keyboard = scene.input.keyboard;
    if (!this.keyboard) return;
    for (const scheme of schemes) {
      for (const [action, key] of Object.entries(scheme) as [InputAction, string][]) {
        this.bound.push([action, this.keyboard.addKey(key)]);
      }
    }
  }

  poll(): InputState {
    const state = emptyInput();
    for (const [action, key] of this.bound) if (key.isDown) state[action] = true;
    return state;
  }

  destroy(): void {
    for (const [, key] of this.bound) this.keyboard?.removeKey(key);
    this.bound.length = 0;
  }
}
