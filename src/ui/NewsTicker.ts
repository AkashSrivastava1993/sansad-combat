/** Logical px per second the headline scrolls at. */
const SPEED = 120;

/** A scrolling headline strip; urgent headlines cut in on idle ones, and the latest strong one waits its turn. */
export class NewsTicker {
  readonly element = document.createElement('div');
  private readonly track = document.createElement('div');
  private readonly line = document.createElement('span');
  private animation: Animation | null = null;
  private priority = 0;
  private pending: { text: string; priority: number } | null = null;

  constructor(
    label: string,
    private readonly idle: readonly string[],
  ) {
    const tag = document.createElement('div');
    tag.className = 'fh-ticker-label';
    tag.textContent = label;
    this.track.className = 'fh-ticker-track';
    this.line.className = 'fh-ticker-text';
    this.track.append(this.line);
    this.element.className = 'fh-ticker';
    this.element.append(tag, this.track);
  }

  /** Starts scrolling; call once the element is in the page so it can be measured. */
  start(): void {
    this.showIdle();
  }

  /** `priority` 0 is idle chatter; a higher one interrupts a lower one that is still scrolling. */
  push(text: string, priority: number): void {
    if (priority > this.priority) this.show(text, priority);
    else if (priority >= 2) this.pending = { text, priority };
  }

  destroy(): void {
    this.animation?.cancel();
    this.element.remove();
  }

  private showIdle(): void {
    this.show(this.idle[Math.floor(Math.random() * this.idle.length)] ?? '', 0);
  }

  private show(text: string, priority: number): void {
    this.animation?.cancel();
    this.priority = priority;
    this.line.textContent = text;
    const from = this.track.clientWidth;
    const to = -this.line.offsetWidth;
    this.animation = this.line.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], {
      duration: ((from - to) / SPEED) * 1000,
      easing: 'linear',
    });
    this.animation.onfinish = () => {
      const next = this.pending;
      this.pending = null;
      if (next) this.show(next.text, next.priority);
      else this.showIdle();
    };
  }
}
