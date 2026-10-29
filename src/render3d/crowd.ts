import * as THREE from 'three';
import { ARC_HALF, CENTER_Z, onCircle } from './hallLayout';
import { placardTexture } from './hallTextures';

const TIERS = 4;
const TIER_R0 = 8.6;
const TIER_GAP = 0.9;
const TIER_STEP_H = 0.45;
const SPACING = 0.62;
const BODY_H = 0.5;
const SHIRTS = ['#f4efe1', '#e8dcc0', '#2b8c8c', '#b5452c', '#ffd24a', '#5a6490', '#f4f4f4', '#3fa7e5'];
const SKINS = ['#8a6048', '#c68e66', '#5b3a2a', '#d9a57b'];

export interface PlacardSpec {
  text: string;
  bg: string;
  fg: string;
}

/** How many different slogans are on show at once. */
const SHOWN = 12;

export interface Crowd {
  update(t: number, excitement: number): void;
  /** Hands out a fresh random selection of slogans from the pool. */
  dealPlacards(): void;
}

interface Seat {
  x: number;
  y: number;
  z: number;
  theta: number;
  phase: number;
  speed: number;
}

interface Held {
  seat: Seat;
  lift: number;
}

/** Stepped arcs of seating round the back of the floor, for the crowd to stand on. */
function addTiers(parent: THREE.Object3D): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.85 });
  for (let t = 0; t < TIERS; t++) {
    const outer = TIER_R0 + t * TIER_GAP + TIER_GAP / 2;
    const inner = outer - TIER_GAP;
    const a0 = Math.PI / 2 - ARC_HALF;
    const a1 = Math.PI / 2 + ARC_HALF;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, a0, a1, false);
    shape.absarc(0, 0, inner, a1, a0, true);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: (t + 1) * TIER_STEP_H, bevelEnabled: false, curveSegments: 48 });
    geo.rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(geo, mat);
    slab.position.z = CENTER_Z;
    slab.receiveShadow = true;
    parent.add(slab);
  }
}

/** Straight rows of standing supporters (outdoor arenas); the front row comes first. */
interface CrowdRow {
  z: number;
  /** Height of the ground the row stands on. */
  y: number;
  x0: number;
  x1: number;
}

/** Low-poly supporters on the tiers, with placards held up by some. Everything is instanced. */
export function buildCrowd(parent: THREE.Object3D, placards: readonly PlacardSpec[]): Crowd {
  addTiers(parent);

  const tierSeats: Seat[][] = [];
  for (let t = 0; t < TIERS; t++) {
    const r = TIER_R0 + t * TIER_GAP;
    const dTheta = SPACING / r;
    const row: Seat[] = [];
    for (let theta = -ARC_HALF + dTheta / 2; theta < ARC_HALF; theta += dTheta) {
      const at = theta + (t % 2) * dTheta * 0.5;
      const { x, z } = onCircle(r, at);
      row.push({ x, z, theta: at, y: (t + 1) * TIER_STEP_H, phase: Math.random() * Math.PI * 2, speed: 3 + Math.random() * 3 });
    }
    tierSeats.push(row);
  }
  return populate(parent, tierSeats, placards);
}

/** The same crowd standing in straight rows facing the camera, each row on its own raised strip. */
export function buildCrowdRows(parent: THREE.Object3D, placards: readonly PlacardSpec[], rows: readonly CrowdRow[], strip: number): Crowd {
  const stripMat = new THREE.MeshStandardMaterial({ color: strip, roughness: 0.9 });
  const tierSeats = rows.map((row, t) => {
    if (row.y > 0) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(row.x1 - row.x0 + 1, row.y, 0.9), stripMat);
      slab.position.set((row.x0 + row.x1) / 2, row.y / 2, row.z);
      slab.receiveShadow = true;
      parent.add(slab);
    }
    const seats: Seat[] = [];
    for (let x = row.x0 + (t % 2) * SPACING * 0.5; x <= row.x1; x += SPACING) {
      seats.push({ x: x + (Math.random() - 0.5) * 0.12, z: row.z + (Math.random() - 0.5) * 0.2, theta: 0, y: row.y, phase: Math.random() * Math.PI * 2, speed: 3 + Math.random() * 3 });
    }
    return seats;
  });
  return populate(parent, tierSeats, placards);
}

