import Phaser from 'phaser';
import { getFighter } from '../characters/registry';
import {
  BLOCK_SHAKE,
  FIGHT_BANNER_MS,
  GAME_HEIGHT,
  GAME_WIDTH,
  HIT_SHAKE,
  KNOCKDOWN_FLASH_MS,
  KNOCKDOWN_SHAKE,
  KO_FLASH_MS,
  KO_SHAKE,
  SHAKE_REF_DAMAGE,
} from '../config';
import { fill, texts } from '../content/texts';
import { AI_PROFILES } from '../core/ai/difficulty';
import { CompositeInput } from '../core/input/InputState';
import { Match } from '../core/match/Match';
import type { MatchEvent, MatchState, Slot } from '../core/match/state';
import { createFightRenderer, type FightRenderer } from '../renderers/FightRenderer';
import { bindPhaserSfx, playSfx, preloadVoice, startVoice, type VoiceHandle } from '../systems/audio/sfx';
import { KeyboardInput, P1_KEYS, P2_KEYS } from '../systems/input/KeyboardInput';
import { touchControls } from '../systems/input/TouchControls';
import { FighterView, type ScreenPoint } from '../ui/FighterView';
import { gameChrome } from '../ui/GameChrome';
import { HitSparks } from '../ui/HitSparks';
import { Hud } from '../ui/Hud';
import { HtmlOverlay } from '../ui/HtmlOverlay';
import { createSpecialFx } from '../ui/specials';
import type { SpecialFx } from '../ui/specials/kit';
import { showTaunt } from '../ui/TauntBubble';
import { textStyle } from '../ui/ui';
import { getArena, SceneKey, type CharacterSelectData, type FightData, type ResultData } from './sceneData';

/** One special move in progress: its voice only keeps playing if the move lands. */
interface Cast {
  voice: VoiceHandle | null;
  landed: boolean;
}

/** Draws and sounds the fight; all rules live in the core `Match`, which this scene steps and reads. */
export class FightScene extends Phaser.Scene {
  private config!: FightData;
  private match: Match | null = null;
  private state!: MatchState;
  private views: FighterView[] = [];
  private specialFx: SpecialFx[] = [];
  private hud: Hud | null = null;
  private overlay: HtmlOverlay | null = null;
  private sparks!: HitSparks;
  private banner: Phaser.GameObjects.Text | null = null;
  private casts: [Cast | null, Cast | null] = [null, null];
  private fightRenderer!: FightRenderer;

  constructor() {
    super(SceneKey.Fight);
  }

  /** Screen position of a point on the fight plane. */
  private readonly toScreen = (x: number, y: number): ScreenPoint => this.fightRenderer.project(x, y);

  init(data: FightData): void {
    this.config = data;
    this.match = null;
    this.hud = null;
    this.overlay = null;
    this.banner = null;
    this.casts = [null, null];
    this.views = [];
    this.specialFx = [];
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

    this.fightRenderer = createFightRenderer(this);
    const arena = getArena(this.registry);
    this.fightRenderer.begin(this.game.canvas, arena);

    const cpu = this.config.mode === 'cpu';
    this.match = new Match({
      p1: p1Data,
      p2: p2Data,
      round: this.config.round,
      wins: this.config.wins,
      controllers: [
        { kind: 'input', source: new CompositeInput([new KeyboardInput(this, P1_KEYS, ...(cpu ? [P2_KEYS] : [])), touchControls]) },
        cpu
          ? { kind: 'ai', profile: AI_PROFILES[this.config.difficulty] }
          : { kind: 'input', source: new KeyboardInput(this, P2_KEYS) },
      ],
    });
    this.state = this.match.state;
    for (const f of this.state.fighters) {
      preloadVoice(f.data.id);
      preloadVoice(`${f.data.id}-win`);
    }
    this.views = this.state.fighters.map((f) => new FighterView(this, f, this.fightRenderer.addFighter(f.data), this.toScreen));
    this.specialFx = this.state.fighters.flatMap((f) => createSpecialFx(this, f, this.toScreen) ?? []);
    this.sparks = new HitSparks(this);
    if (this.fightRenderer.kind === 'three') {
      this.overlay = new HtmlOverlay(this.game.canvas, this.state, arena);
    } else {
      this.hud = new Hud(this, this.state);
      this.banner = this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', textStyle(96))
        .setOrigin(0.5)
        .setDepth(20);
    }

    const unbindSfx = bindPhaserSfx(this);
    touchControls.show();
    gameChrome.enterFight({
      pause: () => {
        this.scene.pause();
        touchControls.hide();
      },
      resume: () => {
        this.scene.resume();
        touchControls.show();
      },
      quit: () =>
        this.scene.start(SceneKey.CharacterSelect, {
          mode: this.config.mode,
          difficulty: this.config.difficulty,
        } satisfies CharacterSelectData),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unbindSfx();
      touchControls.hide();
      gameChrome.leaveFight();
      this.casts.forEach((c) => {
        if (!c?.landed) c?.voice?.stop();
      });
      this.match?.destroy();
      this.overlay?.destroy();
      this.fightRenderer.end();
    });
  }

