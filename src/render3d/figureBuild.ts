import * as THREE from 'three';
import type { FighterData, FigureConfig, PropKind } from '../core/characters/types';
import { PX } from './space';

export interface ArmRig {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  /** Held items sit here; null when this arm carries nothing. */
  prop: THREE.Group | null;
}

export interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  shoe: THREE.Object3D;
}

/** The joints of a built figure, ready to be posed. It faces +z and has its feet on y = 0. */
export interface FigureRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  /** Skin of the head, tinted when the fighter is hurt. */
  headSkin: THREE.MeshStandardMaterial;
  skin: string;
  front: { arm: ArmRig; leg: LegRig };
  back: { arm: ArmRig; leg: LegRig };
  pallu: THREE.Group | null;
  /** Every material, so opacity can be changed in one go. */
  materials: THREE.Material[];
  /** Local x of the arms, legs, in world units. */
  shoulderX: number;
  hipX: number;
  thigh: number;
  shin: number;
  restHipY: number;
}

const OUTLINE = 0x14172a;

const stripeTextures = new Map<string, THREE.CanvasTexture>();

function stripeTexture(base: string, stripe: string): THREE.CanvasTexture {
  const key = `${base}|${stripe}`;
  let tex = stripeTextures.get(key);
  if (!tex) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillStyle = stripe;
    for (const x of [6, 9, 22, 25, 28, 40, 43, 54, 57]) ctx.fillRect(x, 0, 1.5, 8);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    stripeTextures.set(key, tex);
  }
  return tex;
}

class Parts {
  readonly materials: THREE.Material[] = [];
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly hull = new THREE.MeshBasicMaterial({ color: OUTLINE, side: THREE.BackSide });

  constructor() {
    this.materials.push(this.hull);
  }

