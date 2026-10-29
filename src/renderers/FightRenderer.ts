import type Phaser from 'phaser';
import type { ArenaId } from '../content/arenas';
import type { FighterData } from '../core/characters/types';
import type { MatchState } from '../core/match/state';
import { Stage3D } from '../render3d/Stage3D';
import type { FighterPuppet, ToScreen } from '../ui/FighterView';
import { PhaserRenderer } from './PhaserRenderer';

export type RendererKind = 'phaser' | 'three';

/** Used when the URL does not say otherwise. */
const DEFAULT_RENDERER: RendererKind = 'three';

/** Draws the fight world (arena, fighters, projectiles) from core state; the HUD and special effects stay in Phaser either way. */
export interface FightRenderer {
  readonly kind: RendererKind;
  /** Shows the arena; `canvas` is the Phaser canvas the HUD is drawn on. */
  begin(canvas: HTMLCanvasElement, arena: ArenaId): void;
  end(): void;
  addFighter(data: FighterData): FighterPuppet;
  /** Draws one frame of `state`; `deltaMs` is real time since the last frame. */
  draw(state: MatchState, deltaMs: number): void;
  /** Where a point on the fight plane (game px) appears on screen. */
  readonly project: ToScreen;
  shake(ms: number, intensity: number, force?: boolean): void;
  cheer(amount: number): void;
}

/** `?renderer=phaser` or `?renderer=three` in the URL picks the renderer. */
function rendererKind(): RendererKind {
  const asked = new URLSearchParams(window.location.search).get('renderer');
  return asked === 'phaser' || asked === 'three' ? asked : DEFAULT_RENDERER;
}

/** The renderer the flag asks for; Three.js falls back to Phaser when WebGL is unavailable. */
export function createFightRenderer(scene: Phaser.Scene): FightRenderer {
  if (rendererKind() === 'three') {
    const stage = Stage3D.get();
    if (stage) return stage;
  }
  return new PhaserRenderer(scene);
}
