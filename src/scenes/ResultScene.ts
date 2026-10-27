import Phaser from 'phaser';
import { getFighter } from '../characters/registry';
import { GAME_HEIGHT } from '../config';
import { randomDrawQuote, randomWinnerQuote } from '../share/quotes';
import { canvasToBlob, renderResultCard } from '../share/resultCard';
import { downloadBlob, shareToWhatsApp } from '../share/share';
import { playSfx } from '../systems/audio/sfx';
import { createButton, textStyle } from '../ui/ui';
import { SceneKey, type CharacterSelectData, type FightData, type ResultData } from './sceneData';

const CARD_TEXTURE = 'result-card';
const CARD_FILE = 'sansad-combat-result.png';
const PREVIEW_SIZE = 440;
const PREVIEW_X = 270;
const BUTTON_X = 730;
const BUTTON_W = 320;
const BUTTON_H = 54;

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;
  private cardBlob: Blob | null = null;
  private shareText = '';
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Result);
  }

  init(data: ResultData): void {
    this.result = data;
    this.cardBlob = null;
  }

  create(): void {
    const { winner, mode, difficulty, p1, p2, wins } = this.result;
    const f1 = getFighter(p1);
    const f2 = getFighter(p2);
    if (!f1 || !f2) {
      this.scene.start(SceneKey.Menu);
      return;
    }

    const winnerLabel = winner === null ? null : mode === 'cpu' && winner === 1 ? 'CPU' : `P${winner + 1}`;
    const winnerData = winner === null ? null : winner === 0 ? f1 : f2;
    const quote = winnerData ? (winnerData.winQuote ?? randomWinnerQuote()) : randomDrawQuote();
    const modeLabel = mode === 'cpu' ? `VS CPU \u00B7 ${difficulty.toUpperCase()}` : 'LOCAL 2P';
    const canvas = renderResultCard({
      winner: winnerData,
      fighters: [f1, f2],
      winnerLabel,
      score: wins ?? null,
      quote,
      footer: `${modeLabel} \u00B7 ${location.host}`,
    });

    if (this.textures.exists(CARD_TEXTURE)) this.textures.remove(CARD_TEXTURE);
    this.textures.addCanvas(CARD_TEXTURE, canvas);
    if (winnerData) playSfx('win', { fighterId: winnerData.id });
    this.add.rectangle(PREVIEW_X, GAME_HEIGHT / 2, PREVIEW_SIZE + 8, PREVIEW_SIZE + 8, 0x8fa0ff);
    this.add.image(PREVIEW_X, GAME_HEIGHT / 2, CARD_TEXTURE).setDisplaySize(PREVIEW_SIZE, PREVIEW_SIZE);

    const headline = winnerLabel ? `${winnerLabel} WINS` : 'DRAW';
    this.shareText = `${headline}! \u201C${quote}\u201D Think you can beat me? ${location.origin}${location.pathname}`;
    void canvasToBlob(canvas).then((blob) => (this.cardBlob = blob));

    const button = (y: number, label: string, onClick: () => void) =>
      createButton(this, BUTTON_X, y, label, onClick, BUTTON_W, BUTTON_H);

    button(110, 'REMATCH', () =>
      this.scene.start(SceneKey.Fight, { mode, difficulty, p1, p2 } satisfies FightData),
    );
    button(185, 'WHATSAPP SHARE', () => void this.share());
    button(260, 'SAVE IMAGE', () => this.save());
    button(335, 'CHARACTER SELECT', () =>
      this.scene.start(SceneKey.CharacterSelect, { mode, difficulty } satisfies CharacterSelectData),
    );
    button(410, 'MENU', () => this.scene.start(SceneKey.Menu));

    this.status = this.add
      .text(BUTTON_X, 470, '', { ...textStyle(16, '#aab2d5'), align: 'center', wordWrap: { width: BUTTON_W } })
      .setOrigin(0.5, 0);
  }

  private save(): void {
    if (!this.cardBlob) {
      this.status.setText('Card is still rendering, try again.');
      return;
    }
    downloadBlob(this.cardBlob, CARD_FILE);
    this.status.setText('Image saved.');
  }

  private async share(): Promise<void> {
    if (!this.cardBlob) {
      this.status.setText('Card is still rendering, try again.');
      return;
    }
    const outcome = await shareToWhatsApp(this.cardBlob, CARD_FILE, this.shareText);
    if (!this.status.active) return;
    if (outcome === 'whatsapp-link') this.status.setText('Image saved. Attach it in the WhatsApp chat that opened.');
    else this.status.setText(outcome === 'shared' ? 'Shared!' : '');
  }
}
