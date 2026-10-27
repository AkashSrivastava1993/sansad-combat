import { getLook, resolveLookColor } from '../characters/look';
import type { FighterData, FighterLook, OutfitLayer, Pose, PropAnchor } from '../characters/types';
import { RIG } from './defaults';
import { FACE_STATES, type Expression } from './expression';
import {
  add,
  circlePoints,
  ellipsePoints,
  line,
  lerpV,
  type Painter,
  polyline,
  rad,
  rotate,
  scale,
  sub,
  type V,
  v,
} from './painter';

export interface RigFrame {
  pose: Pose;
  expression: Expression;
  /** Seconds; drives cloth sway. */
  time: number;
  /** -1..1: how hard cloth trails behind (1 = moving forward at full speed). */
  wind: number;
  /** Feet are planted on the ground; otherwise the pose floats freely. */
  grounded: boolean;
  /** Extra lift in px, e.g. the idle bounce. */
  bob: number;
  aura?: { color: string; alpha: number };
}

export interface Skeleton {
  hip: V;
  shoulderMid: V;
  neckTop: V;
  head: V;
  headRot: number;
  lean: number;
  shoulderF: V;
  shoulderB: V;
  elbowF: V;
  handF: V;
  elbowB: V;
  handB: V;
  hipF: V;
  kneeF: V;
  ankleF: V;
  shinF: number;
  hipB: V;
  kneeB: V;
  ankleB: V;
  shinB: number;
  groundY: number;
}

const up = (deg: number): V => v(Math.sin(rad(deg)), -Math.cos(rad(deg)));
const right = (deg: number): V => v(Math.cos(rad(deg)), Math.sin(rad(deg)));
/** Direction of a limb angle: 0 is straight down, positive swings forward. */
const down = (deg: number): V => v(Math.sin(rad(deg)), Math.cos(rad(deg)));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => clamp(Math.round(((n >> s) & 255) * k), 0, 255);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Joint positions in px, feet at y = 0 and up negative, facing right. */
export function solve(look: FighterLook, pose: Pose, grounded: boolean, bob: number): Skeleton {
  const p = look.proportions;
  const hip = v(0, -p.legLength);
  const shoulderMid = add(hip, scale(up(pose.lean), p.torsoHeight));
  const neckTop = add(shoulderMid, scale(up(pose.lean), p.neck));
  const headRot = pose.lean + pose.headTilt;
  const head = add(neckTop, scale(up(headRot), p.headHeight / 2));
  const spread = scale(right(pose.lean), p.shoulderWidth * 0.26);
  const shoulderF = add(shoulderMid, spread);
  const shoulderB = sub(shoulderMid, spread);

  const arm = (s: V, [a, b]: readonly [number, number]) => {
    const elbow = add(s, scale(down(a), p.upperArm));
    return { elbow, hand: add(elbow, scale(down(a + b), p.foreArm)) };
  };
  const leg = (h: V, [a, k]: readonly [number, number]) => {
    const knee = add(h, scale(down(a), p.legLength / 2));
    const shin = a - k;
    return { knee, ankle: add(knee, scale(down(shin), p.legLength / 2)), shin };
  };

  const aF = arm(shoulderF, pose.frontArm);
  const aB = arm(shoulderB, pose.backArm);
  const hipF = add(hip, v(p.hipWidth / 2, 0));
  const hipB = add(hip, v(-p.hipWidth / 2, 0));
  const lF = leg(hipF, pose.frontLeg);
  const lB = leg(hipB, pose.backLeg);

  // Plant the lowest foot on the ground so flexed legs lower the body instead of floating.
  const dy = (grounded ? -Math.max(lF.ankle.y, lB.ankle.y) : 0) - bob;
  const m = (q: V): V => v(q.x, q.y + dy);
  return {
    hip: m(hip),
    shoulderMid: m(shoulderMid),
    neckTop: m(neckTop),
    head: m(head),
    headRot,
    lean: pose.lean,
    shoulderF: m(shoulderF),
    shoulderB: m(shoulderB),
    elbowF: m(aF.elbow),
    handF: m(aF.hand),
    elbowB: m(aB.elbow),
    handB: m(aB.hand),
    hipF: m(hipF),
    kneeF: m(lF.knee),
    ankleF: m(lF.ankle),
    shinF: lF.shin,
    hipB: m(hipB),
    kneeB: m(lB.knee),
    ankleB: m(lB.ankle),
    shinB: lB.shin,
    groundY: dy,
  };
}

