import Phaser from 'phaser';
import { getFighter } from '../characters/registry';
import {
  BLOCK_SHAKE,
  FIGHT_BANNER_MS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GROUND_Y,
  HIT_SHAKE,
  KNOCKDOWN_FLASH_MS,
  KNOCKDOWN_SHAKE,
  KO_FLASH_MS,
  KO_SHAKE,
  KO_SLOWMO_MS,
  KO_SLOWMO_SCALE,
  P1_START_X,
  P2_START_X,
  ROUND_INTRO_MS,
  ROUND_OUTRO_MS,
  ROUND_TIME_MS,
  ROUNDS_TO_WIN,
  SHAKE_REF_DAMAGE,
} from '../config';
import { Stage3D } from '../render3d/Stage3D';
import { AIController } from '../systems/ai/AIController';
import { AI_PROFILES } from '../systems/ai/difficulty';
import { bindPhaserSfx, playSfx } from '../systems/audio/sfx';
import { CombatSystem, type HitEvent } from '../systems/combat/CombatSystem';
import { Fighter, type FighterState } from '../systems/combat/Fighter';
import { KeyboardInput, P1_KEYS, P2_KEYS } from '../systems/input/KeyboardInput';
import { CompositeInput, emptyInput, type InputSource } from '../systems/input/InputState';
import { touchControls } from '../systems/input/TouchControls';
import { FighterView, phaserPuppet, type ScreenPoint } from '../ui/FighterView';
import { HitSparks } from '../ui/HitSparks';
import { Hud } from '../ui/Hud';
import { ProjectileLayer } from '../ui/ProjectileLayer';
import { createSpecialFx } from '../ui/specials';
import type { SpecialFx } from '../ui/specials/kit';
import { showTaunt } from '../ui/TauntBubble';
import { textStyle } from '../ui/ui';
import {
  SceneKey,
  VIEW_MODE_KEY,
  VIEW_MODES,
  type CharacterSelectData,
  type FightData,
  type ResultData,
  type ViewMode,
} from './sceneData';

type Phase = 'intro' | 'fight' | 'over';

export class FightScene extends Phaser.Scene {
  private config!: FightData;
  private round = 1;
  private wins: [number, number] = [0, 0];
  private fighters!: [Fighter, Fighter];
  private views: FighterView[] = [];
  private specialFx: SpecialFx[] = [];
  private inputs!: [InputSource, InputSource];
  private hud!: Hud;
  private projectileLayer!: ProjectileLayer;
  private sparks!: HitSparks;
  private banner!: Phaser.GameObjects.Text;
  private readonly combat = new CombatSystem();
  private phase: Phase = 'intro';
  private timeLeft = ROUND_TIME_MS;
  private slowMoMs = 0;
  private prevStates: FighterState[] = ['idle', 'idle'];
  private stage: Stage3D | null = null;

  constructor() {
    super(SceneKey.Fight);
  }

  /** Screen position of a point on the fight plane; identity in 2D. */
  private readonly toScreen = (x: number, y: number): ScreenPoint =>
    this.stage ? this.stage.project(x, y) : { x, y, zoom: 1 };

  init(data: FightData): void {
    this.config = data;
    this.round = data.round ?? 1;
    this.wins = [...(data.wins ?? [0, 0])];
    this.phase = 'intro';
    this.timeLeft = ROUND_TIME_MS;
    this.slowMoMs = 0;
    this.prevStates = ['idle', 'idle'];
    this.views = [];
    this.specialFx = [];
    this.combat.projectiles.length = 0;
  }

