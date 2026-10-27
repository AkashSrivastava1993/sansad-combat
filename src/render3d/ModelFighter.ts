import * as THREE from 'three';
import { getLook, resolveLookColor } from '../characters/look';
import type { FighterData, OutfitLayer, Proportions } from '../characters/types';
import { RIG } from '../rig/defaults';
import { shade, solve, type RigFrame, type Skeleton } from '../rig/draw';
import { FACE_STATES } from '../rig/expression';
import { add, rotate, sub, v, type V } from '../rig/painter';
import { Puppet3D, shared } from './Puppet3D';
import { DEG, PX } from './space';

const cylinder = shared(new THREE.CylinderGeometry(1, 1, 1, 8));
const sphere = shared(new THREE.SphereGeometry(1, 12, 8));
const dome = shared(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
const box = shared(new THREE.BoxGeometry(1, 1, 1));
const cone = shared(new THREE.ConeGeometry(1, 1, 8));
const ring = shared(new THREE.TorusGeometry(1, 0.18, 6, 14));

/** Yaw towards the camera so the model reads as 3D rather than a side profile. */
const TURN = 28 * DEG;
/** Body depth (front to back) relative to shoulder width. */
const CHEST_DEPTH = 0.62;

type Shape = Extract<OutfitLayer, { type: 'shape' }>;

/** Positions a unit cylinder between two skeleton points (px, y down). */
function bone(mesh: THREE.Object3D, a: V, b: V, radius: number, depth = radius): void {
  const dx = (b.x - a.x) * PX;
  const dy = -(b.y - a.y) * PX;
  mesh.position.x = ((a.x + b.x) / 2) * PX;
  mesh.position.y = (-(a.y + b.y) / 2) * PX;
  mesh.rotation.z = Math.atan2(-dx, dy);
  mesh.scale.set(radius * PX, Math.hypot(dx, dy) || 1e-4, depth * PX);
}

function at(mesh: THREE.Object3D, p: V): void {
  mesh.position.x = p.x * PX;
  mesh.position.y = -p.y * PX;
}

interface Limb {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  joint: THREE.Mesh;
  end: THREE.Mesh;
  cap?: THREE.Mesh;
}

/** A low-poly 3D body built from the procedural `look` and driven by the same skeleton as the 2D rig. */
export class ModelFighter extends Puppet3D {
  private readonly p: Proportions;
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly baseOpacity = new Map<THREE.MeshStandardMaterial, number>();
  private readonly skin: THREE.MeshStandardMaterial;
  private readonly torso: THREE.Mesh;
  private readonly pelvis: THREE.Mesh;
  private readonly neck: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly eyes: THREE.Group[] = [];
  private readonly brows: THREE.Mesh[] = [];
  private mouth!: THREE.Mesh;
  private readonly arms: Record<'F' | 'B', Limb>;
  private readonly legs: Record<'F' | 'B', Limb>;
  private readonly kurta: { mesh: THREE.Mesh; length: number } | null = null;
  private readonly cape: THREE.Mesh | null = null;
  private readonly scarf: THREE.Mesh | null = null;
  private readonly props: { mesh: THREE.Mesh; layer: Shape; z: number }[] = [];
  private readonly aura: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

  constructor(parent: THREE.Object3D, data: FighterData) {
    super(parent, data);
    const look = getLook(data);
    const p = (this.p = look.proportions);
    const c = (token: string): string => resolveLookColor(data, token);
    const base = look.base ?? {};
    const outfit = look.outfit ?? [];
    const kurta = outfit.find((l) => l.type === 'kurta');
    const skin = c('skin');
    this.skin = this.mat(skin);
    const top = this.mat(c(kurta?.color ?? base.top ?? 'primary'));
    const sleeve = this.mat(c(base.sleeveColor ?? base.top ?? 'primary'));
    const pants = this.mat(c(base.pants ?? 'dark'));
    const shoes = this.mat(c(base.shoes ?? 'dark'));
    const sleeves = base.sleeves ?? 'long';

    this.torso = this.mesh(new THREE.CylinderGeometry(1, p.waistWidth / p.shoulderWidth, 1, 8), top);
    this.pelvis = this.mesh(sphere, pants);
    this.neck = this.mesh(cylinder, this.skin);

    const limb = (upper: THREE.Material, lower: THREE.Material, end: THREE.Material, endGeo: THREE.BufferGeometry, cap?: THREE.Material): Limb => ({
      upper: this.mesh(cylinder, upper),
      lower: this.mesh(cylinder, lower),
      joint: this.mesh(sphere, lower),
      end: this.mesh(endGeo, end),
      cap: cap ? this.mesh(sphere, cap) : undefined,
    });
    const upperArm = sleeves === 'none' ? this.skin : sleeve;
    const foreArm = sleeves === 'long' ? sleeve : this.skin;
    this.arms = { F: limb(upperArm, foreArm, this.skin, sphere, upperArm), B: limb(upperArm, foreArm, this.skin, sphere, upperArm) };
    this.legs = { F: limb(pants, pants, shoes, box), B: limb(pants, pants, shoes, box) };

    if (kurta) {
      const r = p.waistWidth / 2;
      const flare = kurta.flare ?? 0;
      this.kurta = {
        mesh: this.mesh(new THREE.CylinderGeometry(r * PX, (r + flare) * PX, kurta.length * PX, 8), this.mat(c(kurta.color))),
        length: kurta.length,
      };
      this.kurta.mesh.scale.set(CHEST_DEPTH * 1.15, 1, 1.05);
    }
    for (const layer of outfit) {
      if (layer.type === 'shawl') {
        this.cape = this.mesh(box, this.mat(c(layer.color)));
      } else if (layer.type === 'scarf') {
        this.scarf = this.mesh(cylinder, this.mat(c(layer.color)));
      } else if (layer.type === 'shape') {
        const geo = layer.shape === 'rect' ? box : layer.shape === 'triangle' ? cone : sphere;
        const z = layer.anchor === 'handFront' ? this.armZ : layer.anchor === 'handBack' ? -this.armZ : 0;
        this.props.push({ mesh: this.mesh(geo, this.mat(c(layer.color), layer.alpha ?? 1)), layer, z });
      }
    }

    this.buildHead(c, skin, outfit, look.hair);

    this.aura = new THREE.Mesh(
      sphere,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.aura.position.y = (data.body.height / 2) * PX;
    this.aura.scale.set(data.body.width * 0.85 * PX, data.body.height * 0.6 * PX, data.body.width * 0.85 * PX);
    this.root.add(this.aura);
  }

  private get armZ(): number {
    return this.p.shoulderWidth * 0.5 * PX;
  }

  private get legZ(): number {
    return Math.max(this.p.hipWidth / 2, this.p.legWidth * 0.6) * PX;
  }

  private mat(hex: string, alpha = 1): THREE.MeshStandardMaterial {
    const key = `${hex}:${alpha}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62, metalness: 0.05, flatShading: true, transparent: true, opacity: alpha });
      this.materials.set(key, m);
      this.baseOpacity.set(m, alpha);
    }
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = this.root): THREE.Mesh {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** Head-local helper: x forward, y up, all in fractions of the head size. */
  private part(geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
    const { headWidth: w, headHeight: h } = this.p;
    const m = this.mesh(geo, material, this.head);
    m.position.set(x * w * PX, y * h * PX, z * w * PX);
    m.scale.set(sx * w * PX, sy * h * PX, sz * w * PX);
    return m;
  }

  private buildHead(c: (t: string) => string, skin: string, outfit: OutfitLayer[], hair: { style: string; color: string }): void {
    this.root.add(this.head);
    const look = getLook(this.data);
    if (look.head?.shape === 'square') this.part(box, this.skin, 0, 0, 0, 1, 1, 0.85);
    else this.part(sphere, this.skin, 0, 0, 0, 0.5, 0.5, 0.44);
    this.part(sphere, this.mat(shade(skin, 0.9)), 0.5, -0.12, 0, 0.09, 0.09, 0.08);

    const white = this.mat('#ffffff');
    const pupil = this.mat('#1a1a1a');
    for (const z of [-0.2, 0.2]) {
      const eye = new THREE.Group();
      this.head.add(eye);
      eye.position.set(0.36 * this.p.headWidth * PX, -0.04 * this.p.headHeight * PX, z * this.p.headWidth * PX);
      const ball = this.mesh(sphere, white, eye);
      ball.scale.setScalar(0.1 * this.p.headWidth * PX);
      const dot = this.mesh(sphere, pupil, eye);
      dot.position.x = 0.075 * this.p.headWidth * PX;
      dot.scale.setScalar(0.055 * this.p.headWidth * PX);
      this.eyes.push(eye);
      this.brows.push(this.part(box, this.mat(c(look.face.brows.color)), 0.4, 0.15, z, 0.06, look.face.brows.thickness / this.p.headHeight, 0.22));
    }
    this.mouth = this.part(box, this.mat('#3a1414'), 0.44, -0.3, 0, 0.06, 0.05, 0.24);

    const hairMat = this.mat(c(hair.color));
    const style = hair.style;
    if (style !== 'bald') this.part(dome, hairMat, -0.04, 0.02, 0, 0.54, 0.54, 0.49);
    if (style === 'volume') this.part(sphere, hairMat, -0.24, 0.08, 0, 0.56, 0.6, 0.54);
    if (['short', 'messy', 'slick', 'bun', 'braid', 'long'].includes(style)) this.part(sphere, hairMat, -0.3, -0.05, 0, 0.25, 0.36, 0.45);
    if (style === 'long') this.part(box, hairMat, -0.4, -0.5, 0, 0.3, 1.1, 0.85);
    if (style === 'bun') this.part(sphere, hairMat, -0.42, 0.6, 0, 0.2, 0.2, 0.2);
    if (style === 'braid') for (let i = 0; i < 6; i++) this.part(sphere, hairMat, -0.52, -0.1 - i * 0.18, 0, 0.11, 0.11, 0.11);
    if (style === 'messy') {
      for (const [x, z] of [[-0.3, 0.1], [0, -0.15], [0.25, 0.12], [0.05, 0.25]] as const) {
        this.part(cone, hairMat, x, 0.56, z, 0.12, 0.28, 0.12).rotation.z = -x;
      }
    }

    for (const layer of outfit) {
      if (layer.type === 'cap') this.buildCap(layer, c);
      else if (layer.type === 'moustache') {
        const t = layer.style === 'thin' ? 0.07 : layer.style === 'thick' ? 0.2 : 0.14;
        this.part(box, this.mat(c(layer.color)), 0.44, -0.23, 0, 0.12, t, 0.38);
        if (layer.style === 'handlebar') {
          for (const z of [-0.2, 0.2]) this.part(cone, this.mat(c(layer.color)), 0.44, -0.2, z, 0.05, 0.16, 0.05).rotation.x = z * 4;
        }
      } else if (layer.type === 'beard') {
        const size = layer.size ?? 1;
        if (layer.style === 'goatee') this.part(sphere, this.mat(c(layer.color)), 0.36, -0.46, 0, 0.12, 0.13 * size, 0.14);
        else if (layer.style === 'stubble') this.part(sphere, this.mat(shade(skin, 0.7), 0.6), 0.1, -0.12, 0, 0.42, 0.4, 0.46);
        else this.part(sphere, this.mat(c(layer.color)), 0.14, -0.32, 0, 0.4, 0.3 * size, 0.46);
      } else if (layer.type === 'glasses') {
        const m = this.mat(c(layer.color));
        if (layer.style === 'shades') this.part(box, m, 0.47, -0.04, 0, 0.06, 0.22, 0.64);
        else {
          const y = layer.style === 'pushed' ? 0.36 : -0.04;
          for (const z of [-0.2, 0.2]) this.part(ring, m, 0.45, y, z, 0.14, 0.14 * (this.p.headWidth / this.p.headHeight), 0.14).rotation.y = Math.PI / 2;
          this.part(box, m, 0.48, y, 0, 0.03, 0.03, 0.14);
        }
      }
    }
  }

  private buildCap(layer: Extract<OutfitLayer, { type: 'cap' }>, c: (t: string) => string): void {
    const m = this.mat(c(layer.color));
    const trim = this.mat(c(layer.trim ?? layer.color));
    switch (layer.style) {
      case 'topi':
        this.part(cylinder, m, 0, 0.45, 0, 0.47, 0.46, 0.45);
        this.part(cylinder, trim, 0, 0.26, 0, 0.53, 0.14, 0.5);
        break;
      case 'woolen':
        this.part(dome, m, -0.02, 0.08, 0, 0.57, 0.62, 0.52);
        this.part(cylinder, trim, -0.02, 0.18, 0, 0.56, 0.14, 0.51);
        this.part(sphere, trim, -0.02, 0.74, 0, 0.12, 0.12, 0.12);
        break;
      case 'crown':
        this.part(cylinder, m, 0, 0.36, 0, 0.42, 0.14, 0.4);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          this.part(cone, m, Math.cos(a) * 0.36, 0.56, Math.sin(a) * 0.34, 0.08, 0.3, 0.08);
        }
        break;
      case 'turban':
        this.part(sphere, m, -0.03, 0.25, 0, 0.6, 0.42, 0.56);
        this.part(ring, trim, -0.03, 0.2, 0, 0.56, 0.56, 0.52).rotation.x = Math.PI / 2;
        break;
      case 'hardhat':
        this.part(dome, m, 0, 0.08, 0, 0.6, 0.62, 0.55);
        this.part(box, trim, 0.4, 0.1, 0, 0.5, 0.05, 0.9);
        break;
      default:
        this.part(cylinder, m, 0, 0.26, 0, 0.52, 0.12, 0.47);
    }
  }

  protected turn(facing: 1 | -1): number {
    return -facing * TURN;
  }

  render(frame: RigFrame): void {
    const p = this.p;
    const sk = solve(getLook(this.data), frame.pose, frame.grounded, frame.bob);
    // The 2D rig spreads shoulders and hips sideways to fake depth; here they sit on the body's centre line.
    const shoulderOff = (s: V): V => sub(sk.shoulderMid, s);
    const hipOff = (h: V): V => sub(sk.hip, h);

    bone(this.torso, sk.hip, sk.shoulderMid, (p.shoulderWidth / 2) * CHEST_DEPTH, p.shoulderWidth / 2);
    at(this.pelvis, sk.hip);
    this.pelvis.rotation.z = -sk.lean * DEG;
    this.pelvis.scale.set(p.waistWidth * 0.32 * PX, p.legWidth * 0.75 * PX, p.waistWidth * 0.5 * PX);
    bone(this.neck, sk.shoulderMid, add(sk.neckTop, v(0, -p.headHeight * 0.2)), p.headWidth * 0.17);

    at(this.head, sk.head);
    this.head.rotation.z = -sk.headRot * DEG;
    const face = FACE_STATES[frame.expression];
    const squint = { open: 1, closed: 0.15, happy: 0.35, wince: 0.3, x: 0.15 }[face.eyes];
    for (const eye of this.eyes) eye.scale.y = squint;
    this.brows.forEach((b, i) => {
      b.position.y = (0.15 + face.browLift) * p.headHeight * PX;
      b.rotation.x = (i === 0 ? 1 : -1) * face.browTilt * DEG;
    });
    const open = { rest: 0.05, open: 0.14, oh: 0.14, shout: 0.2, grit: 0.09, happy: 0.12, frown: 0.04 }[face.mouth];
    this.mouth.scale.y = open * p.headHeight * PX;
    const hurt = frame.expression === 'hurt' || frame.expression === 'ko';
    this.skin.emissive.set(hurt ? 0x661010 : 0x000000);

    const arm = (l: Limb, shoulder: V, elbow: V, hand: V, z: number): void => {
      const off = shoulderOff(shoulder);
      const [s, e, h] = [shoulder, elbow, hand].map((q) => add(q, off)) as [V, V, V];
      const r = p.armWidth / 2;
      bone(l.upper, s, e, r);
      bone(l.lower, e, h, r * 0.88);
      at(l.joint, e);
      l.joint.scale.setScalar(r * 0.9 * PX);
      at(l.end, h);
      l.end.scale.setScalar(p.armWidth * 0.62 * PX);
      if (l.cap) {
        at(l.cap, s);
        l.cap.scale.setScalar(r * 1.25 * PX);
      }
      for (const m of [l.upper, l.lower, l.joint, l.end, l.cap]) if (m) m.position.z = z;
    };
    arm(this.arms.F, sk.shoulderF, sk.elbowF, sk.handF, this.armZ);
    arm(this.arms.B, sk.shoulderB, sk.elbowB, sk.handB, -this.armZ);

    const leg = (l: Limb, hip: V, knee: V, ankle: V, shin: number, z: number): void => {
      const off = hipOff(hip);
      const [h, k, a] = [hip, knee, ankle].map((q) => add(q, off)) as [V, V, V];
      const r = p.legWidth / 2;
      bone(l.upper, h, k, r * 1.1);
      bone(l.lower, k, a, r * 0.95);
      at(l.joint, k);
      l.joint.scale.setScalar(r * PX);
      const tilt = Math.min(100, Math.max(-40, shin)) * DEG;
      const along = v(Math.cos(tilt), -Math.sin(tilt));
      const upward = v(-Math.sin(tilt), -Math.cos(tilt));
      const len = p.footLength;
      at(l.end, add(a, add(v(along.x * len * 0.35, along.y * len * 0.35), v(upward.x * r * 0.7, upward.y * r * 0.7))));
      l.end.rotation.z = tilt;
      l.end.scale.set(len * 1.3 * PX, r * 1.3 * PX, p.legWidth * 1.1 * PX);
      for (const m of [l.upper, l.lower, l.joint, l.end]) m.position.z = z;
    };
    leg(this.legs.F, sk.hipF, sk.kneeF, sk.ankleF, sk.shinF, this.legZ);
    leg(this.legs.B, sk.hipB, sk.kneeB, sk.ankleB, sk.shinB, -this.legZ);

    if (this.kurta) {
      at(this.kurta.mesh, v(sk.hip.x, sk.hip.y + this.kurta.length / 2 - p.legWidth * 0.3));
    }
    if (this.cape) {
      const { speed, swing, windSwing } = RIG.cloth;
      const angle = -14 - windSwing * 0.5 * frame.wind + Math.sin(frame.time * speed) * swing;
      const top = sub(sk.shoulderMid, v(p.shoulderWidth * CHEST_DEPTH * 0.45, 0));
      const end = add(top, rotate(v(0, p.torsoHeight + p.legLength * 0.4), -angle));
      bone(this.cape, top, end, p.shoulderWidth * 0.1, p.shoulderWidth * 0.95);
    }
    if (this.scarf) {
      at(this.scarf, sk.neckTop);
      this.scarf.rotation.z = -sk.lean * DEG;
      this.scarf.scale.set(p.headWidth * 0.42 * PX, 12 * PX, p.headWidth * 0.48 * PX);
    }

    for (const { mesh, layer, z } of this.props) this.placeProp(mesh, layer, z, sk);

    this.aura.visible = frame.aura !== undefined;
    if (frame.aura) {
      this.aura.material.color.set(frame.aura.color);
      this.aura.material.opacity = frame.aura.alpha;
    }
  }

  private placeProp(mesh: THREE.Mesh, layer: Shape, z: number, sk: Skeleton): void {
    const hand = (s: V, q: V): V => add(q, sub(sk.shoulderMid, s));
    const anchor: { pos: V; rot: number } =
      layer.anchor === 'head'
        ? { pos: sk.head, rot: sk.headRot }
        : layer.anchor === 'torso' || layer.anchor === 'back'
          ? { pos: sk.hip, rot: sk.lean }
          : layer.anchor === 'handFront'
            ? { pos: hand(sk.shoulderF, sk.handF), rot: 0 }
            : layer.anchor === 'handBack'
              ? { pos: hand(sk.shoulderB, sk.handB), rot: 0 }
              : { pos: v(0, sk.groundY), rot: 0 };
    at(mesh, add(anchor.pos, rotate(v(layer.x, -layer.y), anchor.rot)));
    mesh.position.z = z;
    mesh.rotation.z = -((layer.angle ?? 0) + anchor.rot) * DEG;
    const d = Math.min(layer.width, layer.height) * 0.6;
    if (layer.shape === 'rect') mesh.scale.set(layer.width * PX, layer.height * PX, d * PX);
    else if (layer.shape === 'triangle') mesh.scale.set((layer.width / 2) * PX, layer.height * PX, (d / 2) * PX);
    else mesh.scale.set((layer.width / 2) * PX, (layer.height / 2) * PX, (d / 2) * PX);
  }

  protected setOpacity(alpha: number): void {
    for (const [m, base] of this.baseOpacity) m.opacity = base * alpha;
  }
}
