import type Phaser from 'phaser';
import { synthPlay } from './synth';

export { preloadVoice, startVoice, type VoiceHandle } from './synth';

export type SfxName = 'roundStart' | 'fight' | 'attack' | 'special' | 'hit' | 'block' | 'shield' | 'ko' | 'timeUp' | 'win';

export interface SfxInfo {
  /** Damage of the move involved, for scaling volume or picking a variant. */
  damage?: number;
  /** Fighter whose voice clip (if any) accompanies a match win. */
  fighterId?: string;
}

export type SfxHandler = (name: SfxName, info: SfxInfo) => void;

const handlers = new Set<SfxHandler>();

/** Subscribes to gameplay sound cues; returns an unsubscribe function. */
function onSfx(handler: SfxHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function playSfx(name: SfxName, info: SfxInfo = {}): void {
  synthPlay(name, info);
  handlers.forEach((h) => h(name, info));
}

/** Plays any audio loaded under a key equal to the cue name (load it in BootScene). */
export function bindPhaserSfx(scene: Phaser.Scene): () => void {
  return onSfx((name) => {
    if (scene.cache.audio.exists(name)) scene.sound.play(name);
  });
}