  create(): void {
    const p1Data = getFighter(this.config.p1);
    const p2Data = getFighter(this.config.p2);
    if (!p1Data || !p2Data) {
      this.scene.start(SceneKey.CharacterSelect, {
        mode: this.config.mode,
        difficulty: this.config.difficulty,
      } satisfies CharacterSelectData);
      return;
    }

    const viewMode = (this.registry.get(VIEW_MODE_KEY) as ViewMode | undefined) ?? VIEW_MODES[0]!;
    this.stage = viewMode === '2d' ? null : Stage3D.get();
    if (this.stage) {
      this.stage.begin(this.game.canvas);
      // Darkens the busy backdrop behind the health bars.
      this.add.graphics().fillGradientStyle(0x07080d, 0x07080d, 0x07080d, 0x07080d, 0.85, 0.85, 0, 0).fillRect(0, 0, GAME_WIDTH, 120);
    } else {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x141a2b);
      this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + (GAME_HEIGHT - GROUND_Y) / 2, GAME_WIDTH, GAME_HEIGHT - GROUND_Y, 0x2a3148);
    }

    const p1 = new Fighter(p1Data, P1_START_X, 1);
    const p2 = new Fighter(p2Data, P2_START_X, -1);
    this.fighters = [p1, p2];
    const style = viewMode === '3d-models' ? 'model' : 'cutout';
    this.views = this.fighters.map(
      (f) =>
        new FighterView(this, f, this.stage ? this.stage.addFighter(f.data, style) : phaserPuppet(this, f.data), this.toScreen),
    );
    this.specialFx = this.fighters.flatMap((f) => createSpecialFx(this, f, this.toScreen) ?? []);
    this.projectileLayer = new ProjectileLayer(this);
    this.sparks = new HitSparks(this);
    this.hud = new Hud(this, this.fighters, this.wins);

    const cpu = this.config.mode === 'cpu';
    this.inputs = [
      new CompositeInput([new KeyboardInput(this, P1_KEYS, ...(cpu ? [P2_KEYS] : [])), touchControls]),
      cpu
        ? new AIController(p2, p1, AI_PROFILES[this.config.difficulty], this.combat.projectiles)
        : new KeyboardInput(this, P2_KEYS),
    ];

    this.banner = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', textStyle(96))
      .setOrigin(0.5)
      .setDepth(20);
    this.showBanner(`ROUND ${this.round}`);
    playSfx('roundStart');
    for (const f of this.fighters) {
      const line = f.data.taunts?.[Math.floor(Math.random() * f.data.taunts.length)];
      if (line) showTaunt(this, this.toScreen(f.x, f.y).x, line, Phaser.Display.Color.HexStringToColor(f.data.color).color);
    }
    this.time.delayedCall(ROUND_INTRO_MS, () => {
      this.phase = 'fight';
      this.showBanner('FIGHT!');
      playSfx('fight');
      this.time.delayedCall(FIGHT_BANNER_MS, () => {
        if (this.phase === 'fight') this.showBanner('');
      });
    });

    const unbindSfx = bindPhaserSfx(this);
    touchControls.show();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unbindSfx();
      touchControls.hide();
      this.inputs.forEach((i) => i.destroy?.());
      this.stage?.end();
    });
  }

  update(_time: number, delta: number): void {
    if (!this.fighters) return;
    const rawDt = Math.min(delta, 50);
    let dt = rawDt;
    if (this.slowMoMs > 0) {
      this.slowMoMs -= rawDt;
      dt = rawDt * KO_SLOWMO_SCALE;
    }
    const [a, b] = this.fighters;
    const fighting = this.phase === 'fight';

    if (this.phase !== 'intro') {
      const ia = fighting ? this.inputs[0].poll(dt) : emptyInput();
      const ib = fighting ? this.inputs[1].poll(dt) : emptyInput();
      a.update(dt, ia, b.x);
      b.update(dt, ib, a.x);
      this.combat.separate(a, b);
      this.fighters.forEach((f, i) => this.announceActions(f, i));
    }

    if (fighting) {
      for (const hit of this.combat.resolve(a, b, dt)) this.onHit(hit);
      this.timeLeft -= dt;
      if (a.health <= 0 || b.health <= 0 || this.timeLeft <= 0) this.endRound();
    } else if (this.phase === 'over') {
      // Summoned objects finish their exit but can no longer hit.
      this.combat.coast(a, b, dt);
    }

    this.views.forEach((v) => v.update());
    for (const fx of this.specialFx) fx.update(this.time.now, this.combat.projectiles);
    if (this.stage) {
      this.stage.updateProjectiles(this.combat.projectiles);
      this.stage.render(this.fighters.map((f) => ({ x: f.x, top: f.y - f.data.body.height })), delta);
    } else {
      this.projectileLayer.update(this.combat.projectiles);
    }
    this.hud.update(this.timeLeft);
  }

  private announceActions(f: Fighter, index: number): void {
    const prev = this.prevStates[index];
    if (f.state !== prev) {
      if (f.state === 'attack') playSfx('attack');
      else if (f.state === 'special') playSfx('special');
    }
    this.prevStates[index] = f.state;
  }

  private onHit(ev: HitEvent): void {
    const kind = ev.shielded ? 'shield' : ev.blocked ? 'block' : 'hit';
    const shake = kind === 'hit' ? HIT_SHAKE : BLOCK_SHAKE;
    const scale = Phaser.Math.Clamp(ev.hit.damage / SHAKE_REF_DAMAGE, 0.5, 1.5);
    this.shake(shake.ms, shake.intensity * scale);
    const at = this.toScreen(ev.x, ev.y);
    this.sparks.burst(at.x, at.y, kind, ev.defender.x >= ev.attacker.x ? 1 : -1, ev.hit.damage);
    if (kind === 'hit') {
      if (ev.hit.impact) this.sparks.comic(at.x, at.y, ev.hit.impact, Phaser.Display.Color.HexStringToColor(ev.attacker.data.color).color, ev.hit.knockdown ? 1.2 : 0.8);
      if (ev.defender.downed) {
        this.shake(KNOCKDOWN_SHAKE.ms, KNOCKDOWN_SHAKE.intensity, true);
        this.cameras.main.flash(KNOCKDOWN_FLASH_MS, 255, 244, 214);
      }
      this.stage?.cheer(ev.hit.damage / 40);
    }
    playSfx(kind, { damage: ev.hit.damage });
  }

  private shake(ms: number, intensity: number, force = false): void {
    if (this.stage) this.stage.shake(ms, intensity, force);
    else this.cameras.main.shake(ms, intensity, force);
  }

  private showBanner(text: string, color = '#ffffff'): void {
    this.tweens.killTweensOf(this.banner);
    this.banner.setText(text).setColor(color).setScale(1).setAngle(0);
    if (!text) return;
    this.banner.setScale(2.2).setAngle(-6);
    this.tweens.add({ targets: this.banner, scale: 1, angle: 0, duration: 240, ease: 'Back.easeOut' });
  }

  private playKoSequence(): void {
    const cam = this.cameras.main;
    this.shake(KO_SHAKE.ms, KO_SHAKE.intensity, true);
    cam.flash(KO_FLASH_MS, 255, 255, 255);
    this.slowMoMs = KO_SLOWMO_MS;
    this.stage?.cheer(1);
    for (const f of this.fighters) {
      if (f.health > 0) continue;
      const at = this.toScreen(f.x, f.y - f.data.body.height / 2);
      this.sparks.burst(at.x, at.y, 'ko', f.facing === 1 ? -1 : 1, f.data.stats.maxHealth / 4);
    }
    playSfx('ko');
  }

  private endRound(): void {
    this.phase = 'over';
    const [a, b] = this.fighters;
    const roundWinner = a.health === b.health ? null : a.health > b.health ? 0 : 1;
    // A drawn round counts for both players.
    if (roundWinner === null) this.wins = [this.wins[0] + 1, this.wins[1] + 1];
    else this.wins[roundWinner] += 1;

    const ko = a.health <= 0 || b.health <= 0;
    this.views[0]?.setOutcome(roundWinner === null ? null : roundWinner === 0 ? 'win' : 'lose');
    this.views[1]?.setOutcome(roundWinner === null ? null : roundWinner === 1 ? 'win' : 'lose');
    if (ko) {
      this.showBanner('K.O.', '#e5483f');
      this.playKoSequence();
    } else {
      this.showBanner('TIME');
      playSfx('timeUp');
    }

    const p1Won = this.wins[0] >= ROUNDS_TO_WIN;
    const p2Won = this.wins[1] >= ROUNDS_TO_WIN;
    this.time.delayedCall(ROUND_OUTRO_MS, () => {
      if (p1Won || p2Won) {
        const winner: ResultData['winner'] = p1Won && p2Won ? null : p1Won ? 0 : 1;
        this.scene.start(SceneKey.Result, { ...this.config, wins: this.wins, winner } satisfies ResultData);
      } else {
        this.scene.restart({ ...this.config, round: this.round + 1, wins: this.wins } satisfies FightData);
      }
    });
  }
}
