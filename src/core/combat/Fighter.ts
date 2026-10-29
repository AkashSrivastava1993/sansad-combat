import {
  BLOCK_CHIP_RATIO,
  BLOCK_KNOCKBACK_RATIO,
  ENERGY_MAX,
  ENERGY_PER_DAMAGE_TAKEN,
  GRAB,
  GRAVITY,
  GROUND_Y,
  HIGH_KICK,
  SLIDE_RETENTION,
} from '../config';
import type {
  BurnEffect,
  FighterData,
  HitProps,
  MoveData,
  MoveName,
  SpecialData,
} from '../characters/types';
import { emptyInput, type InputState } from '../input/InputState';
import { clampToArena, forwardRect, type Rect } from './geometry';
import type { Projectile } from './Projectile';
import { launchSpecial } from './specials';

export type FighterAction = 'idle' | 'walk' | 'jump' | 'block' | 'attack' | 'special' | 'grab' | 'thrown' | 'hitstun' | 'ko';
export type AttackPhase = 'startup' | 'active' | 'recovery';
/** The punch, or one of the two kicks the heavy attack alternates between. */
export type AttackKind = 'light' | 'high' | 'low';
export type GrabStage = 'startup' | 'reach' | 'lift' | 'slam' | 'recovery';

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);

export class Fighter {
  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  health: number;
  action: FighterAction = 'idle';
  phase: AttackPhase = 'startup';
  currentMove: MoveData | null = null;
  currentSpecial: SpecialData | null = null;
  attackKind: AttackKind | null = null;
  grabStage: GrabStage | null = null;
  /** The fighter being lifted and slammed, while this one is grabbing. */
  carried: Fighter | null = null;
  /** The fighter holding this one up. */
  carriedBy: Fighter | null = null;
  /** A slam has landed and waits for the combat system to apply it. */
  slamDue = false;
  /** Knocked down while already lying on the floor, so there is no fall to play. */
  floored = false;
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
  /** Length of the current knockdown; 0 when the hitstun is an ordinary one. */
  private downMs = 0;
  private prev: InputState = emptyInput();
  private opponentX = 0;
  private grabTime = 0;
  private grabWhiffed = false;
  /** How far in front of the thrower the victim was when caught. */
  private carryFrom = 0;
  private nextKickHigh = true;
  private readonly highKick: MoveData;

  constructor(
    readonly data: FighterData,
    x: number,
    facing: 1 | -1,
    /** Which side of the match this fighter belongs to: 0 for P1, 1 for P2. */
    readonly slot: 0 | 1,
  ) {
    this.x = x;
    this.facing = facing;
    this.health = data.stats.maxHealth;
    const heavy = data.moves.heavy;
    this.highKick = {
      ...heavy,
      startupMs: heavy.startupMs + HIGH_KICK.extraStartupMs,
      hitbox: { x: heavy.hitbox.x - HIGH_KICK.reachTrimPx, y: HIGH_KICK.top, width: heavy.hitbox.width - 6, height: HIGH_KICK.height },
    };
  }

  get hurtbox(): Rect {
    const { width, height } = this.data.body;
    return { x: this.x - width / 2, y: this.y - height, width, height };
  }

  get hitbox(): Rect | null {
    if (this.phase !== 'active') return null;
    if (this.action === 'attack' && this.currentMove) return this.forwardBox(this.currentMove.hitbox);
    const s = this.currentSpecial;
    if (this.action !== 'special' || !s) return null;
    if (s.type === 'dash' || s.type === 'teleport') return this.forwardBox(s.hitbox);
    if (s.type === 'stun') {
      return { x: this.x - s.area.width / 2, y: this.y - s.area.height, width: s.area.width, height: s.area.height };
    }
    return null;
  }

  /** Hit properties of the strike currently active, if any. */
  get activeHit(): HitProps | null {
    if (!this.hitbox) return null;
    const s = this.currentSpecial;
    if (s && (s.type === 'dash' || s.type === 'stun' || s.type === 'teleport')) return s;
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
    return this.action === 'special' && this.phase === 'active' && this.currentSpecial?.type === 'shield';
  }

  get burning(): boolean {
    return this.burnMs > 0 && this.action !== 'ko';
  }

  /** Floored by a knockdown hit and getting back up. */
  get downed(): boolean {
    return this.action === 'hitstun' && this.downMs > 0;
  }

  /** 0-1 through the current knockdown. */
  get downProgress(): number {
    return this.downed ? Math.min(1, 1 - this.stunTime / this.downMs) : 0;
  }

  get downDurationMs(): number {
    return this.downMs;
  }

  /** Hits pass through a fighter who is down or being slammed. */
  get untouchable(): boolean {
    return this.downed || this.action === 'thrown';
  }