  /** Cloth with thin vertical stripes of `stripe` over `base`. */
  striped(base: string, stripe: string): THREE.MeshStandardMaterial {
    const key = `${base}|${stripe}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: stripeTexture(base, stripe), roughness: 0.9, flatShading: true });
      this.cache.set(key, m);
      this.materials.push(m);
    }
    return m;
  }

  material(color: string): THREE.MeshStandardMaterial {
    let m = this.cache.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
      this.cache.set(color, m);
      this.materials.push(m);
    }
    return m;
  }

  /** A solid with a dark inflated copy behind it for a cartoon outline. */
  solid(geo: THREE.BufferGeometry, material: THREE.Material, outline = 1.08): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    if (outline > 0) {
      const hull = new THREE.Mesh(geo, this.hull);
      geo.computeBoundingBox();
      // Inflate about the part's own centre, since limbs are modelled hanging from their pivot.
      hull.scale.setScalar(outline);
      geo.boundingBox!.getCenter(hull.position).multiplyScalar(1 - outline);
      mesh.add(hull);
    }
    return mesh;
  }

  /** A part with no outline, for thin cloth and small details. */
  flat(geo: THREE.BufferGeometry, color: string): THREE.Mesh {
    return this.solid(geo, this.material(color), 0);
  }
}

const group = (...children: THREE.Object3D[]): THREE.Group => {
  const g = new THREE.Group();
  g.add(...children);
  return g;
};

const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

/** A limb segment hanging down from its pivot at the origin. */
const limb = (rTop: number, rBottom: number, length: number, sides = 8): THREE.CylinderGeometry =>
  new THREE.CylinderGeometry(rTop, rBottom, length, sides).translate(0, -length / 2, 0);

function buildHead(p: Parts, f: FigureConfig, r: number, skinMat: THREE.MeshStandardMaterial): THREE.Group {
  const head = new THREE.Group();
  const face = p.solid(new THREE.IcosahedronGeometry(r, 2), skinMat);
  head.add(face);
  for (const x of [-1, 1]) {
    head.add(at(p.flat(new THREE.SphereGeometry(r * 0.14, 8, 6), '#f4f1e8'), x * r * 0.4, r * 0.14, r * 0.9));
    head.add(at(p.flat(new THREE.SphereGeometry(r * 0.08, 8, 6), '#17141c'), x * r * 0.4, r * 0.14, r * 1.0));
    head.add(at(p.solid(new THREE.SphereGeometry(r * 0.2, 8, 6), skinMat, 0), x * r * 0.98, -r * 0.02, -r * 0.04));
  }
  head.add(at(p.solid(new THREE.ConeGeometry(r * 0.2, r * 0.42, 6).rotateX(Math.PI / 2), skinMat, 1.05), 0, -r * 0.1, r * 1.0));
  // Brows pulled slightly down and in, and a mouth mid-speech, for a determined look.
  const brow = f.hair?.color ?? '#1a1416';
  for (const x of [-1, 1]) {
    const b = at(p.flat(new THREE.BoxGeometry(r * 0.38, r * 0.075, r * 0.1), brow), x * r * 0.4, r * 0.43, r * 0.88);
    b.rotation.z = x * -0.2;
    head.add(b);
  }
  head.add(at(p.flat(new THREE.BoxGeometry(r * 0.34, r * 0.1, r * 0.1), '#4a2226'), 0, -r * 0.52, r * 0.88));

  if (f.glasses === 'frame') {
    const ink = '#101014';
    const rim = r * 0.045;
    for (const x of [-1, 1]) {
      const w = r * 0.5;
      const h = r * 0.34;
      const cx = x * r * 0.4;
      head.add(at(p.flat(new THREE.BoxGeometry(w, rim, rim), ink), cx, r * 0.14 + h / 2, r * 0.93));
      head.add(at(p.flat(new THREE.BoxGeometry(w, rim, rim), ink), cx, r * 0.14 - h / 2, r * 0.93));
      head.add(at(p.flat(new THREE.BoxGeometry(rim, h, rim), ink), cx - w / 2, r * 0.14, r * 0.93));
      head.add(at(p.flat(new THREE.BoxGeometry(rim, h, rim), ink), cx + w / 2, r * 0.14, r * 0.93));
      // The arm running back along the side of the head to the ear.
      head.add(at(p.flat(new THREE.BoxGeometry(rim, rim, r * 0.95), ink), x * r * 0.97, r * 0.24, r * 0.45));
    }
    head.add(at(p.flat(new THREE.BoxGeometry(r * 0.3, rim, rim), ink), 0, r * 0.24, r * 0.95));
  } else if (f.glasses) {
    const dark = f.glasses === 'dark';
    for (const x of [-1, 1]) {
      const lens = dark
        ? p.flat(new THREE.CylinderGeometry(r * 0.27, r * 0.27, r * 0.08, 10).rotateX(Math.PI / 2), '#101018')
        : p.flat(new THREE.TorusGeometry(r * 0.24, r * 0.035, 5, 12), '#4a3a2e');
      head.add(at(lens, x * r * 0.38, r * 0.14, r * 0.9));
    }
    head.add(at(p.flat(new THREE.BoxGeometry(r * 0.3, r * 0.05, r * 0.05), dark ? '#101018' : '#4a3a2e'), 0, r * 0.16, r * 0.93));
  }
  if (f.moustache) head.add(at(p.flat(new THREE.BoxGeometry(r * 0.62, r * 0.13, r * 0.22), f.moustache), 0, -r * 0.3, r * 0.93));
  if (f.earring) {
    head.add(at(p.flat(new THREE.TorusGeometry(r * 0.1, r * 0.025, 5, 10), '#f2c14a'), -r * 0.98, -r * 0.28, -r * 0.04));
    head.add(at(p.flat(new THREE.TorusGeometry(r * 0.1, r * 0.025, 5, 10), '#f2c14a'), r * 0.98, -r * 0.28, -r * 0.04));
  }

  if (f.beard) {
    const k = { short: 1.035, full: 1.09, long: 1.1 }[f.beard.length];
    // Only the front half of the lower head: jaw and chin, not the back of the skull.
    const cap = new THREE.SphereGeometry(r * k, 14, 8, Math.PI / 2 - 1.2, 2.4, Math.PI * 0.5, Math.PI * 0.5);
    head.add(at(p.solid(cap, p.material(f.beard.color), 0), 0, -r * 0.02, r * 0.02));
    if (f.beard.length === 'long') {
      head.add(at(p.solid(new THREE.ConeGeometry(r * 0.62, r * 1.2, 8).rotateX(Math.PI), p.material(f.beard.color), 1.04), 0, -r * 1.05, r * 0.3));
    }
  }

  const hair = f.hair;
  if (hair && hair.style !== 'bald') {
    const m = p.material(hair.color);
    const k = hair.style === 'wavy' ? 1.1 : 1.05;
    const cap = p.solid(new THREE.SphereGeometry(r * k, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), m, 1.05);
    cap.rotation.x = -0.5;
    head.add(cap);
    if (hair.style === 'bun') head.add(at(p.solid(new THREE.IcosahedronGeometry(r * 0.38, 1), m, 1.1), 0, r * 0.62, -r * 0.98));
    if (hair.style === 'wavy') {
      head.add(at(p.solid(new THREE.IcosahedronGeometry(r * 0.55, 1), m, 1.06), 0, r * 0.82, r * 0.12));
      head.add(at(p.solid(new THREE.IcosahedronGeometry(r * 0.5, 1), m, 1.06), 0, r * 0.35, -r * 0.82));
    }
    if (hair.style === 'curly') {
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const tip = i % 2;
        head.add(at(p.solid(new THREE.IcosahedronGeometry(r * (0.34 + tip * 0.06), 1), m, 1.07), Math.sin(a) * r * 0.9, r * (0.45 + tip * 0.35), -Math.cos(a) * r * 0.55 - r * 0.25));
      }
      head.add(at(p.solid(new THREE.IcosahedronGeometry(r * 0.5, 1), m, 1.06), 0, r * 1.0, -r * 0.1));
    }
  }

  if (f.topi) {
    const dome = p.solid(new THREE.SphereGeometry(r * 1.07, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), p.material(f.topi.color), 1.05);
    dome.scale.y = 0.8;
    dome.position.y = r * 0.5;
    dome.rotation.x = 0.12;
    head.add(dome);
    const band = p.solid(new THREE.CylinderGeometry(r * 1.02, r * 1.04, r * 0.2, 14, 1, true), p.material(f.topi.band ?? f.topi.color), 0);
    band.position.y = r * 0.5;
    band.rotation.x = 0.12;
    head.add(band);
  }
  return head;
}

function buildProp(p: Parts, kind: PropKind, H: number): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'broom') {
    g.add(at(p.solid(new THREE.CylinderGeometry(0.012 * H, 0.012 * H, 0.62 * H, 6), p.material('#7a5230'), 1.2), 0, 0.2 * H, 0));
    g.add(at(p.solid(new THREE.ConeGeometry(0.05 * H, 0.2 * H, 8), p.material('#d9a441'), 1.06), 0, 0.58 * H, 0));
    g.add(at(p.flat(new THREE.CylinderGeometry(0.03 * H, 0.03 * H, 0.025 * H, 8), '#cc2f2f'), 0, 0.5 * H, 0));
  } else if (kind === 'mic') {
    g.add(at(p.solid(new THREE.CylinderGeometry(0.014 * H, 0.011 * H, 0.1 * H, 6), p.material('#2a2c36'), 1.15), 0, 0.03 * H, 0));
    g.add(at(p.solid(new THREE.IcosahedronGeometry(0.026 * H, 1), p.material('#9aa0ac'), 1.12), 0, 0.1 * H, 0));
  } else {
    const steel = p.material('#b4b9c2');
    g.add(at(p.solid(new THREE.IcosahedronGeometry(0.06 * H, 1), steel, 1.07), 0, 0.045 * H, 0));
    g.add(at(p.solid(new THREE.ConeGeometry(0.014 * H, 0.07 * H, 6).rotateZ(-1.1), steel, 1.1), 0.075 * H, 0.07 * H, 0));
    g.add(at(p.solid(new THREE.TorusGeometry(0.04 * H, 0.008 * H, 5, 10), steel, 1.1), -0.05 * H, 0.07 * H, 0));
    g.add(at(p.flat(new THREE.CylinderGeometry(0.02 * H, 0.03 * H, 0.025 * H, 8), '#e08a2a'), 0, 0.1 * H, 0));
  }
  return g;
}

/** Builds the jointed low-poly figure for a fighter from its `figure` look. */
export function buildFigure(data: FighterData, f: FigureConfig): FigureRig {
  const p = new Parts();
  const H = data.body.height * 1.08 * PX;
  const bulk = f.bulk ?? 1;
  const thigh = 0.235 * H;
  const shin = 0.235 * H;
  const restHipY = 0.46 * H;
  const torsoH = 0.33 * H;
  const shoulderY = 0.31 * H;
  const shoulderX = 0.14 * H * bulk;
  const hipX = 0.055 * H * bulk;
  const skin = p.material(f.skin);
  const headSkin = new THREE.MeshStandardMaterial({ color: f.skin, roughness: 0.8, flatShading: true });
  p.materials.push(headSkin);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = restHipY;
  root.add(hips);

  // Upper body: a tapered chest under the vest, or the top itself.
  const chestColor = f.vest ?? f.top.color;
  const chest = p.solid(new THREE.CylinderGeometry(0.115 * H * bulk, 0.095 * H * bulk, torsoH, 10).translate(0, torsoH / 2, 0), p.material(chestColor));
  chest.scale.z = 0.75;
  const torso = group(chest);
  hips.add(torso);

  // A kurta hangs over the thighs; a saree skirt reaches the ankles.
  if (f.bottom.skirt) {
    const h = restHipY - 0.03 * H;
    const rB = 0.145 * H * bulk;
    const skirt = p.solid(new THREE.CylinderGeometry(0.1 * H * bulk, rB, h, 12).translate(0, -h / 2, 0), f.stripes ? p.striped(f.bottom.color, f.stripes) : p.material(f.bottom.color));
    skirt.scale.z = 0.85;
    hips.add(skirt);
    if (f.bottom.trim) {
      const hem = p.flat(new THREE.CylinderGeometry(rB * 1.01, rB * 1.01, 0.05 * H, 12, 1, true), f.bottom.trim);
      hem.position.y = -h + 0.025 * H;
      hem.scale.z = 0.85;
      hips.add(hem);
    }
  } else if (f.top.length === 'knee') {
    const h = 0.28 * H;
    const kurta = p.solid(new THREE.CylinderGeometry(0.1 * H * bulk, 0.145 * H * bulk, h, 12).translate(0, -h / 2 + 0.01 * H, 0), p.material(f.top.color));
    kurta.scale.z = 0.82;
    hips.add(kurta);
  }

  if (f.stole) {
    const stole = f.stole;
    torso.add(at(p.flat(new THREE.BoxGeometry(0.07 * H, 0.3 * H, 0.012 * H).translate(0, -0.15 * H, 0), stole), 0, shoulderY, 0.074 * H * bulk));
    for (const x of [-1, 1]) {
      torso.add(at(p.flat(new THREE.BoxGeometry(0.012 * H, 0.3 * H, 0.05 * H).translate(0, -0.15 * H, 0), stole), x * 0.108 * H * bulk, shoulderY, 0.03 * H));
    }
    torso.add(at(p.flat(new THREE.TorusGeometry(0.06 * H, 0.016 * H, 5, 12).rotateX(Math.PI / 2), stole), 0, shoulderY + 0.005 * H, 0));
  }

  if (f.border) {
    const band = at(p.flat(new THREE.BoxGeometry(0.04 * H, 0.38 * H, 0.012 * H), f.border), 0, shoulderY - 0.1 * H, 0.083 * H * bulk);
    band.rotation.z = 0.5;
    torso.add(band);
  }

  let pallu: THREE.Group | null = null;
  if (f.pallu) {
    const clothGeo = new THREE.BoxGeometry(0.22 * H * bulk, 0.5 * H, 0.014 * H).translate(0, -0.25 * H, 0);
    const cloth = f.stripes ? p.solid(clothGeo, p.striped(f.pallu, f.stripes), 0) : p.flat(clothGeo, f.pallu);
    pallu = group(cloth);
    pallu.position.set(0, shoulderY, -0.078 * H * bulk);
    torso.add(pallu);
    if (f.border) {
      for (const x of [-1, 1]) {
        pallu.add(at(p.flat(new THREE.BoxGeometry(0.014 * H, 0.5 * H, 0.018 * H).translate(0, -0.25 * H, 0), f.border), x * 0.103 * H * bulk, 0, 0));
      }
      pallu.add(at(p.flat(new THREE.BoxGeometry(0.22 * H * bulk, 0.03 * H, 0.018 * H), f.border), 0, -0.48 * H, 0));
    }
    // The end of the saree also falls over each shoulder.
    for (const x of [-1, 1]) {
      const side = new THREE.BoxGeometry(0.02 * H, 0.3 * H, 0.17 * H).translate(0, -0.15 * H, 0);
      torso.add(at(f.stripes ? p.solid(side, p.striped(f.pallu, f.stripes), 0) : p.flat(side, f.pallu), x * 0.128 * H * bulk, shoulderY + 0.005 * H, 0));
    }
  }

  // Neck and head.
  const neckY = shoulderY + 0.01 * H;
  torso.add(at(p.solid(new THREE.CylinderGeometry(0.035 * H, 0.04 * H, 0.06 * H, 8), headSkin, 0), 0, shoulderY + 0.015 * H, 0));
  const headR = 0.095 * H;
  const head = group(at(buildHead(p, f, headR, headSkin), 0, headR * 1.05, 0));
  head.position.y = neckY;
  torso.add(head);

  const sleeve = f.top.sleeves ?? f.skin;
  const makeArm = (isFront: boolean): ArmRig => {
    const upper = 0.15 * H;
    const fore = 0.14 * H;
    const shoulder = new THREE.Group();
    shoulder.add(p.solid(new THREE.IcosahedronGeometry(0.044 * H, 1), p.material(sleeve), 1.08));
    shoulder.add(p.solid(limb(0.037 * H, 0.032 * H, upper), p.material(sleeve)));
    const elbow = at(new THREE.Group(), 0, -upper, 0);
    elbow.add(p.solid(limb(0.032 * H, 0.027 * H, fore), p.material(sleeve)));
    elbow.add(at(p.solid(new THREE.IcosahedronGeometry(0.038 * H, 1), skin, 1.1), 0, -fore, 0));
    if (f.bangles) {
      for (const at01 of [0.74, 0.8]) elbow.add(at(p.flat(new THREE.TorusGeometry(0.034 * H, 0.007 * H, 4, 10).rotateX(Math.PI / 2), f.bangles), 0, -fore * at01, 0));
    }
    if (f.watch && isFront) {
      elbow.add(at(p.flat(new THREE.CylinderGeometry(0.036 * H, 0.036 * H, 0.04 * H, 10), f.watch), 0, -fore * 0.9, 0));
      elbow.add(at(p.flat(new THREE.BoxGeometry(0.05 * H, 0.04 * H, 0.016 * H), '#9bb8cc'), 0, -fore * 0.9, 0.04 * H));
      elbow.add(at(p.flat(new THREE.BoxGeometry(0.05 * H, 0.04 * H, 0.016 * H), '#9bb8cc'), 0, -fore * 0.9, -0.04 * H));
    }
    shoulder.add(elbow);
    return { shoulder, elbow, prop: null };
  };
  const makeLeg = (): LegRig => {
    const hip = new THREE.Group();
    const bottom = p.material(f.bottom.color);
    hip.add(p.solid(limb(0.05 * H * bulk, 0.042 * H * bulk, thigh), bottom));
    const knee = at(new THREE.Group(), 0, -thigh, 0);
    knee.add(p.solid(limb(0.042 * H * bulk, 0.033 * H * bulk, shin), bottom));
    const shoe = at(p.solid(new THREE.BoxGeometry(0.064 * H * bulk, 0.038 * H, 0.135 * H).translate(0, -0.019 * H, 0.035 * H), p.material(f.shoes)), 0, -shin, 0);
    knee.add(shoe);
    hip.add(knee);
    return { hip, knee, shoe };
  };
  const front = { arm: makeArm(true), leg: makeLeg() };
  const back = { arm: makeArm(false), leg: makeLeg() };
  torso.add(at(front.arm.shoulder, shoulderX, shoulderY, 0), at(back.arm.shoulder, -shoulderX, shoulderY, 0));
  hips.add(at(front.leg.hip, hipX, 0, 0), at(back.leg.hip, -hipX, 0, 0));

  if (f.prop) {
    const prop = buildProp(p, f.prop, H);
    front.arm.elbow.add(at(prop, 0, -0.14 * H, 0));
    front.arm.prop = prop;
  }

  return { root, hips, torso, head, headSkin, skin: f.skin, front, back, pallu, materials: p.materials, shoulderX, hipX, thigh, shin, restHipY };
}
