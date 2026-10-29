import type { HitProps, ProjectileExtras } from '../characters/types';
import { GAME_WIDTH, GROUND_Y } from '../config';
import type { Fighter } from './Fighter';
import type { Rect } from './geometry';

export interface ProjectileShape extends HitProps, ProjectileExtras {
  /** px/s; 0 for a stationary helper. */
  speed: number;
  width: number;
  height: number;
  /** Height of the box's top edge above the ground. */
  y: number;
  lifetimeMs: number;
  /** Cannot hit until this much time has passed. */
  armMs?: number;
  color?: string;
}

export type VolleyPhase = 'enter' | 'strike' | 'leave';

/** Share of a volley beat spent winding up before the strike connects. */
export const STRIKE_CONTACT = 0.55;
/** How long each volley strike can connect. */
const STRIKE_WINDOW_MS = 90;
/** Volleys run out faster than they came in. */
const LEAVE_SPEED_SCALE = 1.3;

let nextId = 1;

export class Projectile {
  /** Stable across frames, so renderers can track one projectile through its life. */
  readonly id = nextId++;
  dead = false;
  age = 0;
  /** Hits landed, for effects that react to contact. */
  hitsLanded = 0;
  /** Whether the last hit was blocked or reflected, for effects that react to contact. */
  blocked = false;
  volleyPhase: VolleyPhase = 'enter';
  /** Time spent striking during a volley; negative while waiting out `delayMs`. */
  holdMs = 0;
  /** Volley strikes already used, whether they landed or missed. */
  private strikesDone = 0;

  constructor(
    readonly owner: Fighter,
    readonly data: ProjectileShape,
    public x: number,
    public dir: 1 | -1,
    readonly kind: 'projectile' | 'helper' = 'projectile',
    /** Where a volley stops to strike. */
    private readonly haltX = x,
  ) {}

  get armed(): boolean {
    return this.age >= (this.data.armMs ?? 0);
  }

  /** True only while the projectile may land its next hit. */
  get canHit(): boolean {
    if (this.dead || !this.armed) return false;
    const v = this.data.volley;
    if (!v) return this.hitsLanded === 0;
    if (this.volleyPhase !== 'strike' || this.strikesDone >= v.strikes) return false;
    const contact = (this.strikesDone + STRIKE_CONTACT) * v.beatMs;
    return this.holdMs >= contact && this.holdMs < contact + STRIKE_WINDOW_MS;
  }

  /** Properties of the next hit; a volley's last strike uses the finisher. */
  get hit(): HitProps {
    const v = this.data.volley;
    if (v && this.data.finisher && this.strikesDone === v.strikes - 1) return { ...this.data, ...this.data.finisher };
    return this.data;
  }

  registerHit(): void {
    this.hitsLanded++;
    if (this.data.volley) this.strikesDone++;
    else if (!this.data.pierce) this.dead = true;
  }

  get color(): string {
    return this.data.color ?? this.owner.data.color;
  }

  get hitbox(): Rect {
    const { width, height, y } = this.data;
    return { x: this.x - width / 2, y: GROUND_Y - y, width, height };
  }

  update(dt: number): void {
    this.age += dt;
    const step = this.data.speed * (dt / 1000);
    const v = this.data.volley;
    if (!v) {
      this.x += this.dir * step;
    } else if (this.volleyPhase === 'enter') {
      const left = (this.haltX - this.x) * this.dir;
      if (left <= step) {
        this.x = this.haltX;
        this.volleyPhase = 'strike';
        this.holdMs = -(v.delayMs ?? 0);
      } else {
        this.x += this.dir * step;
      }
    } else if (this.volleyPhase === 'strike') {
      this.holdMs += dt;
      // A strike whose window passed without contact is spent.
      while (this.strikesDone < v.strikes && this.holdMs >= (this.strikesDone + STRIKE_CONTACT) * v.beatMs + STRIKE_WINDOW_MS) {
        this.strikesDone++;
      }
      if (this.holdMs >= v.strikes * v.beatMs) {
        if (v.vanish) {
          this.dead = true;
        } else {
          this.volleyPhase = 'leave';
          this.dir = this.dir === 1 ? -1 : 1;
        }
      }
    } else {
      this.x += this.dir * step * LEAVE_SPEED_SCALE;
    }
    const margin = this.data.width;
    if (this.age >= this.data.lifetimeMs || this.x < -margin || this.x > GAME_WIDTH + margin) this.dead = true;
  }
}
