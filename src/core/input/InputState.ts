export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  block: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  grab: boolean;
}

export type InputAction = keyof InputState;

const INPUT_ACTIONS: readonly InputAction[] = [
  'left',
  'right',
  'jump',
  'block',
  'light',
  'heavy',
  'special',
  'grab',
];

export const emptyInput = (): InputState => ({
  left: false,
  right: false,
  jump: false,
  block: false,
  light: false,
  heavy: false,
  special: false,
  grab: false,
});

export interface InputSource {
  poll(dt: number): InputState;
  destroy?(): void;
}

export class CompositeInput implements InputSource {
  constructor(private readonly sources: InputSource[]) {}

  poll(dt: number): InputState {
    const out = emptyInput();
    for (const source of this.sources) {
      const state = source.poll(dt);
      for (const action of INPUT_ACTIONS) out[action] ||= state[action];
    }
    return out;
  }

  destroy(): void {
    for (const source of this.sources) source.destroy?.();
  }
}
