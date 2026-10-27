import type { HitProps } from '../../characters/types';
import { ENERGY_PER_DAMAGE_DEALT } from '../../config';
import type { Fighter } from './Fighter';
import { overlapCenter, overlaps } from './geometry';
import type { Projectile } from './Projectile';

export interface HitEvent {
  attacker: Fighter;
  defender: Fighter;
  hit: HitProps;
  blocked: boolean;
  /** The defender's shield absorbed the hit and bounced damage back. */
  shielded: boolean;
  /** World-space contact point. */
  x: number;
  y: number;
}

interface Candidate {
  attacker: Fighter;
  defender: Fighter;
  hit: HitProps;
  dir: 1 | -1;
  projectile: Projectile | null;
  point: { x: number; y: number };
}

export class CombatSystem {
  readonly projectiles: Projectile[] = [];

  /** Advances projectiles and applies all hits landing this frame; simultaneous hits both connect. */
  resolve(a: Fighter, b: Fighter, dt: number): HitEvent[] {
    for (const [burned, burner] of [
      [a, b],
      [b, a],
    ] as const) {
      burner.gainEnergy(burned.tickBurn(dt) * ENERGY_PER_DAMAGE_DEALT);
    }
    this.advance(a, b, dt);

    const candidates: Candidate[] = [];
    for (const [attacker, defender] of [
      [a, b],
      [b, a],
    ] as const) {
      if (defender.state === 'ko' || defender.untouchable) continue;
      const hitbox = attacker.hitbox;
      const hit = attacker.activeHit;
      if (hitbox && hit && !attacker.hasHit && overlaps(hitbox, defender.hurtbox)) {
        candidates.push({
          attacker,
          defender,
          hit,
          dir: attacker.knockbackDir(defender.x),
          projectile: null,
          point: overlapCenter(hitbox, defender.hurtbox),
        });
      }
      for (const projectile of this.projectiles) {
        if (projectile.owner !== attacker || !projectile.canHit) continue;
        if (overlaps(projectile.hitbox, defender.hurtbox)) {
          candidates.push({
            attacker,
            defender,
            hit: projectile.hit,
            dir: projectile.dir,
            projectile,
            point: overlapCenter(projectile.hitbox, defender.hurtbox),
          });
        }
      }
    }

    const events: HitEvent[] = [];
    for (const { attacker, defender, hit, dir, projectile, point } of candidates) {
      if (projectile) projectile.registerHit();
      else attacker.hasHit = true;

      const shield = defender.currentSpecial;
      if (defender.shieldActive && shield?.type === 'shield') {
        attacker.takeReflect(Math.round(shield.damage + (shield.reflectRatio ?? 0) * hit.damage));
        events.push({ attacker, defender, hit, blocked: true, shielded: true, ...point });
        continue;
      }
      const blocked = defender.state === 'block' && !hit.guardBreak;
      const dealt = defender.takeHit(hit, dir, blocked);
      if (hit.burn && !blocked && defender.state !== 'ko') defender.ignite(hit.burn);
      attacker.gainEnergy(dealt * ENERGY_PER_DAMAGE_DEALT);
      events.push({ attacker, defender, hit, blocked, shielded: false, ...point });
    }

    this.prune();
    return events;
  }

  /** Moves projectiles without letting them hit, e.g. while a finished round winds down. */
  coast(a: Fighter, b: Fighter, dt: number): void {
    this.advance(a, b, dt);
    this.prune();
  }

  private advance(a: Fighter, b: Fighter, dt: number): void {
    for (const f of [a, b]) this.projectiles.push(...f.spawned.splice(0));
    for (const p of this.projectiles) p.update(dt);
  }

  private prune(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i]!.dead) this.projectiles.splice(i, 1);
    }
  }

  /** Pushes overlapping bodies apart horizontally. */
  separate(a: Fighter, b: Fighter): void {
    const ra = a.hurtbox;
    const rb = b.hurtbox;
    if (!overlaps(ra, rb)) return;
    const overlapX = Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x);
    const dir = a.x <= b.x ? -1 : 1;
    a.shiftX((dir * overlapX) / 2);
    b.shiftX((-dir * overlapX) / 2);
  }
}
