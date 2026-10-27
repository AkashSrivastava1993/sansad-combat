import Phaser from 'phaser';
import { lookHeight } from '../characters/look';
import { factionOf, getFactionGroups, getFighter, getFighters } from '../characters/registry';
import type { FighterData } from '../characters/types';
import {
  DEFAULT_FACTION_STYLE,
  FACTIONS,
  GAME_HEIGHT,
  GAME_WIDTH,
  SPECIAL_TYPE_LABELS,
} from '../config';
import { RigAnimator } from '../rig/animator';
import { createFighterRig } from '../ui/FighterRig';
import { createButton, textStyle } from '../ui/ui';
import { SceneKey, type CharacterSelectData, type Difficulty, type FightData, type GameMode } from './sceneData';

const CARD_W = 136;
const CARD_H = 150;
const CARD_GAP = 12;
const COL_GAP = 20;
const MARGIN = 30;
const BANNER_Y = 82;
const BANNER_H = 34;
const CARDS_TOP = 110;
const MAX_LOOK_PX = 100;
const PANEL = { x: 215, y: 436, w: 715, h: 84 };

const HIDDEN_HINT = 'Hover a fighter to see their special move.';

interface Card {
  fighter: FighterData;
  box: Phaser.GameObjects.Rectangle;
  items: Phaser.GameObjects.GameObject[];
}