interface Ctx {
  p: Painter;
  data: FighterData;
  look: FighterLook;
  sk: Skeleton;
  frame: RigFrame;
  c: (token: string) => string;
}

function drawShoe(ctx: Ctx, ankle: V, shinDeg: number, color: string): void {
  const { look } = ctx;
  const len = look.proportions.footLength;
  const thick = look.proportions.legWidth * 0.9;
  const footDeg = clamp(shinDeg, -40, 100) + 90;
  const f = down(footDeg);
  const n = scale(down(clamp(shinDeg, -40, 100) + 180), 1);
  ctx.p.poly(
    [
      sub(ankle, scale(f, len * 0.3)),
      add(ankle, scale(f, len)),
      add(add(ankle, scale(f, len * 0.8)), scale(n, thick * 0.7)),
      add(sub(ankle, scale(f, len * 0.3)), scale(n, thick)),
    ],
    color,
  );
}

function drawLeg(ctx: Ctx, hipJoint: V, knee: V, ankle: V, shin: number, pants: string, shoes: string): void {
  const w = ctx.look.proportions.legWidth;
  line(ctx.p, hipJoint, knee, w, pants);
  line(ctx.p, knee, ankle, w * 0.9, pants);
  drawShoe(ctx, ankle, shin, shoes);
}

function drawArm(ctx: Ctx, shoulder: V, elbow: V, hand: V, sleeve: string, skin: string, mode: 'long' | 'short' | 'none'): void {
  const w = ctx.look.proportions.armWidth;
  line(ctx.p, shoulder, elbow, w, mode === 'none' ? skin : sleeve);
  line(ctx.p, elbow, hand, w * 0.88, mode === 'long' ? sleeve : skin);
  ctx.p.poly(circlePoints(hand.x, hand.y, w * 0.68), skin);
}

function anchorFrame(ctx: Ctx, anchor: PropAnchor): { pos: V; rot: number } {
  const { sk } = ctx;
  switch (anchor) {
    case 'head':
      return { pos: sk.head, rot: sk.headRot };
    case 'torso':
    case 'back':
      return { pos: sk.hip, rot: sk.lean };
    case 'handFront':
      return { pos: sk.handF, rot: 0 };
    case 'handBack':
      return { pos: sk.handB, rot: 0 };
    case 'feet':
      return { pos: v(0, sk.groundY), rot: 0 };
  }
}

function drawShape(ctx: Ctx, layer: Extract<OutfitLayer, { type: 'shape' }>): void {
  const a = anchorFrame(ctx, layer.anchor);
  const local = (q: V): V => add(a.pos, rotate(add(v(layer.x, -layer.y), rotate(q, layer.angle ?? 0)), a.rot));
  const hw = layer.width / 2;
  const hh = layer.height / 2;
  let pts: V[];
  if (layer.shape === 'rect') pts = [v(-hw, -hh), v(hw, -hh), v(hw, hh), v(-hw, hh)];
  else if (layer.shape === 'triangle') pts = [v(0, -hh), v(hw, hh), v(-hw, hh)];
  else pts = ellipsePoints(0, 0, layer.width, layer.height);
  ctx.p.poly(pts.map(local), ctx.c(layer.color), layer.alpha);
}

function clothAngle(frame: RigFrame, phase: number, base: number, breeze = 0): number {
  const { speed, swing, windSwing } = RIG.cloth;
  return base - windSwing * Math.max(-1, Math.min(1, frame.wind + breeze)) + Math.sin(frame.time * speed + phase) * swing;
}

function strip(from: V, to: V, w0: number, w1: number): V[] {
  const d = sub(to, from);
  const len = Math.hypot(d.x, d.y) || 1;
  const n = v(-d.y / len, d.x / len);
  return [add(from, scale(n, w0 / 2)), add(to, scale(n, w1 / 2)), sub(to, scale(n, w1 / 2)), sub(from, scale(n, w0 / 2))];
}

