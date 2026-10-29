import type Phaser from 'phaser';
import type { FighterSnapshot } from '../../core/match/state';
import type { ToScreen } from '../FighterView';
import { BaarishFx } from './BaarishFx';
import { BulldozerFx } from './BulldozerFx';
import { BroomStormFx } from './BroomStormFx';
import { ConstitutionFx } from './ConstitutionFx';
import { CycleFx } from './CycleFx';
import { JaaduFx } from './JaaduFx';
import type { SpecialFx } from './kit';
import { LathiFx } from './LathiFx';
import { MicDropFx } from './MicDropFx';
import { PanjaFx } from './PanjaFx';

/** The effect that draws this fighter's special, if it has a bespoke one. */
export function createSpecialFx(scene: Phaser.Scene, fighter: FighterSnapshot, toScreen: ToScreen): SpecialFx | null {
  const s = fighter.data.special;
  if (s.type !== 'projectile' || !s.fx) return null;
  switch (s.fx) {
    case 'constitution':
      return new ConstitutionFx(scene, fighter, toScreen);
    case 'bulldozer':
      return new BulldozerFx(scene, fighter, toScreen);
    case 'cycle':
      return new CycleFx(scene, fighter, toScreen);
    case 'lathi':
      return new LathiFx(scene, fighter, toScreen);
    case 'panja':
      return new PanjaFx(scene, fighter, toScreen);
    case 'broom':
      return new BroomStormFx(scene, fighter, toScreen);
    case 'mic':
      return new MicDropFx(scene, fighter, toScreen);
    case 'baarish':
      return new BaarishFx(scene, fighter, toScreen);
    case 'jaadu':
      return new JaaduFx(scene, fighter, toScreen);
  }
}
