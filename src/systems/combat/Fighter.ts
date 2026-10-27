import {
  BLOCK_CHIP_RATIO,
  BLOCK_KNOCKBACK_RATIO,
  ENERGY_MAX,
  ENERGY_PER_DAMAGE_TAKEN,
  GAME_WIDTH,
  GRAVITY,
  GROUND_Y,
  SLIDE_RETENTION,
} from '../../config';
import type {
  BurnEffect,
  FighterData,
  HitProps,
  MoveData,
  MoveName,
  PourSpecial,
  SpecialData,
} from '../../characters/types';
import { emptyInput, type InputState } from '../input/InputState';
import type { Rect } from './geometry';
import { Projectile } from './Projectile';

export type FighterState = 'idle' | 'walk' | 'jump' | 'block' | 'attack' | 'special' | 'hitstun' | 'ko';
export type AttackPhase = 'startup' | 'active' | 'recovery';

export class Fighter {
  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  health: number;
  state: FighterState = 'idle';
  phase: AttackPhase = 'startup';
  currentMove: MoveData | null = null;
  currentSpecial: SpecialData | null = null;
  hasHit = false;
  energy = 0;
  specialCooldown = 0;
  /** Projectiles created this frame, drained by the combat system. */
  readonly spawned: Projectile[] = [];

  private phaseTime = 0;
  private stunTime = 0;
  private burnMs = 0;
  private burnDps = 0;
  /** Fractional burn damage not yet taken. */
  private burnCarry = 0;
  private flightFromX = 0;
  /** Length of the current knockdown; 0 when the hitstun is an ordinary one. */
  private downMs = 0;
  private prev: InputState = emptyInput();
  private opponentX = 0;

  constructor(
    readonly data: FighterData,
    x: number,
    facing: 1 | -1,
  ) {
    this.x = x;
    this.facing = facing;
    this.health = data.stats.maxHealth;
  }

  get hurtbox(): Rect {
    const { width, height } = this.data.body;
    return { x: this.x - width / 2, y: this.y - height, width, height };
  }

  get hitbox(): Rect | null {
    if (this.phase !== 'active') return null;
    if (this.state === 'attack' && this.currentMove) return this.forwardBox(this.currentMove.hitbox);
    const s = this.currentSpecial;
    if (this.state !== 'special' || !s) return null;
    if (s.type === 'dash' || s.type === 'teleport') return this.forwardBox(s.hitbox);
    if (s.type === 'pour') {
      const top = this.y - s.spoutY;
      return { x: this.x + this.facing * s.spoutX - s.width / 2, y: top, width: s.width, height: Math.max(0, GROUND_Y - top) };
    }
    if (s.type === 'stun') {
      return { x: this.x - s.area.width / 2, y: this.y - s.area.height, width: s.area.width, height: s.area.height };
    }
    return null;
  }

  /** Hit properties of the strike currently active, if any. */
  get activeHit(): HitProps | null {
    if (!this.hitbox) return null;
    const s = this.currentSpecial;
    if (s && (s.type === 'dash' || s.type === 'stun' || s.type === 'teleport' || s.type === 'pour')) return s;
    return this.currentMove;
  }

  /** 0-1 through the current attack phase, for animation. */
  get phaseProgress(): number {
    const action = this.currentSpecial ?? this.currentMove;
    if (!action) return 0;
    const duration =
      this.phase === 'startup' ? action.startupMs : this.phase === 'active' ? action.activeMs : action.recoveryMs;
    return duration <= 0 ? 1 : Math.min(1, this.phaseTime / duration);
  }

  get canSpecial(): boolean {
    return this.energy >= this.data.special.cost && this.specialCooldown <= 0;
  }

  get shieldActive(): boolean {
    return this.state === 'special' && this.phase === 'active' && this.currentSpecial?.type === 'shield';
  }

  get burning(): boolean {
    return this.burnMs > 0 && this.state !== 'ko';
  }

  /** Airborne during a pour special: out of reach and free of gravity. */
  get flying(): boolean {
    return this.state === 'special' && this.currentSpecial?.type === 'pour';
  }

  /** Floored by a knockdown hit and getting back up. */
  get downed(): boolean {
    return this.state === 'hitstun' && this.downMs > 0;
  }

  /** 0-1 through the current knockdown. */
  get downProgress(): number {
    return this.downed ? Math.min(1, 1 - this.stunTime / this.downMs) : 0;
  }

  get downDurationMs(): number {
    return this.downMs;
  }

  /** Hits pass through: airborne specials and fighters who are down. */
  get untouchable(): boolean {
    return this.flying || this.downed;
  }