  /** Holding or being held, so the two bodies must not be pushed apart. */
  get grappling(): boolean {
    return this.carried !== null || this.carriedBy !== null;
  }

  /** Grabs catch anyone standing on the ground who is not already in the middle of something heavy. */
  get grabbable(): boolean {
    return this.y >= GROUND_Y && !this.untouchable && !['ko', 'hitstun', 'thrown', 'grab'].includes(this.action);
  }

  /** The hands' catching area while a grab is reaching. */
  get grabBox(): Rect | null {
    if (this.action !== 'grab' || this.grabStage !== 'reach') return null;
    const { width, height } = this.data.body;
    return forwardRect(this.x, this.y, this.facing, { x: 0, y: height * 0.85, width: width / 2 + GRAB.reachPx, height: height * 0.75 });
  }

  /** 0-1 through the current grab stage, for animation. */
  get grabProgress(): number {
    const ms = {
      startup: GRAB.startupMs,
      reach: GRAB.windowMs,
      lift: GRAB.liftMs,
      slam: GRAB.slamMs,
      recovery: this.grabWhiffed ? GRAB.whiffRecoveryMs : GRAB.recoveryMs,
    };
    return this.grabStage ? Math.min(1, this.grabTime / ms[this.grabStage]) : 0;
  }

  /** What the slam does when it lands. */
  slamHit(): HitProps {
    return {
      damage: Math.round(this.data.moves.heavy.damage * GRAB.damageRatio),
      hitstunMs: GRAB.hitstunMs,
      blockstunMs: 0,
      knockback: GRAB.knockback,
      knockdown: true,
      impact: 'SLAM!',
    };
  }

  /** Catches `victim` and starts lifting them. */
  beginCarry(victim: Fighter): void {
    this.carried = victim;
    victim.carriedBy = this;
    victim.action = 'thrown';
    victim.currentMove = null;
    victim.currentSpecial = null;
    victim.vx = 0;
    victim.vy = 0;
    victim.downMs = 0;
    this.carryFrom = Math.min(90, Math.max(20, (victim.x - this.x) * this.facing));
    this.grabStage = 'lift';
    this.grabTime = 0;
  }

  /** Puts a held fighter back on their feet, e.g. when the grab is broken. */
  release(): void {
    this.carriedBy = null;
    if (this.action === 'thrown') this.action = 'idle';
    this.y = GROUND_Y;
  }

  /** Direction the defender is launched; area stuns push away from the user. */
  knockbackDir(defenderX: number): 1 | -1 {
    const s = this.currentSpecial;
    if (s?.type === 'stun') return defenderX >= this.x ? 1 : -1;
    return this.facing;
  }

  update(dt: number, input: InputState, opponentX: number): void {
    const sec = dt / 1000;
    this.opponentX = opponentX;
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);

    if (this.action === 'ko') {
      this.slide(sec);
    } else if (this.action === 'hitstun') {
      this.stunTime -= dt;
      if (this.stunTime <= 0) this.action = 'idle';
      this.slide(sec);
    } else if (this.action === 'thrown') {
      // The thrower moves this fighter.
      this.vx = 0;
      this.vy = 0;
      this.prev = { ...input };
      return;
    } else if (this.action === 'grab') {
      this.advanceGrab(dt);
      this.slide(sec);
    } else if (this.action === 'attack' || this.action === 'special') {
      this.advanceAction(dt);
      if (!this.dashing) this.slide(sec);
    } else {
      this.facing = opponentX >= this.x ? 1 : -1;
      this.handleFreeInput(input);
    }

