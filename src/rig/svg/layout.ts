import type { Pair, Pose, SvgConfig, SvgLayerId } from '../../core/characters/types';
import { SVG_DRAW_ORDER, type SvgArt } from './atlas';

export interface SvgFrame {
  pose: Pose;
  /** Idle bounce, game px. */
  bob: number;
  grounded: boolean;
  /** Current swing of the `back` layer in degrees (already lagged). */
  cloth: number;
}

export interface Placement {
  layer: SvgLayerId;
  /** The layer's pivot in art units: the sprite or image is drawn so this point lands on x, y. */
  pivot: Pair;
  /** Position of the pivot in game px relative to the feet, y down. */
  x: number;
  y: number;
  /** Clockwise degrees. */
  rot: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
/** Clockwise on screen (y down). */
const rotateCW = ([x, y]: Pair, deg: number): Pair => {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x * c - y * s, x * s + y * c];
};

interface Segment {
  pivot: Pair;
  at: Pair;
  rot: number;
}

/** Cloth swing target before lag: trails behind movement, plus a breeze and a gentle sway. */
export function clothTarget(cfg: SvgConfig, wind: number, timeSec: number): number {
  const c = cfg.anim.cloth;
  return c.windSwing * wind + c.breeze + Math.sin(timeSec * c.speed) * c.swing;
}

/**
 * Pure pose-to-layers mapping, shared by the Phaser renderer and the share-card canvas.
 * Limb angles in the pose are forward-positive, so a limb's on-screen (clockwise) rotation is the negative.
 */
export function layoutSvg(cfg: SvgConfig, art: SvgArt, frame: SvgFrame, present: ReadonlySet<SvgLayerId>): Placement[] {
  const { pivots: p, anim: a, scale: s } = cfg;
  const { pose } = frame;
  const hipMid: Pair = [(p.hipBack[0] + p.hipFront[0]) / 2, p.hipBack[1]];

  const legDelta = ([hip, knee]: Pair, rest: number): number => hip - a.kneeWeight * knee - rest;
  const dBack = legDelta(pose.backLeg, a.restAngles.legBack);
  const dFront = legDelta(pose.frontLeg, a.restAngles.legFront);

  // Plant the lowest foot where it stands at rest, so spread legs lower the body instead of lifting the feet.
  let lift = 0;
  if (frame.grounded) {
    const footY = (hip: Pair, foot: Pair, delta: number): number => {
      const phi = rad(-delta);
      return hip[1] + (foot[0] - hip[0]) * Math.sin(phi) + (foot[1] - hip[1]) * Math.cos(phi);
    };
    const lowest = Math.max(footY(p.hipBack, p.footBack, dBack), footY(p.hipFront, p.footFront, dFront));
    lift = Math.max(p.footBack[1], p.footFront[1]) - lowest;
  }
  lift -= (frame.bob * a.bobScale) / s;

  const lean = pose.lean * a.leanScale;
  const upper = (pt: Pair): Pair => {
    const rx = pt[0] - hipMid[0];
    const ry = pt[1] - hipMid[1];
    const c = Math.cos(rad(lean));
    const sn = Math.sin(rad(lean));
    return [hipMid[0] + rx * c - ry * sn, hipMid[1] + rx * sn + ry * c];
  };
  const toRoot = (pt: Pair): [number, number] => [(pt[0] - art.anchor[0]) * s, (pt[1] + lift - art.anchor[1]) * s];

  const armPlacement = (
    shoulder: Pair,
    elbow: Pair | undefined,
    [sh, el]: Pair,
    rest: number,
    restLower: number | undefined,
    split: boolean,
  ): { upper: Segment; lower: Segment } => {
    if (split && elbow && restLower !== undefined) {
      const dUpper = sh - rest;
      const dLower = sh + el - restLower;
      const off = rotateCW([elbow[0] - shoulder[0], elbow[1] - shoulder[1]], -dUpper);
      return {
        upper: { pivot: shoulder, at: upper(shoulder), rot: lean - dUpper },
        lower: { pivot: elbow, at: upper([shoulder[0] + off[0], shoulder[1] + off[1]]), rot: lean - dLower },
      };
    }
    // One rigid piece: the elbow bend is folded into the arm angle and a slide along the arm.
    const delta = sh + a.elbowWeight * el - rest;
    const reachOf = (elbowAngle: number): number => 1 - clamp(elbowAngle / a.extendElbow, 0, 1);
    const slide = (reachOf(el) - reachOf(a.restElbow)) * a.reach;
    const heading = rad(rest + delta);
    const at: Pair = [shoulder[0] + Math.sin(heading) * slide, shoulder[1] + Math.cos(heading) * slide];
    const seg = { pivot: shoulder, at: upper(at), rot: lean - delta };
    return { upper: seg, lower: seg };
  };
  const front = armPlacement(
    p.shoulderFront,
    p.elbowFront,
    pose.frontArm,
    a.restAngles.armFront,
    a.restAngles.armFrontLower,
    present.has('arm-front-lower'),
  );
  const back = armPlacement(
    p.shoulderBack,
    p.elbowBack,
    pose.backArm,
    a.restAngles.armBack,
    a.restAngles.armBackLower,
    present.has('arm-back-lower'),
  );

  const out: Placement[] = [];
  const add = (layer: SvgLayerId, pivot: Pair, at: Pair, rot: number): void => {
    if (!present.has(layer)) return;
    const [x, y] = toRoot(at);
    out.push({ layer, pivot, x, y, rot });
  };

  for (const layer of SVG_DRAW_ORDER) {
    switch (layer) {
      case 'back':
        add(layer, a.cloth.pivot, upper(a.cloth.pivot), lean + frame.cloth);
        break;
      case 'arm-back':
        add(layer, back.upper.pivot, back.upper.at, back.upper.rot);
        break;
      case 'arm-back-lower':
        add(layer, back.lower.pivot, back.lower.at, back.lower.rot);
        break;
      case 'leg-back':
        add(layer, p.hipBack, p.hipBack, -dBack);
        break;
      case 'leg-front':
        add(layer, p.hipFront, p.hipFront, -dFront);
        break;
      case 'torso':
        add(layer, hipMid, hipMid, lean);
        break;
      case 'head':
        add(layer, p.neck, upper(p.neck), lean + pose.headTilt * a.headScale);
        break;
      case 'arm-front':
        add(layer, front.upper.pivot, front.upper.at, front.upper.rot);
        break;
      case 'arm-front-lower':
        add(layer, front.lower.pivot, front.lower.at, front.lower.rot);
        break;
      case 'prop': {
        const carrier = cfg.propFollows === 'arm-front' ? front.lower : cfg.propFollows === 'arm-back' ? back.lower : null;
        if (carrier) add(layer, carrier.pivot, carrier.at, carrier.rot);
        else add(layer, hipMid, hipMid, lean);
        break;
      }
    }
  }
  return out;
}
