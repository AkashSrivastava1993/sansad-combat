import type { HitProps } from '../../characters/types';
import { GROUND_Y } from '../../config';
import type { Fighter } from './Fighter';
import type { Rect } from './geometry';

export interface ProjectileShape extends HitProps {
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

export class Projectile {
  dead = false;
  private age = 0;

  constructor(
    readonly owner: Fighter,
    readonly data: ProjectileShape,
    public x: number,
    readonly dir: 1 | -1,
    readonly kind: 'projectile' | 'helper' = 'projectile',
  ) {}

  get armed(): boolean {
    return this.age >= (this.data.armMs ?? 0);
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
    this.x += this.dir * this.data.speed * (dt / 1000);
    if (this.age >= this.data.lifetimeMs) this.dead = true;
  }
}
