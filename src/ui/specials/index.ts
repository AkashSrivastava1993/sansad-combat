import type Phaser from 'phaser';
import type { Fighter } from '../../systems/combat/Fighter';
import type { ToScreen } from '../FighterView';
import { PourFx } from '../PourFx';
import { ConstitutionFx } from './ConstitutionFx';
import type { SpecialFx } from './kit';

/** The effect that draws this fighter's special, if it has a bespoke one. */
export function createSpecialFx(scene: Phaser.Scene, fighter: Fighter, toScreen: ToScreen): SpecialFx | null {
  const s = fighter.data.special;
  if (s.type === 'pour') return new PourFx(scene, fighter, toScreen);
  if (s.type !== 'projectile' || !s.fx) return null;
  switch (s.fx) {
    case 'constitution':
      return new ConstitutionFx(scene, fighter, toScreen);
    default:
      return null;
  }
}