function populate(parent: THREE.Object3D, tierSeats: Seat[][], pool: readonly PlacardSpec[]): Crowd {
  const seats = tierSeats.flat();

  const bodies = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.24, 0.28, BODY_H, 7),
    new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    seats.length,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.2, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }),
    seats.length,
  );
  const color = new THREE.Color();
  seats.forEach((_, i) => {
    bodies.setColorAt(i, color.set(SHIRTS[(i * 7 + (i >> 3)) % SHIRTS.length]!).multiplyScalar(0.6));
    heads.setColorAt(i, color.set(SKINS[(i * 5) % SKINS.length]!).multiplyScalar(0.8));
  });
  parent.add(bodies, heads);

  // Every few seats in the front three tiers holds a placard; the slogans are dealt out round-robin.
  const slots = Math.min(SHOWN, pool.length);
  const held: Held[][] = Array.from({ length: slots }, () => []);
  let next = 0;
  for (let t = 0; t < Math.min(3, tierSeats.length); t++) {
    const step = 6 + t;
    for (let i = (t * 3) % step; i < tierSeats[t]!.length; i += step) {
      held[next % slots]!.push({ seat: tierSeats[t]![i]!, lift: 1.9 + (i % 3) * 0.12 });
      next++;
    }
  }
  const boards = held.map((_, i) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.5, 0.7),
      new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide }),
      Math.max(1, held[i]!.length),
    );
    mesh.count = held[i]!.length;
    parent.add(mesh);
    return mesh;
  });
  const stickCount = held.reduce((n, h) => n + h.length, 0);
  const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 }), Math.max(1, stickCount));
  sticks.count = stickCount;
  parent.add(sticks);

  const dealPlacards = (): void => {
    const order = pool.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    boards.forEach((board, i) => {
      const spec = pool[order[i]!]!;
      const material = board.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.map = placardTexture(spec.text, spec.bg, spec.fg);
      material.needsUpdate = true;
    });
  };
  dealPlacards();

  const dummy = new THREE.Object3D();
  return {
    dealPlacards,
    update(t, excitement) {
      const amp = 0.04 + excitement * 0.22;
      const hops = seats.map((s) => Math.max(0, Math.sin(t * s.speed * (1 + excitement) + s.phase)) * amp);
      seats.forEach((s, i) => {
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(s.x, s.y + BODY_H / 2 + hops[i]!, s.z);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.y = s.y + BODY_H + 0.17 + hops[i]!;
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      });
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;

      let stick = 0;
      held.forEach((list, p) => {
        list.forEach((h, i) => {
          const s = h.seat;
          const hop = Math.max(0, Math.sin(t * 4 * (1 + excitement) + s.phase)) * (0.03 + excitement * 0.2);
          const sway = Math.sin(t * 1.4 + s.phase) * 0.05;
          // The board sits a little in front of the holder, facing the middle of the floor.
          dummy.rotation.set(0, -s.theta, sway);
          dummy.position.set(s.x - Math.sin(s.theta) * 0.35, s.y + h.lift + hop, s.z + Math.cos(s.theta) * 0.35);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          boards[p]!.setMatrixAt(i, dummy.matrix);
          const bottom = s.y + BODY_H + 0.1 + hop;
          const top = s.y + h.lift + hop - 0.35; // Stops at the board's lower edge so the slogan stays clear.
          dummy.scale.set(1, top - bottom, 1);
          dummy.position.y = (top + bottom) / 2;
          dummy.rotation.set(0, 0, sway);
          dummy.updateMatrix();
          sticks.setMatrixAt(stick++, dummy.matrix);
        });
        boards[p]!.instanceMatrix.needsUpdate = true;
      });
      sticks.instanceMatrix.needsUpdate = true;
    },
  };
}