function drawBehindCloth(ctx: Ctx, layer: OutfitLayer): void {
  const { sk, look, frame } = ctx;
  const p = look.proportions;
  if (layer.type === 'shawl') {
    const ang = clothAngle(frame, 0, -14, layer.wind);
    const end = add(sk.shoulderB, scale(down(ang), layer.tail));
    ctx.p.poly(strip(sk.shoulderB, end, 14, 26), ctx.c(layer.color));
    if (layer.trim) ctx.p.poly(strip(add(sk.shoulderB, scale(down(ang), layer.tail * 0.86)), end, 15, 26), ctx.c(layer.trim));
  } else if (layer.type === 'scarf') {
    const base = add(sk.neckTop, scale(right(sk.lean), -p.headWidth * 0.25));
    const end = add(base, scale(down(clothAngle(frame, 1.2, -35, layer.wind)), layer.tail));
    ctx.p.poly(strip(base, end, (layer.thickness ?? 14) * 0.8, (layer.thickness ?? 14) * 1.07), ctx.c(layer.color));
  }
}

function drawBodyCloth(ctx: Ctx, layer: OutfitLayer): void {
  const { sk, look, p: painter } = ctx;
  const p = look.proportions;
  const R = right(sk.lean);
  const U = up(sk.lean);
  const half = (w: number) => scale(R, w / 2);

  if (layer.type === 'kurta') {
    const flare = layer.flare ?? 0;
    const hemY = sk.hip.y + layer.length;
    const hemHalf = p.waistWidth / 2 + flare;
    const sL = sub(sk.shoulderMid, half(p.shoulderWidth));
    const sR = add(sk.shoulderMid, half(p.shoulderWidth));
    painter.poly(
      [sL, sR, add(sk.hip, half(p.waistWidth)), v(sk.hip.x + hemHalf, hemY), v(sk.hip.x - hemHalf, hemY), sub(sk.hip, half(p.waistWidth))],
      ctx.c(layer.color),
    );
    if (layer.trim) {
      painter.poly(
        [v(sk.hip.x - hemHalf, hemY - 6), v(sk.hip.x + hemHalf, hemY - 6), v(sk.hip.x + hemHalf, hemY), v(sk.hip.x - hemHalf, hemY)],
        ctx.c(layer.trim),
      );
    }
  } else if (layer.type === 'vest') {
    const frac = layer.length ?? 0.85;
    const low = add(sk.hip, scale(U, p.torsoHeight * (1 - frac)));
    const lowHalf = (p.waistWidth + (p.shoulderWidth - p.waistWidth) * (1 - frac)) / 2;
    painter.poly(
      [
        add(sk.shoulderMid, half(p.shoulderWidth * 1.02)),
        sub(sk.shoulderMid, half(p.shoulderWidth * 1.02)),
        sub(low, scale(R, lowHalf)),
        add(low, scale(R, lowHalf)),
      ],
      ctx.c(layer.color),
    );
    // V opening shows the shirt beneath.
    const vTip = add(low, scale(U, p.torsoHeight * frac * 0.4));
    painter.poly(
      [add(sk.shoulderMid, half(p.shoulderWidth * 0.22)), sub(sk.shoulderMid, half(p.shoulderWidth * 0.22)), vTip],
      ctx.c(ctx.look.base?.top ?? 'primary'),
    );
    if (layer.trim) {
      painter.poly(strip(sub(low, scale(R, lowHalf)), add(low, scale(R, lowHalf)), 5, 5), ctx.c(layer.trim));
    }
  } else if (layer.type === 'shawl') {
    const backHip = sub(sk.hip, half(p.waistWidth * 0.9));
    painter.poly(strip(add(sk.shoulderMid, half(p.shoulderWidth * 0.4)), backHip, 16, 14), ctx.c(layer.color));
    painter.poly(strip(sub(sk.shoulderMid, half(p.shoulderWidth * 0.4)), add(sk.shoulderMid, half(p.shoulderWidth * 0.4)), 14, 14), ctx.c(layer.color));
    if (layer.trim) painter.poly(strip(add(sk.shoulderMid, half(p.shoulderWidth * 0.4)), backHip, 4, 3), ctx.c(layer.trim));
  } else if (layer.type === 'scarf') {
    const thick = layer.thickness ?? 14;
    painter.poly(ellipsePoints(sk.neckTop.x, sk.neckTop.y + 2, p.headWidth * 0.8, thick, sk.lean), ctx.c(layer.color));
    if (layer.band) painter.poly(ellipsePoints(sk.neckTop.x, sk.neckTop.y + thick * 0.35, p.headWidth * 0.78, thick * 0.3, sk.lean), ctx.c(layer.band));
    const front = add(sk.neckTop, scale(R, p.headWidth * 0.18));
    painter.poly(strip(front, add(front, scale(U, -layer.tail * 0.7)), thick * 0.85, thick), ctx.c(layer.color));
  } else if (layer.type === 'checks') {
    const t = layer.thickness ?? 1.5;
    const sL = sub(sk.shoulderMid, half(p.shoulderWidth));
    const sR = add(sk.shoulderMid, half(p.shoulderWidth));
    const wL = sub(sk.hip, half(p.waistWidth));
    const wR = add(sk.hip, half(p.waistWidth));
    const color = ctx.c(layer.color);
    for (let i = 1; i < layer.rows; i++) line(painter, lerpV(wL, sL, i / layer.rows), lerpV(wR, sR, i / layer.rows), t, color, 0.85);
    for (let j = 1; j < layer.cols; j++) line(painter, lerpV(wL, wR, j / layer.cols), lerpV(sL, sR, j / layer.cols), t, color, 0.85);
  }
}

