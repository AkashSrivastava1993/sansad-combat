import { emptyInput, type InputAction, type InputSource, type InputState } from './InputState';

interface ButtonDef {
  action: InputAction;
  label: string;
  title: string;
}

const LEFT_PAD: ButtonDef[] = [
  { action: 'jump', label: '▲', title: 'Jump' },
  { action: 'left', label: '◄', title: 'Move left' },
  { action: 'right', label: '►', title: 'Move right' },
];

const RIGHT_PAD: ButtonDef[] = [
  { action: 'block', label: 'BLK', title: 'Block' },
  { action: 'light', label: 'LP', title: 'Light attack' },
  { action: 'heavy', label: 'HP', title: 'Heavy attack' },
  { action: 'special', label: 'SP', title: 'Special' },
];

const isTouchDevice = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

/** DOM overlay so multi-touch works independently of the canvas scaling. */
class TouchControls implements InputSource {
  private readonly root = document.createElement('div');
  private readonly buttons = new Map<InputAction, HTMLButtonElement>();
  private state = emptyInput();

  constructor() {
    this.root.id = 'touch-controls';
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.append(this.buildPad('left', LEFT_PAD), this.buildPad('right', RIGHT_PAD));
    document.body.append(this.root);
  }

  show(): void {
    if (isTouchDevice()) this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
    this.releaseAll();
  }

  poll(): InputState {
    return { ...this.state };
  }

  private buildPad(side: 'left' | 'right', defs: ButtonDef[]): HTMLElement {
    const pad = document.createElement('div');
    pad.className = `tc-pad tc-pad-${side}`;
    for (const def of defs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tc-btn';
      btn.tabIndex = -1;
      btn.textContent = def.label;
      btn.title = def.title;
      btn.setAttribute('aria-label', def.title);
      btn.dataset.action = def.action;
      this.bindButton(btn, def.action);
      this.buttons.set(def.action, btn);
      pad.append(btn);
    }
    return pad;
  }

  private bindButton(btn: HTMLButtonElement, action: InputAction): void {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      this.set(action, true);
    });
    const release = () => this.set(action, false);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  }

  private set(action: InputAction, pressed: boolean): void {
    this.state[action] = pressed;
    this.buttons.get(action)?.classList.toggle('active', pressed);
  }

  private releaseAll(): void {
    for (const action of this.buttons.keys()) this.set(action, false);
  }
}

export const touchControls = new TouchControls();
