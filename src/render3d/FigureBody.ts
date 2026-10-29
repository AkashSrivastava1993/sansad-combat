import * as THREE from 'three';
import type { FighterData, FigureConfig } from '../core/characters/types';
import type { RigFrame } from '../rig/animator';
import { clothTarget } from '../rig/svg/layout';
import { type ArmRig, buildFigure, type FigureRig } from './figureBuild';
import { DEG, PX } from './space';

const rad = (deg: number): number => deg * DEG;
/** Share of the forearm's swing a held item cancels out, so brooms and kettles stay roughly upright. */
const PROP_STEADY = 0.75;

/** The low-poly figure and the code that poses it from the same angles that drive the flat art. */
export class FigureBody {
  /** Faces +z with its feet on y = 0. */
  readonly root: THREE.Object3D;
  private readonly rig: FigureRig;
  private readonly legLength: number;
  private cloth = 0;
  private lastTime: number | null = null;
  private hurt = false;
  /** Which side of the body (local x) faces the camera. */
  private nearSide = 0;

  constructor(
    private readonly data: FighterData,
    look: FigureConfig,
  ) {
    this.rig = buildFigure(data, look);
    this.root = this.rig.root;
    this.legLength = this.rig.thigh + this.rig.shin;
  }

  pose(frame: RigFrame): void {
    const { rig } = this;
    const { pose } = frame;
    const anim = this.data.svg.anim;

    rig.torso.rotation.x = rad(pose.lean * anim.leanScale);
    rig.head.rotation.x = rad(pose.headTilt * anim.headScale);
    this.poseArm(rig.front.arm, pose.frontArm);
    this.poseArm(rig.back.arm, pose.backArm);

    // A foot's reach below the hip; the lower one decides how high the hips stand.
    let reach = 0;
    for (const [leg, [hip, knee]] of [
      [rig.front.leg, pose.frontLeg],
      [rig.back.leg, pose.backLeg],
    ] as const) {
      leg.hip.rotation.x = -rad(hip);
      leg.knee.rotation.x = rad(knee);
      leg.shoe.rotation.x = 0.7 * rad(hip - knee);
      reach = Math.max(reach, rig.thigh * Math.cos(rad(hip)) + rig.shin * Math.cos(rad(hip - knee)));
    }
    const standing = frame.grounded ? Math.max(reach, 0.15 * this.legLength) : rig.restHipY;
    rig.hips.position.y = standing + frame.bob * anim.bobScale * PX;

    const dt = this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    const target = clothTarget(this.data.svg, frame.wind, frame.time);
    this.cloth += (target - this.cloth) * (1 - Math.exp(-anim.cloth.lag * dt));
    if (rig.pallu) rig.pallu.rotation.x = rad(dt === 0 ? target : this.cloth);

    const hurt = frame.expression === 'hurt' || frame.expression === 'ko';
    if (hurt !== this.hurt) {
      this.hurt = hurt;
      rig.headSkin.color.set(hurt ? '#ffb4b4' : rig.skin);
    }
  }

  /** Keeps the front limbs on the side nearest the camera whichever way the fighter faces. */
  faceCamera(facing: 1 | -1): void {
    const near = facing === 1 ? -1 : 1;
    if (near === this.nearSide) return;
    this.nearSide = near;
    const { rig } = this;
    rig.front.arm.shoulder.position.x = near * rig.shoulderX;
    rig.back.arm.shoulder.position.x = -near * rig.shoulderX;
    rig.front.leg.hip.position.x = near * rig.hipX;
    rig.back.leg.hip.position.x = -near * rig.hipX;
  }

  setOpacity(alpha: number): void {
    for (const m of this.rig.materials) {
      m.transparent = alpha < 1;
      m.opacity = alpha;
      m.needsUpdate = true;
    }
  }

  private poseArm(arm: ArmRig, [shoulder, elbow]: readonly [number, number]): void {
    arm.shoulder.rotation.x = -rad(shoulder);
    arm.elbow.rotation.x = -rad(elbow);
    if (arm.prop) arm.prop.rotation.x = PROP_STEADY * rad(shoulder + elbow) + 0.3;
  }
}
