import type { FighterData, SpecialData } from '../characters/types';
import type { AttackKind, AttackPhase, Fighter, FighterAction, GrabStage } from '../combat/Fighter';
import type { Rect } from '../combat/geometry';
import type { Projectile, ProjectileShape, VolleyPhase } from '../combat/Projectile';

/** Which side of the match: 0 is P1 (starts on the left), 1 is P2. */
export type Slot = 0 | 1;

export type MatchPhase = 'intro' | 'fight' | 'over';

/** One fighter at the end of a frame. Plain data: safe to keep, compare or send elsewhere. */
export interface FighterSnapshot {
  readonly slot: Slot;
  /** The fighter's static definition. */
  readonly data: FighterData;
  /** Game px; `x` is the body centre and `y` the feet (y grows downward, ground is GROUND_Y). */
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: 1 | -1;
  /** What the fighter is doing right now. */
  readonly action: FighterAction;
  /** Where the current attack or special is in startup / active / recovery. */
  readonly phase: AttackPhase;
  /** 0-1 through `phase`. */
  readonly phaseProgress: number;
  /** The normal attack in progress, if any: the punch, or a high or low kick. */
  readonly move: AttackKind | null;
  /** While grabbing: how far through reaching, lifting and slamming. */
  readonly grab: { readonly stage: GrabStage; readonly progress: number } | null;
  /** While being lifted or slammed by the other fighter. */
  readonly thrown: { readonly stage: 'lift' | 'slam'; readonly progress: number } | null;
  /** Knocked down while already lying on the floor (after a slam), so no fall plays. */
  readonly floored: boolean;
  /** The special in progress, if any. */
  readonly currentSpecial: SpecialData | null;
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly canSpecial: boolean;
  readonly specialCooldownMs: number;
  readonly shieldActive: boolean;
  readonly burning: boolean;
  /** Floored by a knockdown and getting back up. */
  readonly downed: boolean;
  /** 0-1 through the current knockdown. */
  readonly downProgress: number;
  readonly downDurationMs: number;
  readonly hurtbox: Rect;
  /** Present only while a strike can connect. */
  readonly hitbox: Rect | null;
}

/** A projectile or summoned helper at the end of a frame. */
export interface ProjectileSnapshot {
  /** Unique and stable for the projectile's whole life. */
  readonly id: number;
  readonly owner: Slot;
  readonly kind: 'projectile' | 'helper';
  readonly x: number;
  readonly dir: 1 | -1;
  /** ms since it appeared (simulation time). */
  readonly age: number;
  readonly color: string;
  readonly data: ProjectileShape;
  readonly hitbox: Rect;
  /** Past its arming delay, so it can hit. */
  readonly armed: boolean;
  readonly hitsLanded: number;
  /** Whether the last hit was blocked or reflected. */
  readonly blocked: boolean;
  readonly volleyPhase: VolleyPhase;
  readonly holdMs: number;
  readonly dead: boolean;
}

/** Things that happened during one frame, in the order they happened. */
export type MatchEvent =
  | { readonly type: 'roundStart'; readonly round: number }
  | { readonly type: 'fightStart' }
  | { readonly type: 'attack'; readonly slot: Slot; readonly move: AttackKind | 'grab' }
  /** A grab caught the other fighter and is lifting them. */
  | { readonly type: 'grab'; readonly attacker: Slot; readonly defender: Slot }
  | { readonly type: 'special'; readonly slot: Slot }
  /** A special has finished: its startup, active phase and any projectiles it launched are all over. */
  | { readonly type: 'specialEnd'; readonly slot: Slot }
  | {
      readonly type: 'hit';
      readonly attacker: Slot;
      readonly defender: Slot;
      readonly damage: number;
      readonly blocked: boolean;
      /** The defender's shield absorbed the hit and bounced damage back. */
      readonly shielded: boolean;
      readonly fromSpecial: boolean;
      /** The landing of a grab's slam. */
      readonly slam: boolean;
      readonly knockdown: boolean;
      /** Comic-book word for the point of impact. */
      readonly impact?: string;
      /** Contact point in game px. */
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'ko'; readonly slot: Slot }
  | { readonly type: 'roundEnd'; readonly reason: 'ko' | 'time'; readonly winner: Slot | null; readonly wins: readonly [number, number] }
  /** The round's outro is over and the next round should begin. */
  | { readonly type: 'nextRound'; readonly round: number; readonly wins: readonly [number, number] }
  /** The outro is over and someone has won the match (null for a draw). */
  | { readonly type: 'matchEnd'; readonly winner: Slot | null; readonly wins: readonly [number, number] };

/** Everything a renderer needs to draw one frame. */
export interface MatchState {
  /** 1-based. */
  readonly round: number;
  /** Rounds won so far by [P1, P2]. */
  readonly wins: readonly [number, number];
  readonly phase: MatchPhase;
  readonly timeLeftMs: number;
  /** Simulation speed relative to real time this frame (below 1 during slow-motion). */
  readonly timeScale: number;
  readonly fighters: readonly [FighterSnapshot, FighterSnapshot];
  readonly projectiles: readonly ProjectileSnapshot[];
  /** Projectiles that ended this frame, as they were at the end; they are no longer in `projectiles`. */
  readonly endedProjectiles: readonly ProjectileSnapshot[];
  /** Events from this frame only. */
  readonly events: readonly MatchEvent[];
}

/** The fighter winding up a special move, if any: the moment a cutscene camera would push in. */
export const windingUp = (state: MatchState): FighterSnapshot | null =>
  state.fighters.find((f) => f.action === 'special' && f.phase === 'startup') ?? null;

export function snapshotFighter(f: Fighter): FighterSnapshot {
  return {
    slot: f.slot,
    data: f.data,
    x: f.x,
    y: f.y,
    vx: f.vx,
    vy: f.vy,
    facing: f.facing,
    action: f.action,
    phase: f.phase,
    phaseProgress: f.phaseProgress,
    move: f.currentMove === null ? null : f.attackKind,
    grab: f.grabStage === null ? null : { stage: f.grabStage, progress: f.grabProgress },
    thrown: f.carriedBy ? { stage: f.carriedBy.grabStage === 'slam' ? 'slam' : 'lift', progress: f.carriedBy.grabProgress } : null,
    floored: f.floored,
    currentSpecial: f.currentSpecial,
    health: f.health,
    maxHealth: f.data.stats.maxHealth,
    energy: f.energy,
    canSpecial: f.canSpecial,
    specialCooldownMs: f.specialCooldown,
    shieldActive: f.shieldActive,
    burning: f.burning,
    downed: f.downed,
    downProgress: f.downProgress,
    downDurationMs: f.downDurationMs,
    hurtbox: f.hurtbox,
    hitbox: f.hitbox,
  };
}

export function snapshotProjectile(p: Projectile): ProjectileSnapshot {
  return {
    id: p.id,
    owner: p.owner.slot,
    kind: p.kind,
    x: p.x,
    dir: p.dir,
    age: p.age,
    color: p.color,
    data: p.data,
    hitbox: p.hitbox,
    armed: p.armed,
    hitsLanded: p.hitsLanded,
    blocked: p.blocked,
    volleyPhase: p.volleyPhase,
    holdMs: p.holdMs,
    dead: p.dead,
  };
}