export class CharacterSelectScene extends Phaser.Scene {
  private mode: GameMode = 'cpu';
  private difficulty: Difficulty = 'normal';
  private picks: string[] = [];
  private cards: Card[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;
  private previewed: string | null = null;

  constructor() {
    super(SceneKey.CharacterSelect);
  }

  init(data: CharacterSelectData): void {
    this.mode = data.mode;
    this.difficulty = data.difficulty;
    this.picks = [];
    this.cards = [];
    this.previewed = null;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const groups = getFactionGroups();

    this.prompt = this.add.text(cx, 38, '', textStyle(30)).setOrigin(0.5);
    createButton(this, 110, GAME_HEIGHT - 45, 'BACK', () => this.scene.start(SceneKey.Menu), 160, 50);

    if (groups.length === 0) {
      this.prompt.setText('NO FIGHTERS');
      this.add
        .text(cx, GAME_HEIGHT / 2, 'Add fighter JSON files to src/characters/data', {
          ...textStyle(22, '#aab2d5'),
          align: 'center',
        })
        .setOrigin(0.5);
      return;
    }

    this.updatePrompt();

    this.add.rectangle(PANEL.x + PANEL.w / 2, PANEL.y + PANEL.h / 2, PANEL.w, PANEL.h, 0x1d2233).setStrokeStyle(2, 0x8fa0ff);
    this.info = this.add
      .text(PANEL.x + 14, PANEL.y + 10, HIDDEN_HINT, {
        ...textStyle(15, '#dfe4ff'),
        fontStyle: 'normal',
        wordWrap: { width: PANEL.w - 28 },
        lineSpacing: 4,
      });

    const colW = (GAME_WIDTH - 2 * MARGIN - (groups.length - 1) * COL_GAP) / groups.length;
    const maxPerRow = Math.max(1, Math.floor((colW + CARD_GAP) / (CARD_W + CARD_GAP)));

    groups.forEach((group, col) => {
      // Even rows (e.g. 2 + 2 rather than 3 + 1).
      const perRow = Math.ceil(group.fighters.length / Math.ceil(group.fighters.length / maxPerRow));
      const rowW = perRow * CARD_W + (perRow - 1) * CARD_GAP;
      const left = MARGIN + col * (colW + COL_GAP);
      const style = FACTIONS[group.faction] ?? DEFAULT_FACTION_STYLE;
      const factionColor = Phaser.Display.Color.HexStringToColor(style.color).color;

      this.add.rectangle(left + colW / 2, BANNER_Y, colW, BANNER_H, factionColor);
      this.add.text(left + colW / 2, BANNER_Y, group.faction.toUpperCase(), textStyle(17)).setOrigin(0.5);

      group.fighters.forEach((fighter, i) => {
        const x = left + (colW - rowW) / 2 + CARD_W / 2 + (i % perRow) * (CARD_W + CARD_GAP);
        const y = CARDS_TOP + CARD_H / 2 + Math.floor(i / perRow) * (CARD_H + CARD_GAP);
        this.addCard(fighter, x, y, factionColor);
      });
    });
  }

  private addCard(fighter: FighterData, x: number, y: number, factionColor: number): void {
    const card = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1d2233).setStrokeStyle(3, factionColor);

    const rig = createFighterRig(this, fighter);
    rig.render(RigAnimator.still(fighter, 'idle'));
    rig.root.setPosition(x, y + CARD_H / 2 - 48).setScale(Math.min(0.55, MAX_LOOK_PX / lookHeight(fighter)));

    const label = this.add
      .text(x, y + CARD_H / 2 - 6, fighter.name, {
        ...textStyle(15),
        align: 'center',
        wordWrap: { width: CARD_W - 8 },
      })
      .setOrigin(0.5, 1);
    this.cards.push({ fighter, box: card, items: [card, rig.root, label] });

    card.setInteractive({ useHandCursor: true });
    card.on('pointerover', () => {
      card.setStrokeStyle(4, 0xffffff);
      rig.render(RigAnimator.still(fighter, 'victory'));
      this.preview(fighter);
    });
    card.on('pointerout', () => {
      card.setStrokeStyle(3, factionColor);
      rig.render(RigAnimator.still(fighter, 'idle'));
    });
    card.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Touch has no hover, so the first tap previews and the second confirms.
      if (pointer.wasTouch && this.previewed !== fighter.id) {
        this.preview(fighter);
        return;
      }
      this.pick(fighter.id);
    });
  }

  private preview(f: FighterData): void {
    this.previewed = f.id;
    const s = f.special;
    const burn = s.type !== 'shield' && s.burn ? ` + burn ${Math.round((s.burn.damagePerSec * s.burn.durationMs) / 1000)} over ${(s.burn.durationMs / 1000).toFixed(0)}s` : '';
    this.info.setText(
      `${f.name.toUpperCase()}  \u00B7  SPECIAL: ${s.name} (${s.label ?? SPECIAL_TYPE_LABELS[s.type]})\n` +
        `${s.description}\n` +
        `Cost ${s.cost}  \u00B7  Cooldown ${(s.cooldownMs / 1000).toFixed(1)}s  \u00B7  Damage ${s.damage}${burn}`,
    );
  }

  private updatePrompt(): void {
    if (this.picks.length === 0) {
      this.prompt.setText('P1: CHOOSE YOUR FIGHTER');
      return;
    }
    const rivals = getFactionGroups()
      .map((g) => g.faction)
      .filter((f) => f !== factionOf(getFighter(this.picks[0]!)!));
    this.prompt.setText(`P2: CHOOSE A FIGHTER FROM ${rivals.join(' / ').toUpperCase()}`).setFontSize(22);
  }

  private pick(id: string): void {
    const first = this.picks[0] ? getFighter(this.picks[0]) : undefined;
    const chosen = getFighter(id);
    if (!chosen || (first && factionOf(first) === factionOf(chosen))) return;

    this.picks.push(id);
    if (this.mode === 'cpu') {
      // Fights are always between factions.
      const rivals = getFighters().filter((f) => factionOf(f) !== factionOf(chosen));
      const pool = rivals.length > 0 ? rivals : getFighters();
      const cpu = pool[Math.floor(Math.random() * pool.length)]!;
      this.startFight({ mode: this.mode, difficulty: this.difficulty, p1: id, p2: cpu.id });
    } else if (this.picks.length === 2) {
      this.startFight({ mode: this.mode, difficulty: this.difficulty, p1: this.picks[0]!, p2: this.picks[1]! });
    } else {
      for (const c of this.cards) {
        if (factionOf(c.fighter) !== factionOf(chosen)) continue;
        c.box.disableInteractive();
        for (const item of c.items) (item as Phaser.GameObjects.Components.Alpha & Phaser.GameObjects.GameObject).setAlpha(0.3);
      }
      this.updatePrompt();
    }
  }

  private startFight(data: FightData): void {
    this.scene.start(SceneKey.Fight, data);
  }
}
