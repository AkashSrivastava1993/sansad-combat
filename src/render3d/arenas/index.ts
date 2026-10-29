import type * as THREE from 'three';
import type { ArenaId } from '../../content/arenas';
import { buildIndiaGate } from './indiaGate';
import { buildJantarMantar } from './jantarMantar';
import { buildSansad } from './sansad';

/** One arena's scenery and lights; the stage shows one at a time. */
export interface Arena {
  /** Everything the arena adds to the scene, so it can be hidden as a whole. */
  readonly root: THREE.Group;
  readonly background: THREE.Color | THREE.Texture;
  readonly fog: THREE.Fog;
  update(timeSec: number, dt: number): void;
  /** Gets the crowd jumping; decays on its own. */
  cheer(amount: number): void;
  /** Gives the crowd a new selection of placards. */
  dealPlacards(): void;
}

const BUILDERS: Record<ArenaId, () => Arena> = {
  sansad: buildSansad,
  indiagate: buildIndiaGate,
  jantarmantar: buildJantarMantar,
};

export const buildArena = (id: ArenaId): Arena => BUILDERS[id]();