function drawHead(ctx: Ctx): void {
  const { p: painter, look, sk, frame } = ctx;
  const pr = look.proportions;
  const w = pr.headWidth;
  const h = pr.headHeight;
  const skin = ctx.c('skin');
  const hp = (x: number, y: number): V => add(sk.head, rotate(v(x, y), sk.headRot));
  const map = (pts: V[]): V[] => pts.map((q) => hp(q.x, q.y));
  const E = (cx: number, cy: number, ew: number, eh: number): V[] => map(ellipsePoints(cx, cy, ew, eh));
  const lw = Math.max(1.6, h * 0.06);
  const dark = ctx.c('dark');
  const state = FACE_STATES[frame.expression];

  // Neck.
  line(painter, sk.shoulderMid, sk.neckTop, w * 0.34, shade(skin, 0.9));

  // Hair that sits behind the head.
  const hairColor = ctx.c(look.hair.color);
  const style = look.hair.style;
  const topCap = (): V[] => E(style === 'slick' ? -0.06 * w : -0.04 * w, -0.3 * h, (style === 'slick' ? 1.06 : 1.04) * w, (style === 'slick' ? 0.44 : 0.46) * h);
  if (style === 'volume') painter.poly(E(-0.18 * w, -0.02 * h, 1.55 * w, 1.3 * h), hairColor);
  if (style === 'long') painter.poly(map([v(-0.56 * w, -0.2 * h), v(-0.1 * w, -0.2 * h), v(-0.15 * w, 0.95 * h), v(-0.72 * w, 1.05 * h)]), hairColor);
  if (style === 'braid') {
    for (let i = 0; i < 6; i++) painter.poly(map(circlePoints(-0.52 * w, (0.1 + i * 0.18) * h, 0.11 * w)), hairColor);
  }
  if (style === 'bun') painter.poly(map(circlePoints(-0.42 * w, -0.6 * h, 0.2 * w)), hairColor);
  if (style === 'short' || style === 'messy' || style === 'slick' || style === 'bun' || style === 'braid' || style === 'long') {
    painter.poly(E(-0.42 * w, 0.02 * h, 0.34 * w, 0.62 * h), hairColor);
  }

  // Head and ear.
  const shape = look.head?.shape ?? 'oval';
  if (shape === 'square') {
    painter.poly(
      map([v(-0.5 * w, -0.3 * h), v(-0.3 * w, -0.5 * h), v(0.3 * w, -0.5 * h), v(0.5 * w, -0.3 * h), v(0.5 * w, 0.3 * h), v(0.3 * w, 0.5 * h), v(-0.3 * w, 0.5 * h), v(-0.5 * w, 0.3 * h)]),
      skin,
    );
  } else {
    painter.poly(E(0, 0, w, h), skin);
  }
  painter.poly(map(circlePoints(-0.12 * w, 0.08 * h, 0.09 * h)), shade(skin, 0.88));

  // Hair on top.
  if (style !== 'bald') painter.poly(topCap(), hairColor);
  if (style === 'messy') {
    for (const tuft of [
      [v(-0.5 * w, -0.25 * h), v(-0.38 * w, -0.58 * h), v(-0.2 * w, -0.3 * h)],
      [v(-0.1 * w, -0.4 * h), v(0.05 * w, -0.64 * h), v(0.2 * w, -0.4 * h)],
      [v(0.2 * w, -0.38 * h), v(0.4 * w, -0.6 * h), v(0.5 * w, -0.28 * h)],
      [v(0.05 * w, -0.2 * h), v(0.15 * w, -0.03 * h), v(0.25 * w, -0.2 * h)],
      [v(0.3 * w, -0.2 * h), v(0.4 * w, -0.05 * h), v(0.48 * w, -0.2 * h)],
    ]) {
      painter.poly(map(tuft), hairColor);
    }
  }
  if (look.hair.streak && style !== 'bald') {
    painter.poly(map([v(0, -0.47 * h), v(0.12 * w, -0.47 * h), v(0.42 * w, -0.12 * h), v(0.3 * w, -0.1 * h)]), ctx.c(look.hair.streak));
  }

  // Beard.
  for (const layer of look.outfit ?? []) {
    if (layer.type !== 'beard') continue;
    const size = layer.size ?? 1;
    const color = ctx.c(layer.color);
    if (layer.style === 'goatee') {
      painter.poly(map([v(0.12 * w, 0.38 * h), v(0.46 * w, 0.38 * h), v(0.36 * w, 0.38 * h + 0.22 * h * size)]), color);
    } else {
      const pts = map([
        v(-0.46 * w, 0.1 * h),
        v(0.34 * w, 0.14 * h),
        v(0.5 * w, 0.24 * h),
        v(0.46 * w, 0.42 * h),
        v(0.28 * w, 0.5 * h + 0.12 * h * size),
        v(-0.1 * w, 0.54 * h + 0.14 * h * size),
        v(-0.4 * w, 0.45 * h),
      ]);
      if (layer.style === 'stubble') painter.poly(pts, shade(skin, 0.7), 0.5);
      else painter.poly(pts, color);
    }
  }

  // Face.
  const eyeY = 0.04 * h;
  const eyeX = [0.1 * w, 0.34 * w];
  const [ew, eh] = look.face.eyes === 'narrow' ? [0.16 * w, 0.1 * h] : look.face.eyes === 'wide' ? [0.17 * w, 0.22 * h] : [0.15 * w, 0.17 * h];
  for (const x of eyeX) {
    if (look.face.tired) painter.poly(E(x, eyeY + eh * 0.75, ew, eh * 0.35), shade(skin, 0.75), 0.7);
    if (state.eyes === 'open') {
      painter.poly(E(x, eyeY, ew, eh), '#ffffff');
      painter.poly(map(circlePoints(x + ew * 0.18, eyeY, Math.min(ew, eh) * 0.36)), '#1a1a1a');
    } else if (state.eyes === 'closed') {
      polyline(painter, [hp(x - ew / 2, eyeY), hp(x + ew / 2, eyeY)], lw, dark);
    } else if (state.eyes === 'happy') {
      polyline(painter, [hp(x - ew / 2, eyeY + eh * 0.2), hp(x, eyeY - eh * 0.45), hp(x + ew / 2, eyeY + eh * 0.2)], lw, dark);
    } else if (state.eyes === 'x') {
      polyline(painter, [hp(x - ew / 2, eyeY - eh * 0.4), hp(x + ew / 2, eyeY + eh * 0.4)], lw, dark);
      polyline(painter, [hp(x + ew / 2, eyeY - eh * 0.4), hp(x - ew / 2, eyeY + eh * 0.4)], lw, dark);
    } else {
      polyline(painter, [hp(x - ew / 2, eyeY - eh * 0.45), hp(x + ew * 0.35, eyeY), hp(x - ew / 2, eyeY + eh * 0.45)], lw, dark);
    }
  }
  if (state.blush) {
    painter.poly(map(circlePoints(eyeX[1]! - 0.02 * w, 0.22 * h, 0.09 * w)), '#ff7a8a', 0.4);
  }

  const brow = look.face.brows;
  const tilt = (brow.tilt ?? 0) + state.browTilt;
  const browLen = 0.2 * w;
  const browDir = v(Math.cos(rad(tilt)), Math.sin(rad(tilt)));
  for (const x of eyeX) {
    const c = v(x, eyeY - 0.17 * h - state.browLift * h);
    polyline(painter, [hp(c.x - browDir.x * browLen / 2, c.y - browDir.y * browLen / 2), hp(c.x + browDir.x * browLen / 2, c.y + browDir.y * browLen / 2)], brow.thickness, ctx.c(brow.color));
  }

  painter.poly(map(ellipsePoints(0.5 * w, 0.14 * h, 0.1 * w, 0.14 * h)), shade(skin, 0.9));
  drawMouth(ctx, hp, map, lw);

  for (const layer of look.outfit ?? []) {
    if (layer.type !== 'moustache') continue;
    const color = ctx.c(layer.color);
    const my = layer.style === 'thick' ? 0.25 * h : 0.245 * h;
    const thick = layer.style === 'thin' ? 0.035 * h : layer.style === 'thick' ? 0.1 * h : 0.07 * h;
    painter.poly(map([v(0.17 * w, my - thick), v(0.52 * w, my - thick), v(0.52 * w, my + thick), v(0.17 * w, my + thick)]), color);
    if (layer.style === 'handlebar') {
      painter.poly(map([v(0.12 * w, my - 0.1 * h), v(0.2 * w, my), v(0.12 * w, my + 0.04 * h)]), color);
      painter.poly(map([v(0.57 * w, my - 0.1 * h), v(0.49 * w, my), v(0.57 * w, my + 0.04 * h)]), color);
    }
  }

  // Eyewear, then head wear.
  for (const layer of look.outfit ?? []) {
    if (layer.type === 'glasses') {
      const color = ctx.c(layer.color);
      if (layer.style === 'shades') {
        painter.poly(map([v(-0.02 * w, -0.07 * h), v(0.52 * w, -0.07 * h), v(0.5 * w, 0.17 * h), v(0, 0.17 * h)]), color);
      } else if (layer.style === 'pushed') {
        // Lenses resting on the hairline, above the eyes.
        const r = ew * 0.85;
        for (const x of eyeX) {
          painter.poly(E(x, -0.36 * h, r * 2, r * 2), color);
          painter.poly(E(x - r * 0.3, -0.36 * h - r * 0.3, r * 0.6, r * 0.4), '#ffffff', 0.5);
        }
        polyline(painter, [hp(eyeX[0]! + r, -0.36 * h), hp(eyeX[1]! - r, -0.36 * h)], lw, color);
      } else {
        const r = ew * 0.8;
        for (const x of eyeX) {
          const ring = ellipsePoints(x, eyeY, r * 2, r * 2, 0, 12);
          polyline(painter, [...ring, ring[0]!].map((q) => hp(q.x, q.y)), layer.thickness ?? lw * 0.8, color);
        }
        polyline(painter, [hp(eyeX[0]! + r, eyeY), hp(eyeX[1]! - r, eyeY)], layer.thickness ?? lw * 0.8, color);
      }
    } else if (layer.type === 'cap') {
      drawCap(ctx, layer, map, E);
    }
  }
}

