import * as THREE from 'three';
import { ARC_HALF, COLONNADE_R, COLUMN_STEP, onCircle } from './hallLayout';
import { flagTexture } from './hallTextures';

const BASE_H = 0.3;
const SHAFT_H = 5.6;
const CAPITAL_H = 0.45;
const FRIEZE_H = 0.8;
const TOP = BASE_H + SHAFT_H + CAPITAL_H;
const FLAG_W = 1.1;
const FLAG_H = 3;
const FLAG_COLS = 6;
const FLAG_ROWS = 14;

const stone = (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

/** Instanced columns, a frieze and cornice running round the arc, and striped banners hanging between columns. */
export function buildColonnade(parent: THREE.Object3D, palettes: readonly (readonly string[])[]): { update(t: number): void } {
  const steps = Math.round((ARC_HALF * 2) / COLUMN_STEP);
  const angles = Array.from({ length: steps + 1 }, (_, i) => -ARC_HALF + i * COLUMN_STEP);
  const dummy = new THREE.Object3D();

  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.4, SHAFT_H, 16), stone(0xd9c8a6), angles.length);
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(1, BASE_H, 1), stone(0xb9a784), angles.length);
  const capitals = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, CAPITAL_H, 1.1), stone(0xe6d7b4), angles.length);
  angles.forEach((theta, i) => {
    const { x, z } = onCircle(COLONNADE_R, theta);
    dummy.rotation.set(0, -theta, 0);
    dummy.position.set(x, BASE_H + SHAFT_H / 2, z);
    dummy.updateMatrix();
    shafts.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, BASE_H / 2, z);
    dummy.updateMatrix();
    bases.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, BASE_H + SHAFT_H + CAPITAL_H / 2, z);
    dummy.updateMatrix();
    capitals.setMatrixAt(i, dummy.matrix);
  });

  const gaps = angles.length - 1;
  const chord = 2 * COLONNADE_R * Math.sin(COLUMN_STEP / 2);
  const mid = COLONNADE_R * Math.cos(COLUMN_STEP / 2);
  const frieze = new THREE.InstancedMesh(new THREE.BoxGeometry(1, FRIEZE_H, 1), stone(0xc9b891), gaps);
  const cornice = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 1.3), stone(0xa8966f), gaps);
  for (let i = 0; i < gaps; i++) {
    const theta = (angles[i]! + angles[i + 1]!) / 2;
    const { x, z } = onCircle(mid, theta);
    dummy.rotation.set(0, -theta, 0);
    dummy.position.set(x, TOP + FRIEZE_H / 2, z);
    dummy.scale.set(chord + 0.12, 1, 1.05);
    dummy.updateMatrix();
    frieze.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, TOP + FRIEZE_H + 0.08, z);
    dummy.scale.set(chord + 0.2, 1, 1);
    dummy.updateMatrix();
    cornice.setMatrixAt(i, dummy.matrix);
  }
  parent.add(shafts, bases, capitals, frieze, cornice);

  // Banners hang inside every second gap, waving a little.
  const textures = palettes.map((p) => flagTexture(p));
  const flags: { geo: THREE.PlaneGeometry; rest: Float32Array; phase: number }[] = [];
  for (let i = 0; i < gaps; i += 2) {
    const theta = (angles[i]! + angles[i + 1]!) / 2;
    const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, FLAG_COLS, FLAG_ROWS).translate(0, -FLAG_H / 2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: textures[(i / 2) % textures.length], side: THREE.DoubleSide, roughness: 0.9 }));
    const { x, z } = onCircle(COLONNADE_R - 0.4, theta);
    mesh.position.set(x, TOP - 0.02, z);
    mesh.rotation.y = -theta;
    parent.add(mesh);
    flags.push({ geo, rest: Float32Array.from(geo.attributes.position!.array), phase: i * 0.9 });
  }

  return {
    update(t) {
      for (const f of flags) {
        const pos = f.geo.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) {
          const y = f.rest[v * 3 + 1]!;
          const hang = -y / FLAG_H;
          pos.setZ(v, Math.sin(-y * 2.6 - t * 2.2 + f.phase + f.rest[v * 3]! * 2) * 0.09 * hang);
        }
        pos.needsUpdate = true;
        f.geo.computeVertexNormals();
      }
    },
  };
}

