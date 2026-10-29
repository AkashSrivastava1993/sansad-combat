import { ENERGY_MAX, GAME_WIDTH, ROUNDS_TO_WIN } from '../config';
import { type ArenaId, arenaText } from '../content/arenas';
import { fill, pickText, texts } from '../content/texts';
import { type MatchEvent, type MatchState, type Slot, windingUp } from '../core/match/state';
import { modelStatus, onModelStatus } from '../render3d/modelLoader';
import { NewsTicker } from './NewsTicker';

const ENERGY_WIDTH = 260;

type Side = 'p1' | 'p2';

interface SideView {
  fill: HTMLElement;
  energy: HTMLElement;
  gold: boolean;
}

function div(className: string, parent?: HTMLElement, text?: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

/** Health bars, timer, round pips, banner and news ticker as page elements over the game canvas. */
export class HtmlOverlay {
  private readonly root = div('fh');
  private readonly timer: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly sides: [SideView, SideView];
  private readonly pips: [HTMLElement[], HTMLElement[]] = [[], []];
  private readonly ticker: NewsTicker;
  private readonly watch: ResizeObserver;
  private stopModelStatus: (() => void) | null = null;
  private timerText = '';
  private cine = false;
  /** Wins last drawn; starts out of range so the first update draws the pips. */
  private wins: readonly [number, number] = [-1, -1];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initial: MatchState,
    arena: ArenaId,
  ) {
    const { fighters } = initial;
    div('fh-cine fh-cine-top', this.root);
    div('fh-cine fh-cine-bottom', this.root);
    div('fh-vignette', this.root);
    div('fh-shade', this.root);

    const build = (side: Side, slot: Slot): SideView => {
      const bar = div(`fh-bar ${side}`, this.root);
      const barFill = div('fh-fill', bar);
      const energyBar = div(`fh-energy ${side}`, this.root);
      const energyFill = div('fh-fill', energyBar);
      const tick = div('fh-tick', energyBar);
      tick.style[side === 'p1' ? 'left' : 'right'] = `${(fighters[slot].data.special.cost / ENERGY_MAX) * ENERGY_WIDTH}px`;
      div(`fh-name ${side}`, this.root, side === 'p1' ? `${texts.hud.p1}  ${fighters[slot].data.name}` : `${fighters[slot].data.name}  ${texts.hud.p2}`);
      return { fill: barFill, energy: energyFill, gold: false };
    };
    this.sides = [build('p1', 0), build('p2', 1)];

    this.timer = div('fh-timer', this.root);
    for (const [slot, side] of [[0, -1], [1, 1]] as const) {
      for (let i = 0; i < ROUNDS_TO_WIN; i++) {
        const pip = div('fh-pip', this.root);
        pip.style.left = `${GAME_WIDTH / 2 + side * 24 * (i + 1) - 8}px`;
        this.pips[slot].push(pip);
      }
    }
    this.bannerEl = div('fh-banner', this.root);
    this.ticker = new NewsTicker(texts.ticker.label, arenaText(arena).idle);
    this.root.append(this.ticker.element);

    // Developers see how the 3D models are loading; players never do.
    const withModel = fighters.map((f) => f.data).filter((d) => d.model);
    if (import.meta.env.DEV && withModel.length > 0) {
      const box = div('fh-model', this.root);
      const refresh = (): void => {
        const lines: string[] = [];
        for (const d of withModel) {
          const status = modelStatus(d.model!.url);
          if (status?.state === 'loading') {
            lines.push(fill(texts.model.loading, { name: d.name, percent: status.progress < 0 ? '...' : `${Math.round(status.progress * 100)}%` }));
          } else if (status?.state === 'failed') {
            lines.push(fill(texts.model.failed, { name: d.name, reason: status.reason }));
          }
        }
        box.textContent = lines.join('\n');
      };
      this.stopModelStatus = onModelStatus(refresh);
      refresh();
    }

    canvas.parentElement!.append(this.root);
    this.ticker.start();
    this.watch = new ResizeObserver(() => this.layout());
    this.watch.observe(canvas);
    this.layout();
    this.update(initial);
  }

  update(state: MatchState): void {
    state.fighters.forEach((f, i) => {
      const view = this.sides[i]!;
      view.fill.style.transform = `scaleX(${Math.max(0, f.health / f.maxHealth)})`;
      view.energy.style.transform = `scaleX(${Math.min(1, f.energy / ENERGY_MAX)})`;
      if (f.canSpecial !== view.gold) {
        view.gold = f.canSpecial;
        view.energy.classList.toggle('ready', f.canSpecial);
      }
    });
    const seconds = String(Math.ceil(Math.max(0, state.timeLeftMs) / 1000));
    if (seconds !== this.timerText) {
      this.timerText = seconds;
      this.timer.textContent = seconds;
    }
    if (state.wins[0] !== this.wins[0] || state.wins[1] !== this.wins[1]) {
      this.wins = state.wins;
      state.wins.forEach((w, slot) => this.pips[slot]!.forEach((pip, i) => (pip.className = i < w ? 'fh-pip won' : 'fh-pip')));
    }
    const cine = windingUp(state) !== null;
    if (cine !== this.cine) {
      this.cine = cine;
      this.root.classList.toggle('cine', cine);
    }
  }

  banner(text: string, color = '#ffffff'): void {
    this.bannerEl.getAnimations().forEach((a) => a.cancel());
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = color;
    if (!text) return;
    this.bannerEl.animate(
      [
        { transform: 'translate(-50%, -50%) scale(2.2) rotate(-6deg)' },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  }

  /** Turns what just happened into a news headline. */
  onEvent(ev: MatchEvent, state: MatchState): void {
    const name = (slot: Slot): string => state.fighters[slot].data.name;
    const headline = (kind: keyof typeof texts.ticker.events, priority: number, vars: Record<string, string | number> = {}): void =>
      this.ticker.push(fill(pickText(texts.ticker.events[kind]), vars), priority);
    switch (ev.type) {
      case 'roundStart':
        headline('roundStart', 2, { round: ev.round });
        break;
      case 'fightStart':
        headline('fightStart', 2);
        break;
      case 'grab':
        headline('grab', 2, { attacker: name(ev.attacker), defender: name(ev.defender) });
        break;
      case 'hit': {
        const vars = { attacker: name(ev.attacker), defender: name(ev.defender) };
        if (ev.slam) headline('slam', 3, vars);
        else if (ev.shielded) headline('shield', 1, vars);
        else if (ev.blocked) headline('block', 1, vars);
        else if (ev.knockdown) headline('knockdown', 2, vars);
        else headline('hit', 1, vars);
        break;
      }
      case 'special':
        headline('special', 2, { attacker: name(ev.slot), defender: name(ev.slot === 0 ? 1 : 0), special: state.fighters[ev.slot].data.special.name });
        break;
      case 'ko':
        headline('ko', 3, { attacker: name(ev.slot === 0 ? 1 : 0), defender: name(ev.slot) });
        break;
      case 'roundEnd':
        if (ev.reason === 'time') headline('timeUp', 3);
        break;
      default:
        break;
    }
  }

  destroy(): void {
    this.watch.disconnect();
    this.stopModelStatus?.();
    document.documentElement.style.removeProperty('--fh-ticker');
    this.ticker.destroy();
    this.root.remove();
  }

  /** Sits exactly over the (letterboxed) game canvas, scaled so 960 x 540 logical px fill it. */
  private layout(): void {
    const { offsetLeft: x, offsetTop: y, offsetWidth: w } = this.canvas;
    const style = this.root.style;
    style.left = `${x}px`;
    style.top = `${y}px`;
    style.transform = `scale(${w / GAME_WIDTH})`;
    // The pause and back buttons sit just above the ticker.
    document.documentElement.style.setProperty('--fh-ticker', `${(w / GAME_WIDTH) * 34}px`);
  }
}