function drawMouth(ctx: Ctx, hp: (x: number, y: number) => V, map: (pts: V[]) => V[], lw: number): void {
  const { p: painter, look, frame } = ctx;
  const { headWidth: w, headHeight: h } = look.proportions;
  const state = FACE_STATES[frame.expression];
  const mx = 0.28 * w;
  const my = 0.33 * h;
  const mw = 0.2 * w;
  const dark = ctx.c('dark');
  const mouthDark = '#3a1414';
  const arc = (sign: number, depth: number): V[] =>
    [-1, -0.5, 0, 0.5, 1].map((t) => hp(mx + (t * mw) / 2, my + sign * (1 - t * t) * depth * h));

  switch (state.mouth) {
    case 'open':
      painter.poly(map(ellipsePoints(mx, my, 0.12 * w, 0.12 * h)), mouthDark);
      return;
    case 'oh':
      painter.poly(map(ellipsePoints(mx, my, 0.09 * w, 0.13 * h)), mouthDark);
      return;
    case 'shout':
      painter.poly(map(ellipsePoints(mx, my + 0.02 * h, 0.22 * w, 0.2 * h)), mouthDark);
      painter.poly(map([v(mx - 0.09 * w, my - 0.05 * h), v(mx + 0.09 * w, my - 0.05 * h), v(mx + 0.08 * w, my - 0.01 * h), v(mx - 0.08 * w, my - 0.01 * h)]), '#ffffff');
      return;
    case 'grit':
      painter.poly(map([v(mx - 0.12 * w, my - 0.05 * h), v(mx + 0.12 * w, my - 0.05 * h), v(mx + 0.12 * w, my + 0.05 * h), v(mx - 0.12 * w, my + 0.05 * h)]), mouthDark);
      painter.poly(map([v(mx - 0.1 * w, my - 0.035 * h), v(mx + 0.1 * w, my - 0.035 * h), v(mx + 0.1 * w, my + 0.035 * h), v(mx - 0.1 * w, my + 0.035 * h)]), '#ffffff');
      polyline(painter, [hp(mx, my - 0.035 * h), hp(mx, my + 0.035 * h)], lw * 0.5, mouthDark);
      return;
    case 'happy': {
      const lip = [-1, -0.5, 0, 0.5, 1].map((t) => hp(mx + t * mw * 0.6, my - 0.02 * h));
      const bowl = [1, 0.5, 0, -0.5, -1].map((t) => hp(mx + t * mw * 0.6, my - 0.02 * h + (1 - t * t) * 0.14 * h));
      painter.poly([...lip, ...bowl], mouthDark);
      painter.poly([hp(mx - mw * 0.55, my - 0.02 * h), hp(mx + mw * 0.55, my - 0.02 * h), hp(mx + mw * 0.45, my + 0.02 * h), hp(mx - mw * 0.45, my + 0.02 * h)], '#ffffff');
      return;
    }
    case 'frown':
      polyline(painter, arc(-1, 0.05), lw, dark);
      return;
    case 'rest': {
      const style = look.face.mouth;
      if (style === 'smile') polyline(painter, arc(1, 0.05), lw, dark);
      else if (style === 'open') {
        painter.poly(map(ellipsePoints(mx, my + 0.02 * h, 0.2 * w, 0.18 * h)), mouthDark);
        painter.poly(map([v(mx - 0.08 * w, my - 0.05 * h), v(mx + 0.08 * w, my - 0.05 * h), v(mx + 0.07 * w, my - 0.01 * h), v(mx - 0.07 * w, my - 0.01 * h)]), '#ffffff');
      } else if (style === 'smirk') polyline(painter, [hp(mx - mw / 2, my + 0.02 * h), hp(mx + mw * 0.2, my + 0.01 * h), hp(mx + mw / 2, my - 0.05 * h)], lw, dark);
      else polyline(painter, [hp(mx - mw / 2, my), hp(mx + mw / 2, my)], lw, dark);
    }
  }
}

