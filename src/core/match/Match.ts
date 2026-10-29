import { AIController } from '../ai/AIController';
import type { AIProfile } from '../ai/difficulty';
import type { FighterData } from '../characters/types';
import { CombatSystem, type HitEvent } from '../combat/CombatSystem';
import { Fighter, type FighterAction, type GrabStage } from '../combat/Fighter';
import {
  HIT_STOP_MS,
  KO_SLOWMO_MS,
  KO_SLOWMO_SCALE,
  MAX_FRAME_MS,
  P1_START_X,
  P2_START_X,
  ROUND_INTRO_MS,
  ROUND_OUTRO_MS,
  ROUND_TIME_MS,
  ROUNDS_TO_WIN,
  SPECIAL_HIT_SLOWMO,
  SPECIAL_SLOW_SCALE,
} from '../config';
import { emptyInput, type InputSource } from '../input/InputState';
import { type MatchEvent, type MatchPhase, type MatchState, type Slot, snapshotFighter, snapshotProjectile } from './state';

/** Who drives a fighter: an input source (keyboard, touch, network...) or the built-in AI. */
export type Controller = { kind: 'input'; source: InputSource } | { kind: 'ai'; profile: AIProfile };

export interface MatchOptions {
  p1: FighterData;
  p2: FighterData;
  controllers: readonly [Controller, Controller];
  /** 1-based round number; defaults to 1. */
  round?: number;
  /** Rounds won so far by [P1, P2]; defaults to [0, 0]. */
  wins?: readonly [number, number];
  /** Freeze the fight briefly on each hit; defaults to true. */
  hitStop?: boolean;
}

/**
 * One round of a match, simulated without any rendering: call `step` once per frame with the real elapsed
 * time and draw the returned state. Time-based events (intro, slow-motion, outro) are driven by that clock.
 */
export class Match {
  private readonly fighters: readonly [Fighter, Fighter];
  private readonly combat = new CombatSystem();
  private readonly inputs: readonly [InputSource, InputSource];
  private readonly round: number;
  private readonly wins: [number, number];
  private phase: MatchPhase = 'intro';
  /** Real time spent in the current intro or outro. */
  private phaseMs = 0;
  private timeLeft = ROUND_TIME_MS;
  private slowMoMs = 0;
  private slowMoScale = KO_SLOWMO_SCALE;
  private timeScale = 1;
  private readonly hitStop: boolean;
  private hitStopMs = 0;
  private concluded = false;
  /** Whether each fighter has a special in progress that has not yet settled. */
  private casting: [boolean, boolean] = [false, false];
  private prevActions: [FighterAction, FighterAction] = ['idle', 'idle'];
  private prevGrabs: [GrabStage | null, GrabStage | null] = [null, null];
  private pending: MatchEvent[];
  private latest: MatchState;

  constructor(options: MatchOptions) {
    this.round = options.round ?? 1;
    this.hitStop = options.hitStop ?? true;
    this.wins = [...(options.wins ?? [0, 0])];
    const p1 = new Fighter(options.p1, P1_START_X, 1, 0);
    const p2 = new Fighter(options.p2, P2_START_X, -1, 1);
    this.fighters = [p1, p2];
    this.inputs = [this.resolveController(options.controllers[0], p1, p2), this.resolveController(options.controllers[1], p2, p1)];
    this.pending = [{ type: 'roundStart', round: this.round }];
    this.latest = this.snapshot([]);
  }

  /** The state as of the last `step` (or the starting state before the first one). */
  get state(): MatchState {
    return this.latest;
  }

  /** Advances the match by `deltaMs` of real time and returns the resulting state. */
  step(deltaMs: number): MatchState {
    const events = this.pending.splice(0);
    const rawDt = Math.min(deltaMs, MAX_FRAME_MS);
    this.advanceClock(rawDt, events);

    let dt = rawDt;
    if (this.hitStopMs > 0) {
      this.hitStopMs -= rawDt;
      dt = 0;
    } else if (this.slowMoMs > 0) {
      this.slowMoMs -= rawDt;
      dt = rawDt * this.slowMoScale;
    } else if (this.specialOnScreen()) {
      dt = rawDt * SPECIAL_SLOW_SCALE;
    }
    this.timeScale = rawDt > 0 ? dt / rawDt : 1;

    const [a, b] = this.fighters;
    const fighting = this.phase === 'fight';

    if (this.phase !== 'intro') {
      const ia = fighting ? this.inputs[0].poll(dt) : emptyInput();
      const ib = fighting ? this.inputs[1].poll(dt) : emptyInput();
      a.update(dt, ia, b.x);
      b.update(dt, ib, a.x);
      if (!a.grappling && !b.grappling) this.combat.separate(a, b);
      this.fighters.forEach((f, i) => this.announceActions(f, i as Slot, events));
    }

    if (fighting) {
      for (const hit of this.combat.resolve(a, b, dt)) this.onHit(hit, events);
      this.settleSpecials(events);
      this.timeLeft -= dt;
      if (a.health <= 0 || b.health <= 0 || this.timeLeft <= 0) this.endRound(events);
    } else if (this.phase === 'over') {
      // Summoned objects finish their exit but can no longer hit.
      this.combat.coast(a, b, dt);
    }

    this.concludeIfOutroDone(events);
    this.latest = this.snapshot(events);
    return this.latest;
  }

  destroy(): void {
    for (const input of this.inputs) input.destroy?.();
  }

