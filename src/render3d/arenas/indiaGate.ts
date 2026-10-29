import * as THREE from 'three';
import { arenaText } from '../../content/arenas';
import { texts } from '../../content/texts';
import { buildCrowdRows } from '../crowd';
import { bannerTexture } from '../hallTextures';
import type { Arena } from '.';
import { addTrees, keyLight, lawnTexture, pavingTexture, skyTexture, stone, tiled } from './kit';

const SANDSTONE = 0xb06f48;
const SANDSTONE_LIGHT = 0xc98a5e;
const GATE_Z = -30;
const HAZE = 0xf2a36e;

/** The arch: a block with an arched opening, extruded front to back. */
function archBody(): THREE.BufferGeometry {
  const w = 2.7;
  const h = 5.2;
  const hole = 1.3;
  const springing = 2.6;
  const shape = new THREE.Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h);
  shape.lineTo(-w, h);
  shape.closePath();
  const opening = new THREE.Path();
  opening.moveTo(-hole, 0);
  opening.lineTo(-hole, springing);
  opening.absarc(0, springing, hole, Math.PI, 0, true);
  opening.lineTo(hole, 0);
  opening.closePath();
  shape.holes.push(opening);
  return new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -0.95);
}

function buildGate(root: THREE.Group): { update(t: number): void } {
  const gate = new THREE.Group();
  gate.position.set(0, 0, GATE_Z);
  gate.scale.setScalar(0.85);
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    gate.add(m);
    return m;
  };
  const body = stone(SANDSTONE);
  const trim = stone(SANDSTONE_LIGHT);

  [[8.2, 3.8], [7.5, 3.3], [6.8, 2.8]].forEach(([w, d], i) => mesh(new THREE.BoxGeometry(w!, 0.25, d!), trim, 0, 0.125 + i * 0.25, 0));
  mesh(archBody(), body, 0, 0.75, 0);
  mesh(new THREE.BoxGeometry(6.0, 0.28, 2.3), trim, 0, 0.75 + 5.2 + 0.14, 0);
  mesh(new THREE.BoxGeometry(5.0, 0.22, 1.9), body, 0, 0.75 + 5.2 + 0.39, 0);
  mesh(new THREE.CylinderGeometry(0.95, 0.7, 0.22, 20), trim, 0, 0.75 + 5.2 + 0.61, 0);

  const { title, subtitle } = arenaText('indiagate').banner;
  const plaque = mesh(new THREE.PlaneGeometry(4.4, 1.0), new THREE.MeshBasicMaterial({ map: bannerTexture(title, subtitle, '#ffb703', 1024, 232), toneMapped: false }), 0, 0.75 + 4.95, 0.97);
  plaque.renderOrder = 1;

  // The eternal flame under the arch: a marble plinth with a rifle and helmet, and four flames.
  const marble = stone(0xd8d4c8, 0.5);
  mesh(new THREE.BoxGeometry(1.1, 0.45, 1.1), marble, 0, 0.75 + 0.225, 0);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), stone(0x20222a), 0, 0.75 + 0.9, 0);
  mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), stone(0x2d3a2a), 0, 0.75 + 1.35, 0);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a2e, toneMapped: false });
  const flames = [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([x, z]) => mesh(new THREE.ConeGeometry(0.1, 0.34, 6), flameMat, x!, 0.75 + 0.62, z!));
  const glow = new THREE.PointLight(0xff8a2a, 5, 7);
  glow.position.set(0, 0.75 + 0.9, 0.9);
  gate.add(glow);

  root.add(gate);
  return {
    update(t) {
      flames.forEach((f, i) => f.scale.set(1, 0.8 + 0.3 * Math.sin(t * 9 + i * 1.7), 1));
      glow.intensity = 5 + Math.sin(t * 11) * 0.8;
    },
  };
}

/** Rows of trees and lamp posts down both sides of the avenue leading to the gate. */
function addAvenue(root: THREE.Group): void {
  const spots: THREE.Vector3[] = [];
  for (let z = -14; z > -66; z -= 5) for (const x of [-11, -8, 8, 11]) spots.push(new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, 0, z));
  addTrees(root, spots);

  const posts: THREE.Vector3[] = [];
  for (let z = -13; z > -64; z -= 6) for (const x of [-3.8, 3.8]) posts.push(new THREE.Vector3(x, 0, z));
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6), stone(0x2a2a30), posts.length);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1c2, toneMapped: false }), posts.length);
  const dummy = new THREE.Object3D();
  posts.forEach((p, i) => {
    dummy.scale.setScalar(1);
    dummy.position.set(p.x, 1.6, p.z);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(p.x, 3.3, p.z);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  root.add(poles, bulbs);
}

/** India Gate at dusk: paved plaza in front, the avenue running back between lawns and canals, and a crowd of visitors. */
export function buildIndiaGate(): Arena {
  const root = new THREE.Group();

  root.add(new THREE.HemisphereLight(0xffd7a8, 0x3a3a4a, 1.5));
  keyLight(root, 0xffc58a, 2.6, [-6, 7, 8]);
  const rim = new THREE.DirectionalLight(0x9aa8ff, 0.8);
  rim.position.set(4, 5, -8);
  root.add(rim);

  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(90, 80), new THREE.MeshStandardMaterial({ map: tiled(lawnTexture('#3d7a3f', '#4f9150'), 30, 26), roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, -0.01, -36);
  lawn.receiveShadow = true;
  root.add(lawn);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 70), new THREE.MeshStandardMaterial({ map: tiled(pavingTexture('#8c6b5a', '#5a4438', 4), 2, 20), roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.002, -42);
  road.receiveShadow = true;
  root.add(road);
  for (const x of [-5.2, 5.2]) {
    const canal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 70), new THREE.MeshStandardMaterial({ color: 0x4a90c2, roughness: 0.2, metalness: 0.3 }));
    canal.rotation.x = -Math.PI / 2;
    canal.position.set(x, 0.004, -42);
    root.add(canal);
  }

  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshStandardMaterial({ map: tiled(pavingTexture('#c9a27e', '#8a6a4e', 8), 4, 2), roughness: 0.75 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.006, -1.5);
  plaza.receiveShadow = true;
  root.add(plaza);

  addAvenue(root);
  const gate = buildGate(root);
  const crowd = buildCrowdRows(
    root,
    texts.placards,
    [
      { z: -5.2, y: 0, x0: -11, x1: 11 },
      { z: -6.4, y: 0.4, x0: -11, x1: 11 },
    ],
    0x8a6a4e,
  );

  let excitement = 0;
  return {
    root,
    background: skyTexture([[0, '#1f2a5e'], [0.12, '#6b4a94'], [0.2, '#f08a5d'], [0.27, '#f2a36e'], [1, '#f2a36e']]),
    fog: new THREE.Fog(HAZE, 26, 72),
    dealPlacards: crowd.dealPlacards,
    cheer(amount) {
      excitement = Math.min(1, excitement + amount);
    },
    update(t, dt) {
      excitement *= Math.exp(-dt * 1.5);
      crowd.update(t, excitement);
      gate.update(t);
    },
  };
}
