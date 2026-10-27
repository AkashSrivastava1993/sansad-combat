interface FightHooks {
  pause(): void;
  resume(): void;
  quit(): void;
}

type FsDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

const FULLSCREEN_ICON =
  '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';

const fsDoc = document as FsDocument;
const fsRoot = document.documentElement as FsElement;
const canFullscreen = Boolean(fsRoot.requestFullscreen ?? fsRoot.webkitRequestFullscreen);
const isFullscreen = (): boolean => Boolean(fsDoc.fullscreenElement ?? fsDoc.webkitFullscreenElement);

async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      await (fsDoc.exitFullscreen?.() ?? fsDoc.webkitExitFullscreen?.());
      return;
    }
    await (fsRoot.requestFullscreen?.() ?? fsRoot.webkitRequestFullscreen?.());
    await (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    // Fullscreen or orientation lock refused; the game still works windowed.
  }
}

function makeButton(className: string, label: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `gc-btn ${className}`;
  btn.tabIndex = -1;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = label;
  btn.addEventListener('click', onClick);
  return btn;
}

/** DOM buttons on top of the canvas: fullscreen everywhere, pause and back during fights. */
class GameChrome {
  private readonly root = document.createElement('div');
  private readonly overlay = document.createElement('div');
  private readonly overlayTitle = document.createElement('div');
  private hooks: FightHooks | null = null;
  private paused = false;

  constructor() {
    this.root.id = 'game-chrome';
    const fullscreen = makeButton('gc-fs', FULLSCREEN_ICON, 'Fullscreen', () => void toggleFullscreen());
    fullscreen.hidden = !canFullscreen;
    const pause = makeButton('gc-fight-only', 'II', 'Pause', () => this.openOverlay('PAUSED', 'RESUME'));
    const back = makeButton('gc-fight-only', '\u2190', 'Back', () => this.openOverlay('LEAVE MATCH?', 'STAY'));
    this.root.append(pause, back, fullscreen);

    this.overlay.id = 'pause-overlay';
    this.overlay.hidden = true;
    this.overlayTitle.className = 'po-title';
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'po-btn';
    resume.id = 'po-resume';
    resume.addEventListener('click', () => this.closeOverlay());
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.className = 'po-btn';
    quit.textContent = 'QUIT TO FIGHTER SELECT';
    quit.addEventListener('click', () => this.hooks?.quit());
    this.overlay.append(this.overlayTitle, resume, quit);

    document.body.append(this.root, this.overlay);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' && this.hooks) this.togglePause();
    });
  }

  enterFight(hooks: FightHooks): void {
    this.hooks = hooks;
    this.root.classList.add('fight');
  }

  leaveFight(): void {
    this.hooks = null;
    this.paused = false;
    this.overlay.hidden = true;
    this.root.classList.remove('fight');
  }

  /** Keyboard shortcut: pause if running, resume if paused. */
  togglePause(): void {
    if (this.paused) this.closeOverlay();
    else this.openOverlay('PAUSED', 'RESUME');
  }

  private openOverlay(title: string, resumeLabel: string): void {
    if (!this.hooks || this.paused) return;
    this.paused = true;
    this.overlayTitle.textContent = title;
    const resume = this.overlay.querySelector('#po-resume');
    if (resume) resume.textContent = resumeLabel;
    this.overlay.hidden = false;
    this.hooks.pause();
  }

  private closeOverlay(): void {
    if (!this.paused) return;
    this.paused = false;
    this.overlay.hidden = true;
    this.hooks?.resume();
  }
}

export const gameChrome = new GameChrome();