  private resolveController(c: Controller, self: Fighter, opponent: Fighter): InputSource {
    return c.kind === 'input' ? c.source : new AIController(self, opponent, c.profile, this.combat.projectiles);
  }

  private advanceClock(rawDt: number, events: MatchEvent[]): void {
    if (this.phase === 'intro') {
      this.phaseMs += rawDt;
      if (this.phaseMs >= ROUND_INTRO_MS) {
        this.phase = 'fight';
        this.phaseMs = 0;
        events.push({ type: 'fightStart' });
      }
    } else if (this.phase === 'over') {
      this.phaseMs += rawDt;
    }
  }

  /** A special (or its summoned projectiles) is still playing out. */
  private specialOnScreen(): boolean {
    return this.fighters.some((f) => f.action === 'special') || this.combat.projectiles.some((p) => !p.dead);
  }

  private announceActions(f: Fighter, slot: Slot, events: MatchEvent[]): void {
    if (f.action !== this.prevActions[slot]) {
      if (f.action === 'attack') {
        events.push({ type: 'attack', slot, move: f.attackKind ?? 'light' });
      } else if (f.action === 'grab') {
        events.push({ type: 'attack', slot, move: 'grab' });
      } else if (f.action === 'special') {
        this.casting[slot] = true;
        events.push({ type: 'special', slot });
      }
    }
    this.prevActions[slot] = f.action;
    if (f.grabStage === 'lift' && this.prevGrabs[slot] !== 'lift' && f.carried) {
      events.push({ type: 'grab', attacker: slot, defender: f.carried.slot });
    }
    this.prevGrabs[slot] = f.grabStage;
  }

  /** A special ends once it is out of startup/active and has no projectiles left on stage. */
  private settleSpecials(events: MatchEvent[]): void {
    this.fighters.forEach((f, i) => {
      if (!this.casting[i]) return;
      const striking = f.action === 'special' && (f.phase === 'startup' || f.phase === 'active');
      if (striking || this.combat.projectiles.some((p) => p.owner === f && !p.dead)) return;
      this.casting[i] = false;
      events.push({ type: 'specialEnd', slot: f.slot });
    });
  }

  private onHit(ev: HitEvent, events: MatchEvent[]): void {
    if (ev.fromSpecial && this.casting[ev.attacker.slot] && !ev.blocked && !ev.shielded) {
      this.slowMoMs = Math.max(this.slowMoMs, SPECIAL_HIT_SLOWMO.ms);
      this.slowMoScale = SPECIAL_HIT_SLOWMO.scale;
    }
    if (this.hitStop) this.hitStopMs = Math.max(this.hitStopMs, this.hitStopFor(ev));
    events.push({
      type: 'hit',
      attacker: ev.attacker.slot,
      defender: ev.defender.slot,
      damage: ev.hit.damage,
      blocked: ev.blocked,
      shielded: ev.shielded,
      fromSpecial: ev.fromSpecial,
      slam: ev.slam === true,
      knockdown: ev.hit.knockdown === true,
      impact: ev.hit.impact,
      x: ev.x,
      y: ev.y,
    });
  }

  private hitStopFor(ev: HitEvent): number {
    if (ev.defender.health <= 0) return HIT_STOP_MS.ko;
    if (ev.slam) return HIT_STOP_MS.slam;
    if (ev.blocked || ev.shielded) return HIT_STOP_MS.block;
    return ev.fromSpecial ? HIT_STOP_MS.special : HIT_STOP_MS.hit;
  }

  private endRound(events: MatchEvent[]): void {
    this.phase = 'over';
    this.phaseMs = 0;
    const [a, b] = this.fighters;
    const winner: Slot | null = a.health === b.health ? null : a.health > b.health ? 0 : 1;
    // A drawn round counts for both players.
    if (winner === null) {
      this.wins[0] += 1;
      this.wins[1] += 1;
    } else {
      this.wins[winner] += 1;
    }

    const ko = a.health <= 0 || b.health <= 0;
    if (ko) {
      this.slowMoMs = KO_SLOWMO_MS;
      this.slowMoScale = KO_SLOWMO_SCALE;
      for (const f of this.fighters) if (f.health <= 0) events.push({ type: 'ko', slot: f.slot });
    }
    events.push({ type: 'roundEnd', reason: ko ? 'ko' : 'time', winner, wins: [...this.wins] });
  }

  private concludeIfOutroDone(events: MatchEvent[]): void {
    if (this.phase !== 'over' || this.concluded || this.phaseMs < ROUND_OUTRO_MS) return;
    this.concluded = true;
    const p1Won = this.wins[0] >= ROUNDS_TO_WIN;
    const p2Won = this.wins[1] >= ROUNDS_TO_WIN;
    if (p1Won || p2Won) {
      events.push({ type: 'matchEnd', winner: p1Won && p2Won ? null : p1Won ? 0 : 1, wins: [...this.wins] });
    } else {
      events.push({ type: 'nextRound', round: this.round + 1, wins: [...this.wins] });
    }
  }

  private snapshot(events: MatchEvent[]): MatchState {
    return {
      round: this.round,
      wins: [...this.wins],
      phase: this.phase,
      timeLeftMs: this.timeLeft,
      timeScale: this.timeScale,
      fighters: [snapshotFighter(this.fighters[0]), snapshotFighter(this.fighters[1])],
      projectiles: this.combat.projectiles.map(snapshotProjectile),
      endedProjectiles: this.combat.takeEnded().map(snapshotProjectile),
      events,
    };
  }
}