function drawCap(
  ctx: Ctx,
  layer: Extract<OutfitLayer, { type: 'cap' }>,
  map: (pts: V[]) => V[],
  E: (cx: number, cy: number, w: number, h: number) => V[],
): void {
  const { p: painter, look } = ctx;
  const { headWidth: w, headHeight: h } = look.proportions;
  const color = ctx.c(layer.color);
  const trim = ctx.c(layer.trim ?? layer.color);
  if (layer.style === 'topi') {
    painter.poly(map([v(-0.5 * w, -0.2 * h), v(0.5 * w, -0.2 * h), v(0.42 * w, -0.66 * h), v(-0.42 * w, -0.66 * h)]), color);
    painter.poly(map([v(-0.52 * w, -0.2 * h), v(0.52 * w, -0.2 * h), v(0.52 * w, -0.34 * h), v(-0.52 * w, -0.34 * h)]), trim);
  } else if (layer.style === 'woolen') {
    painter.poly(E(0, -0.3 * h, 1.04 * w, 0.62 * h), color);
    painter.poly(map([v(-0.52 * w, -0.16 * h), v(0.52 * w, -0.16 * h), v(0.52 * w, -0.3 * h), v(-0.52 * w, -0.3 * h)]), trim);
    painter.poly(map(circlePoints(0, -0.66 * h, 0.12 * h)), trim);
  } else if (layer.style === 'crown') {
    painter.poly(map([v(-0.4 * w, -0.28 * h), v(0.4 * w, -0.28 * h), v(0.4 * w, -0.4 * h), v(-0.4 * w, -0.4 * h)]), color);
    for (const x of [-0.3, 0, 0.3]) {
      const tall = x === 0 ? 0.36 : 0.26;
      painter.poly(map([v((x - 0.12) * w, -0.4 * h), v((x + 0.12) * w, -0.4 * h), v(x * w, (-0.4 - tall) * h)]), color);
    }
  } else if (layer.style === 'turban') {
    const hook = map([v(-0.5 * w, -0.12 * h)])[0]!;
    const end = add(hook, scale(down(clothAngle(ctx.frame, 2, -12)), layer.tail ?? 30));
    painter.poly(strip(hook, end, 12, 18), color);
    painter.poly(E(0, -0.27 * h, 1.18 * w, 0.78 * h), color);
    line(painter, map([v(-0.4 * w, -0.18 * h)])[0]!, map([v(0.42 * w, -0.48 * h)])[0]!, h * 0.12, trim);
    line(painter, map([v(-0.45 * w, -0.4 * h)])[0]!, map([v(0.4 * w, -0.14 * h)])[0]!, h * 0.12, trim);
  } else if (layer.style === 'hardhat') {
    painter.poly(E(0, -0.3 * h, 1.1 * w, 0.62 * h), color);
    painter.poly(map([v(-0.08 * w, -0.16 * h), v(0.64 * w, -0.16 * h), v(0.64 * w, -0.08 * h), v(-0.08 * w, -0.08 * h)]), trim);
    painter.poly(map([v(-0.06 * w, -0.6 * h), v(0.06 * w, -0.6 * h), v(0.06 * w, -0.3 * h), v(-0.06 * w, -0.3 * h)]), trim);
  } else {
    painter.poly(map([v(-0.5 * w, -0.2 * h), v(0.5 * w, -0.2 * h), v(0.5 * w, -0.3 * h), v(-0.5 * w, -0.3 * h)]), color);
  }
}

