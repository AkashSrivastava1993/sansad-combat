import type { MoveData } from '../../characters/types';
import type { Fighter } from '../combat/Fighter';
import type { Projectile } from '../combat/Projectile';
import { emptyInput, type InputSource, type InputState } from '../input/InputState';
import { AI_PROFILES, type AIProfile } from './difficulty';

type Attack = 'light' | 'heavy';
type AIState = 'approach' | 'attack' | 'defend' | 'retreat';

interface Perception {
  dist: number;
  toward: 'left' | 'right';
  away: 'left' | 'right';
  lightReach: number;
  heavyReach: number;
  /** An attack, special or projectile is about to land on us. */
  threat: boolean;
}

const PROJECTILE_ALERT_DIST = 260;
const SPECIAL_THREAT_DIST = 350;

/** approach -> attack -> (retreat) and any state -> defend while threatened. */
export class AIController implements InputSource {
  private state: AIState = 'approach';
  private stateTime = 0;
  private held = emptyInput();
  private pendingAttack: Attack | null = null;
  private pendingJump = false;
  private pendingSpecial = false;
  private timer = 0;

  constructor(
    private readonly self: Fighter,
    private readonly opponent: Fighter,
    private readonly profile: AIProfile = AI_PROFILES.normal,
    private readonly projectiles: readonly Projectile[] = [],
  ) {}

  poll(dt: number): InputState {
    this.timer -= dt;
    this.stateTime += dt;
    if (this.timer <= 0) {
      this.think();
      this.timer = this.profile.reactionMs * (0.75 + Math.random() * 0.5);
    }
    // Attacks and jumps are one-frame pulses so the fighter sees fresh presses.
    const out: InputState = {
      ...this.held,
      light: this.pendingAttack === 'light',
      heavy: this.pendingAttack === 'heavy',
      jump: this.pendingJump,
      special: this.pendingSpecial,
    };
    this.pendingAttack = null;
    this.pendingJump = false;
    this.pendingSpecial = false;
    return out;
  }

  private reach(move: MoveData): number {
    return move.hitbox.x + move.hitbox.width + this.opponent.data.body.width / 2;
  }

  private shouldUseSpecial(c: Perception): boolean {
    if (!this.self.canSpecial) return false;
    const s = this.self.data.special;
    switch (s.type) {
      case 'projectile':
        return c.dist > 220 && c.dist < (s.speed * s.lifetimeMs) / 1000;
      case 'dash': {
        const reach = (s.speed * s.activeMs) / 1000 + s.hitbox.x + s.hitbox.width;
        return c.dist > 120 && c.dist < reach * 0.9;
      }
      case 'shield':
        return c.threat;
      case 'stun':
        return c.dist < s.area.width / 2 + this.opponent.data.body.width / 2 - 20;
      case 'teleport':
        return c.dist > 140 && c.dist < 500;
      case 'summon':
        return c.dist > 100 && c.dist < 450;
      case 'pour':
        return c.dist > 90;
    }
  }

  private perceive(): Perception {
    const dx = this.opponent.x - this.self.x;
    const dist = Math.abs(dx);
    const { light, heavy } = this.self.data.moves;
    const lightReach = this.reach(light);
    const heavyReach = this.reach(heavy);

    const opp = this.opponent;
    const meleeThreat = opp.state === 'attack' && dist < Math.max(lightReach, heavyReach) + 40;
    const specialThreat =
      opp.state === 'special' && opp.currentSpecial?.type !== 'shield' && dist < SPECIAL_THREAT_DIST;
    const projectileThreat = this.projectiles.some(
      (p) =>
        p.owner === opp &&
        !p.dead &&
        Math.sign(this.self.x - p.x) === p.dir &&
        Math.abs(this.self.x - p.x) < PROJECTILE_ALERT_DIST,
    );

    return {
      dist,
      toward: dx >= 0 ? 'right' : 'left',
      away: dx >= 0 ? 'left' : 'right',
      lightReach,
      heavyReach,
      threat: meleeThreat || specialThreat || projectileThreat,
    };
  }

  private think(): void {
    const c = this.perceive();
    // A state may hand off to another within the same decision; the cap guards against loops.
    for (let hops = 0; hops < 3; hops++) {
      this.held = emptyInput();
      this.pendingAttack = null;
      this.pendingJump = false;
      this.pendingSpecial = false;
      const next = this[this.state](c);
      if (next === this.state) return;
      this.state = next;
      this.stateTime = 0;
    }
  }

  private roll(chance: number): boolean {
    return Math.random() < chance;
  }

  private approach(c: Perception): AIState {
    if (c.threat && this.roll(this.profile.blockChance)) return 'defend';
    if (c.dist <= c.lightReach * 0.95) return 'attack';
    if (this.shouldUseSpecial(c) && this.roll(this.profile.specialChance)) {
      this.pendingSpecial = true;
      return 'approach';
    }
    this.held[c.toward] = true;
    this.pendingJump = this.roll(0.05);
    return 'approach';
  }

  private attack(c: Perception): AIState {
    if (c.threat && this.roll(this.profile.blockChance)) return 'defend';
    // Wider than the approach threshold so the AI does not flicker between the two states.
    if (c.dist > c.lightReach * 1.15) return 'approach';
    if (this.shouldUseSpecial(c) && this.roll(this.profile.specialChance)) {
      this.pendingSpecial = true;
      return 'attack';
    }
    if (!this.roll(this.profile.aggression)) return 'retreat';
    this.pendingAttack = c.dist <= c.heavyReach && this.roll(0.4) ? 'heavy' : 'light';
    return 'attack';
  }

  private defend(c: Perception): AIState {
    if (!c.threat) return 'approach';
    if (this.self.data.special.type === 'shield' && this.self.canSpecial) this.pendingSpecial = true;
    else this.held.block = true;
    return 'defend';
  }

  private retreat(c: Perception): AIState {
    if (c.threat && this.roll(this.profile.blockChance)) return 'defend';
    if (this.stateTime >= this.profile.retreatMs) return 'approach';
    this.held[c.away] = true;
    return 'retreat';
  }
}