  /** Direction the defender is launched; area stuns push away from the user. */
  knockbackDir(defenderX: number): 1 | -1 {
    const s = this.currentSpecial;
    if (s?.type === 'stun') return defenderX >= this.x ? 1 : -1;
    if (s?.type === 'pour') return defenderX >= this.x + this.facing * s.spoutX ? 1 : -1;
    return this.facing;
  }

  update(dt: number, input: InputState, opponentX: number): void {
    const sec = dt / 1000;
    this.opponentX = opponentX;
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);

    if (this.state === 'ko') {
      this.slide(sec);
    } else if (this.state === 'hitstun') {
      this.stunTime -= dt;
      if (this.stunTime <= 0) this.state = 'idle';
      this.slide(sec);
    } else if (this.state === 'attack' || this.state === 'special') {
      this.advanceAction(dt);
      if (!this.dashing && !this.flying) this.slide(sec);
    } else {
      this.facing = opponentX >= this.x ? 1 : -1;
      this.handleFreeInput(input);
    }

    if (this.flying) this.clampToStage();
    else this.integrate(sec);
    this.prev = { ...input };
  }

  /** Returns the health actually lost. */
  takeHit(hit: HitProps, dir: 1 | -1, blocked: boolean): number {
    const damage = blocked ? Math.ceil(hit.damage * BLOCK_CHIP_RATIO) : hit.damage;
    const dealt = Math.min(this.health, damage);
    this.health -= dealt;
    this.gainEnergy(dealt * ENERGY_PER_DAMAGE_TAKEN);
    this.vx = dir * hit.knockback * (blocked ? BLOCK_KNOCKBACK_RATIO : 1);
    this.currentMove = null;
    this.currentSpecial = null;
    if (this.health <= 0) {
      this.state = 'ko';
      return dealt;
    }
    this.state = 'hitstun';
    this.stunTime = blocked ? hit.blockstunMs : hit.hitstunMs;
    this.downMs = hit.knockdown && !blocked ? this.stunTime : 0;
    return dealt;
  }

  /** Damage bounced back by an enemy shield; causes no stun. Returns the health actually lost. */
  takeReflect(damage: number): number {
    return this.loseHealth(damage);
  }

  ignite(burn: BurnEffect): void {
    this.burnMs = burn.durationMs;
    this.burnDps = burn.damagePerSec;
  }

  /** Applies burn damage for this frame; returns the health actually lost. */
  tickBurn(dt: number): number {
    if (!this.burning) return 0;
    const ms = Math.min(dt, this.burnMs);
    this.burnMs -= ms;
    this.burnCarry += (this.burnDps * ms) / 1000;
    const whole = this.burnMs <= 0 ? Math.round(this.burnCarry) : Math.floor(this.burnCarry);
    this.burnCarry = this.burnMs <= 0 ? 0 : this.burnCarry - whole;
    if (whole <= 0) return 0;
    return this.loseHealth(whole);
  }

  private loseHealth(damage: number): number {
    const dealt = Math.min(this.health, damage);
    this.health -= dealt;
    this.gainEnergy(dealt * ENERGY_PER_DAMAGE_TAKEN);
    if (this.health <= 0) {
      this.state = 'ko';
      this.currentMove = null;
      this.currentSpecial = null;
    }
    return dealt;
  }

  gainEnergy(amount: number): void {
    this.energy = Math.min(ENERGY_MAX, this.energy + amount);
  }

  shiftX(dx: number): void {
    this.x += dx;
    this.clampToStage();
  }

  private get dashing(): boolean {
    return this.state === 'special' && this.phase === 'active' && this.currentSpecial?.type === 'dash' && !this.hasHit;
  }

  private forwardBox(h: MoveData['hitbox']): Rect {
    const left = this.facing === 1 ? this.x + h.x : this.x - h.x - h.width;
    return { x: left, y: this.y - h.y, width: h.width, height: h.height };
  }

  private handleFreeInput(input: InputState): void {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const walkSpeed = this.data.stats.walkSpeed;

    if (this.y < GROUND_Y) {
      this.vx = dir * walkSpeed;
      this.state = 'jump';
      return;
    }

    if (input.special && !this.prev.special && this.canSpecial) {
      this.startSpecial();
    } else if (input.block) {
      this.vx = 0;
      this.state = 'block';
    } else if (input.light && !this.prev.light) {
      this.startAttack('light');
    } else if (input.heavy && !this.prev.heavy) {
      this.startAttack('heavy');
    } else if (input.jump) {
      this.vy = -this.data.stats.jumpVelocity;
      this.vx = dir * walkSpeed;
      this.state = 'jump';
    } else {
      this.vx = dir * walkSpeed;
      this.state = dir === 0 ? 'idle' : 'walk';
    }
  }

  private startAttack(name: MoveName): void {
    this.state = 'attack';
    this.currentMove = this.data.moves[name];
    this.currentSpecial = null;
    this.phase = 'startup';
    this.phaseTime = 0;
    this.hasHit = false;
    this.vx = 0;
  }

  private startSpecial(): void {
    const special = this.data.special;
    this.energy -= special.cost;
    this.specialCooldown = special.cooldownMs;
    this.state = 'special';
    this.currentSpecial = special;
    this.currentMove = null;
    this.phase = 'startup';
    this.phaseTime = 0;
    this.hasHit = false;
    this.vx = 0;
    this.flightFromX = this.x;
  }

  /** Steps the current attack or special through startup, active and recovery. */
  private advanceAction(dt: number): void {
    const action = this.currentSpecial ?? this.currentMove;
    if (!action) {
      this.state = 'idle';
      return;
    }
    this.phaseTime += dt;
    if (this.phase === 'startup' && this.phaseTime >= action.startupMs) {
      this.phase = 'active';
      this.phaseTime -= action.startupMs;
      this.onActive();
    }
    if (this.phase === 'active' && this.phaseTime >= action.activeMs) {
      this.phase = 'recovery';
      this.phaseTime -= action.activeMs;
    }
    if (this.phase === 'recovery' && this.phaseTime >= action.recoveryMs) {
      this.state = 'idle';
      this.currentMove = null;
      this.currentSpecial = null;
    }
    if (this.dashing && this.currentSpecial?.type === 'dash') this.vx = this.facing * this.currentSpecial.speed;
    if (this.currentSpecial?.type === 'pour') this.fly(this.currentSpecial, dt);
  }

  /** Rises while gliding over the opponent, hovers and tracks them while pouring, then floats down. */
  private fly(s: PourSpecial, dt: number): void {
    const half = this.data.body.width / 2;
    const target = Math.min(GAME_WIDTH - half, Math.max(half, this.opponentX - this.facing * s.spoutX));
    const t = this.phaseProgress;
    const ease = t * t * (3 - 2 * t);
    if (this.phase === 'startup') {
      this.x = this.flightFromX + (target - this.flightFromX) * ease;
      this.y = GROUND_Y - s.riseHeight * Math.sin((t * Math.PI) / 2);
    } else if (this.phase === 'active') {
      const step = s.trackSpeed * (dt / 1000);
      this.x += Math.max(-step, Math.min(step, target - this.x));
      this.y = GROUND_Y - s.riseHeight;
    } else {
      this.y = GROUND_Y - s.riseHeight * (1 - ease);
    }
    this.vx = 0;
    this.vy = 0;
  }

  private onActive(): void {
    const s = this.currentSpecial;
    if (!s) return;
    if (s.type === 'projectile') {
      const edge = this.facing === 1 ? -s.width / 2 : GAME_WIDTH + s.width / 2;
      const x = s.spawnFrom === 'edge' ? edge : this.x + this.facing * s.spawnX;
      const half = s.width / 2;
      const haltX = s.volley
        ? Math.min(GAME_WIDTH - half, Math.max(half, this.opponentX - this.facing * s.volley.standOffX))
        : x;
      this.spawned.push(new Projectile(this, s, x, this.facing, 'projectile', haltX));
    } else if (s.type === 'teleport') {
      this.teleportBehind(s.behindOffset);
    } else if (s.type === 'summon') {
      const half = s.width / 2;
      const x = Math.min(GAME_WIDTH - half, Math.max(half, this.opponentX - this.facing * s.offsetX));
      const shape = { ...s, speed: 0, armMs: s.strikeDelayMs };
      this.spawned.push(new Projectile(this, shape, x, this.facing, 'helper'));
    }
  }

  /** Reappears on the far side of the opponent facing them; stays on this side if the stage edge is in the way. */
  private teleportBehind(offset: number): void {
    const half = this.data.body.width / 2;
    const behind = this.opponentX + this.facing * offset;
    if (behind >= half && behind <= GAME_WIDTH - half) {
      this.x = behind;
      this.facing = this.facing === 1 ? -1 : 1;
    } else {
      this.x = this.opponentX - this.facing * offset;
      this.clampToStage();
    }
    this.vx = 0;
  }

  private slide(sec: number): void {
    if (this.y >= GROUND_Y) this.vx *= Math.pow(SLIDE_RETENTION, sec);
  }

  private integrate(sec: number): void {
    this.vy += GRAVITY * sec;
    this.x += this.vx * sec;
    this.y += this.vy * sec;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      this.vy = 0;
      if (this.state === 'jump') this.state = 'idle';
    }
    this.clampToStage();
  }

  private clampToStage(): void {
    const half = this.data.body.width / 2;
    this.x = Math.min(GAME_WIDTH - half, Math.max(half, this.x));
  }
}