    this.integrate(sec);
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
    this.floored = false;
    this.grabStage = null;
    this.dropCarried();
    if (this.health <= 0) {
      this.action = 'ko';
      return dealt;
    }
    this.action = 'hitstun';
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
      this.action = 'ko';
      this.currentMove = null;
      this.currentSpecial = null;
      this.dropCarried();
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
    return this.action === 'special' && this.phase === 'active' && this.currentSpecial?.type === 'dash' && !this.hasHit;
  }

  private forwardBox(h: MoveData['hitbox']): Rect {
    return forwardRect(this.x, this.y, this.facing, h);
  }

  private handleFreeInput(input: InputState): void {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const walkSpeed = this.data.stats.walkSpeed;

    if (this.y < GROUND_Y) {
      this.vx = dir * walkSpeed;
      this.action = 'jump';
      return;
    }

    if (input.special && !this.prev.special && this.canSpecial) {
      this.startSpecial();
    } else if (input.grab && !this.prev.grab) {
      this.startGrab();
    } else if (input.block) {
      this.vx = 0;
      this.action = 'block';
    } else if (input.light && !this.prev.light) {
      this.startAttack('light');
    } else if (input.heavy && !this.prev.heavy) {
      this.startAttack('heavy');
    } else if (input.jump) {
      this.vy = -this.data.stats.jumpVelocity;
      this.vx = dir * walkSpeed;
      this.action = 'jump';
    } else {
      this.vx = dir * walkSpeed;
      this.action = dir === 0 ? 'idle' : 'walk';
    }
  }

  private startAttack(name: MoveName): void {
    this.action = 'attack';
    if (name === 'heavy') {
      const high = this.nextKickHigh;
      this.nextKickHigh = !high;
      this.currentMove = high ? this.highKick : this.data.moves.heavy;
      this.attackKind = high ? 'high' : 'low';
    } else {
      this.currentMove = this.data.moves[name];
      this.attackKind = 'light';
    }
    this.currentSpecial = null;
    this.phase = 'startup';
    this.phaseTime = 0;
    this.hasHit = false;
    this.vx = 0;
  }

  private startGrab(): void {
    this.action = 'grab';
    this.grabStage = 'startup';
    this.grabTime = 0;
    this.grabWhiffed = false;
    this.currentMove = null;
    this.currentSpecial = null;
    this.attackKind = null;
    this.vx = 0;
  }

  /** Steps a grab through reach, lift, slam and recovery; the combat system decides whether the hands caught anyone. */
  private advanceGrab(dt: number): void {
    this.grabTime += dt;
    if (this.carried?.action === 'ko') {
      this.dropCarried();
      this.grabStage = 'recovery';
      this.grabTime = 0;
    }
    switch (this.grabStage) {
      case 'startup':
        if (this.grabTime >= GRAB.startupMs) {
          this.grabStage = 'reach';
          this.grabTime -= GRAB.startupMs;
        }
        break;
      case 'reach':
        if (this.grabTime >= GRAB.windowMs) {
          this.grabStage = 'recovery';
          this.grabTime = 0;
          this.grabWhiffed = true;
        }
        break;
      case 'lift':
        this.placeCarried();
        if (this.grabTime >= GRAB.liftMs) {
          this.grabStage = 'slam';
          this.grabTime -= GRAB.liftMs;
        }
        break;
      case 'slam':
        this.placeCarried();
        if (this.grabTime >= GRAB.slamMs) {
          this.slamDue = true;
          this.grabStage = 'recovery';
          this.grabTime = 0;
        }
        break;
      case 'recovery':
        if (this.grabTime >= (this.grabWhiffed ? GRAB.whiffRecoveryMs : GRAB.recoveryMs)) {
          this.grabStage = null;
          this.action = 'idle';
        }
        break;
      default:
        this.action = 'idle';
    }
  }

  /** Swings the held fighter up over the head, then down onto the floor in front. */
  private placeCarried(): void {
    const victim = this.carried;
    if (!victim) return;
    const lifting = this.grabStage === 'lift';
    const t = Math.min(1, this.grabTime / (lifting ? GRAB.liftMs : GRAB.slamMs));
    const top = this.data.body.height * GRAB.holdHeight;
    const forward = lifting ? mix(this.carryFrom, -GRAB.holdBehindPx, smooth(t)) : mix(-GRAB.holdBehindPx, GRAB.landAheadPx, 1 - (1 - t) * (1 - t));
    const up = lifting ? top * smooth(t) : top * (1 - t * t);
    victim.x = clampToArena(this.x + this.facing * forward, victim.data.body.width);
    victim.y = GROUND_Y - up;
  }

  private dropCarried(): void {
    this.carried?.release();
    this.carried = null;
  }

  private startSpecial(): void {
    const special = this.data.special;
    this.energy -= special.cost;
    this.specialCooldown = special.cooldownMs;
    this.action = 'special';
    this.currentSpecial = special;
    this.currentMove = null;
    this.attackKind = null;
    this.phase = 'startup';
    this.phaseTime = 0;
    this.hasHit = false;
    this.vx = 0;
  }

  /** Steps the current attack or special through startup, active and recovery. */
  private advanceAction(dt: number): void {
    const action = this.currentSpecial ?? this.currentMove;
    if (!action) {
      this.action = 'idle';
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
      this.action = 'idle';
      this.currentMove = null;
      this.currentSpecial = null;
    }
    if (this.dashing && this.currentSpecial?.type === 'dash') this.vx = this.facing * this.currentSpecial.speed;
  }

  private onActive(): void {
    const s = this.currentSpecial;
    if (!s) return;
    const launch = launchSpecial(this, s, this.opponentX);
    if (launch?.kind === 'spawn') {
      this.spawned.push(launch.projectile);
    } else if (launch?.kind === 'teleport') {
      this.x = launch.x;
      this.facing = launch.facing;
      this.vx = 0;
    }
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
      if (this.action === 'jump') this.action = 'idle';
    }
    this.clampToStage();
  }

  private clampToStage(): void {
    this.x = clampToArena(this.x, this.data.body.width);
  }
}
