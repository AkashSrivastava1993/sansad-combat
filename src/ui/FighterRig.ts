import type Phaser from 'phaser';
import type { FighterData } from '../characters/types';
import { drawRig, type RigFrame } from '../rig/draw';
import { PhaserPainter } from '../rig/painter';
import { hasSvg } from '../rig/svg/atlas';
import { SvgRig } from '../rig/svg/SvgRig';

/** A drawn fighter on a container whose origin is at the feet; mirror with scaleX to face left. */
export interface FighterRigView {
  readonly root: Phaser.GameObjects.Container;
  render(frame: RigFrame): void;
}

/** The layered-shape rig built from the character's `look`. */
class ProceduralRig implements FighterRigView {
  readonly root: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly painter: PhaserPainter;

  constructor(
    scene: Phaser.Scene,
    private readonly data: FighterData,
  ) {
    this.g = scene.add.graphics();
    this.root = scene.add.container(0, 0, [this.g]);
    this.painter = new PhaserPainter(this.g);
  }

  render(frame: RigFrame): void {
    this.g.clear();
    drawRig(this.painter, this.data, frame);
  }
}

/** SVG art when it loaded for this fighter, otherwise the procedural rig. */
export function createFighterRig(scene: Phaser.Scene, data: FighterData): FighterRigView {
  return data.svg && hasSvg(data.id) ? new SvgRig(scene, data) : new ProceduralRig(scene, data);
}
