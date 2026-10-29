import * as THREE from 'three';
import type { FighterData, FigureConfig } from '../core/characters/types';
import type { RigFrame } from '../rig/animator';
import { FigureBody } from './FigureBody';
import { Puppet3D } from './Puppet3D';
import { DEG } from './space';

/** A low-poly 3D fighter. */
export class FigureFighter extends Puppet3D {
  private readonly body: FigureBody;
  private readonly yaw = new THREE.Group();

  constructor(parent: THREE.Object3D, data: FighterData, drawOrder: number, look: FigureConfig) {
    super(parent, data, drawOrder);
    this.body = new FigureBody(data, look);
    this.yaw.add(this.body.root);
    this.root.add(this.yaw);
  }

  render(frame: RigFrame): void {
    this.body.pose(frame);
    this.showAura(frame.aura);
  }

  protected override orient(facing: 1 | -1, angle: number, _spin: number, turn: number): void {
    // The figure faces +z; a quarter turn points it along the fight line.
    this.yaw.rotation.y = facing * (Math.PI / 2) + turn;
    this.root.scale.set(1, 1, 1);
    this.root.rotation.set(0, 0, -angle * DEG);
    this.body.faceCamera(facing);
  }

  protected setOpacity(alpha: number): void {
    this.body.setOpacity(alpha);
  }
}