/** Draws the fighter facing right with the feet at y = 0 (up is negative). */
export function drawRig(painter: Painter, data: FighterData, frame: RigFrame): void {
  const look = getLook(data);
  const sk = solve(look, frame.pose, frame.grounded, frame.bob);
  const c = (token: string) => resolveLookColor(data, token);
  const ctx: Ctx = { p: painter, data, look, sk, frame, c };
  const pr = look.proportions;
  const base = look.base ?? {};
  const top = c(base.top ?? 'primary');
  const sleeveColor = c(base.sleeveColor ?? base.top ?? 'primary');
  const pants = c(base.pants ?? 'dark');
  const shoes = c(base.shoes ?? 'dark');
  const skin = c('skin');
  const sleeves = base.sleeves ?? 'long';
  const outfit = look.outfit ?? [];
  const layerOf = (l: Extract<OutfitLayer, { type: 'shape' }>): 'behind' | 'front' =>
    l.layer ?? (l.anchor === 'back' || l.anchor === 'handBack' ? 'behind' : 'front');
  const shapes = outfit.filter((l): l is Extract<OutfitLayer, { type: 'shape' }> => l.type === 'shape');

  if (frame.aura) {
    const height = pr.legLength + pr.torsoHeight + pr.neck + pr.headHeight;
    painter.poly(ellipsePoints(0, sk.groundY - height / 2, pr.shoulderWidth * 2, height * 1.15), frame.aura.color, frame.aura.alpha);
  }

  for (const s of shapes) if (s.anchor !== 'handBack' && layerOf(s) === 'behind') drawShape(ctx, s);
  drawArm(ctx, sk.shoulderB, sk.elbowB, sk.handB, sleeveColor, skin, sleeves);
  for (const s of shapes) if (s.anchor === 'handBack') drawShape(ctx, s);
  for (const l of outfit) drawBehindCloth(ctx, l);

  drawLeg(ctx, sk.hipB, sk.kneeB, sk.ankleB, sk.shinB, shade(pants, 0.85), shade(shoes, 0.85));
  drawLeg(ctx, sk.hipF, sk.kneeF, sk.ankleF, sk.shinF, pants, shoes);

  const R = right(sk.lean);
  painter.poly(
    [
      sub(sk.shoulderMid, scale(R, pr.shoulderWidth / 2)),
      add(sk.shoulderMid, scale(R, pr.shoulderWidth / 2)),
      add(sk.hip, scale(R, pr.waistWidth / 2)),
      sub(sk.hip, scale(R, pr.waistWidth / 2)),
    ],
    top,
  );
  for (const l of outfit) drawBodyCloth(ctx, l);

  drawHead(ctx);

  drawArm(ctx, sk.shoulderF, sk.elbowF, sk.handF, sleeveColor, skin, sleeves);
  for (const s of shapes) if (layerOf(s) === 'front') drawShape(ctx, s);
}