  update(_time: number, delta: number): void {
    if (!this.match) return;
    const state = this.match.step(delta);
    this.state = state;
    for (const ev of state.events) this.onEvent(ev, state);

    this.views.forEach((v, i) => v.update(state.fighters[i]!, state.timeScale));
    for (const fx of this.specialFx) fx.update(this.time.now, state);
    this.fightRenderer.draw(state, delta);
    this.hud?.update(state);
    this.overlay?.update(state);
  }

  private onEvent(ev: MatchEvent, state: MatchState): void {
    this.overlay?.onEvent(ev, state);
    switch (ev.type) {
      case 'roundStart':
        this.showBanner(fill(texts.hud.roundStart, { round: ev.round }));
        playSfx('roundStart');
        for (const f of state.fighters) {
          const line = f.data.taunts?.[Math.floor(Math.random() * f.data.taunts.length)];
          if (line) showTaunt(this, this.toScreen(f.x, f.y).x, line, Phaser.Display.Color.HexStringToColor(f.data.color).color);
        }
        break;
      case 'fightStart':
        this.showBanner(texts.hud.fightStart);
        playSfx('fight');
        this.time.delayedCall(FIGHT_BANNER_MS, () => {
          if (this.state.phase === 'fight') this.showBanner('');
        });
        break;
      case 'attack':
        playSfx('attack');
        break;
      case 'special':
        playSfx('special');
        this.casts[ev.slot]?.voice?.stop();
        this.casts[ev.slot] = { voice: startVoice(state.fighters[ev.slot].data.id), landed: false };
        break;
      case 'specialEnd': {
        // Once a special is over without landing a clean hit, its voice is cut off.
        const cast = this.casts[ev.slot];
        if (cast && !cast.landed) cast.voice?.stop();
        this.casts[ev.slot] = null;
        break;
      }
      case 'hit':
        this.onHit(ev, state);
        break;
      case 'ko': {
        const f = state.fighters[ev.slot];
        const at = this.toScreen(f.x, f.y - f.data.body.height / 2);
        this.sparks.burst(at.x, at.y, 'ko', f.facing === 1 ? -1 : 1, f.maxHealth / 4);
        break;
      }
      case 'roundEnd':
        this.onRoundEnd(ev);
        break;
      case 'nextRound':
        this.scene.restart({ ...this.config, round: ev.round, wins: ev.wins } satisfies FightData);
        break;
      case 'matchEnd':
        this.scene.start(SceneKey.Result, { ...this.config, wins: ev.wins, winner: ev.winner } satisfies ResultData);
        break;
    }
  }

  private onHit(ev: Extract<MatchEvent, { type: 'hit' }>, state: MatchState): void {
    const attacker = state.fighters[ev.attacker];
    const defender = state.fighters[ev.defender];
    const cast = this.casts[ev.attacker];
    if (ev.fromSpecial && cast && !ev.blocked && !ev.shielded) cast.landed = true;
    const kind = ev.shielded ? 'shield' : ev.blocked ? 'block' : 'hit';
    const shake = kind === 'hit' ? HIT_SHAKE : BLOCK_SHAKE;
    const scale = Phaser.Math.Clamp(ev.damage / SHAKE_REF_DAMAGE, 0.5, 1.5);
    this.shake(shake.ms, shake.intensity * scale);
    const at = this.toScreen(ev.x, ev.y);
    this.sparks.burst(at.x, at.y, kind, defender.x >= attacker.x ? 1 : -1, ev.damage);
    if (kind === 'hit') {
      if (ev.impact) this.sparks.comic(at.x, at.y, ev.impact, Phaser.Display.Color.HexStringToColor(attacker.data.color).color, ev.knockdown ? 1.2 : 0.8);
      if (defender.downed) {
        this.shake(KNOCKDOWN_SHAKE.ms, KNOCKDOWN_SHAKE.intensity, true);
        this.cameras.main.flash(KNOCKDOWN_FLASH_MS, 255, 244, 214);
      }
      this.fightRenderer.cheer(ev.damage / 40);
    }
    playSfx(kind, { damage: ev.damage });
  }

  private onRoundEnd(ev: Extract<MatchEvent, { type: 'roundEnd' }>): void {
    const outcome = (slot: Slot) => (ev.winner === null ? null : ev.winner === slot ? 'win' : 'lose');
    this.views[0]?.setOutcome(outcome(0));
    this.views[1]?.setOutcome(outcome(1));
    if (ev.reason === 'ko') {
      this.showBanner(texts.hud.ko, '#e5483f');
      this.shake(KO_SHAKE.ms, KO_SHAKE.intensity, true);
      this.cameras.main.flash(KO_FLASH_MS, 255, 255, 255);
      this.fightRenderer.cheer(1);
      playSfx('ko');
    } else {
      this.showBanner(texts.hud.timeUp);
      playSfx('timeUp');
    }
  }

  private shake(ms: number, intensity: number, force = false): void {
    this.fightRenderer.shake(ms, intensity, force);
  }

  private showBanner(text: string, color = '#ffffff'): void {
    if (this.overlay) {
      this.overlay.banner(text, color);
      return;
    }
    const banner = this.banner;
    if (!banner) return;
    this.tweens.killTweensOf(banner);
    banner.setText(text).setColor(color).setScale(1).setAngle(0);
    if (!text) return;
    banner.setScale(2.2).setAngle(-6);
    this.tweens.add({ targets: banner, scale: 1, angle: 0, duration: 240, ease: 'Back.easeOut' });
  }
}
