import * as THREE from 'three';
import { arenaText } from '../../content/arenas';
import { texts } from '../../content/texts';
import { buildCrowdRows } from '../crowd';
import { bannerTexture, canvasTexture } from '../hallTextures';
import { CENTER_Z } from '../hallLayout';
import type { Arena } from '.';
import { addTrees, keyLight, lawnTexture, skyTexture, stone, tiled } from './kit';

const MASONRY = 0xc4573a;
const WHITEWASH = 0xf1e8d8;
const HAZE = 0xcfe8f2;
const DIAL_R = 6.4;

/** The floor: a white marble disc marked like a sundial face, with an hour tick every 15 degrees. */
const dialTexture = (): THREE.CanvasTexture =>
  canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = '#ece4d2';
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.translate(512, 512);
    ctx.strokeStyle = '#b4532f';
    for (const [r, w] of [[500, 14], [440, 4], [330, 4], [180, 4]] as const) {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 12);
      ctx.lineWidth = i % 2 ? 4 : 10;
      ctx.beginPath();
      ctx.moveTo(i % 2 ? 330 : 180, 0);
      ctx.lineTo(440, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#b4532f';
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
  });

/** A right-angled wedge seen side-on, extruded across the depth. */
function wedge(width: number, height: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

/** A quarter disc standing on its flat edge, extruded to a thin wall. */
function quadrant(radius: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, radius, 0, Math.PI / 2, false);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -thickness / 2);
}

/** The big sundial: a triangular gnomon with a stair up its slope and a small canopy on top, flanked by two quadrant walls. */
function buildSamrat(root: THREE.Group): void {
  const g = new THREE.Group();
  g.position.set(0, 0, -19);
  g.scale.setScalar(0.72);
  const body = stone(MASONRY);
  const white = stone(WHITEWASH);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const W = 6.4;
  const H = 5.0;
  add(wedge(W, H, 2.2), body, 0, 0);
  // Whitewashed stair along the slope.
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const x = -W / 2 + t * W;
    const y = t * H;
    add(new THREE.BoxGeometry(W / steps + 0.02, 0.12, 1.0), white, x, y + 0.02, 0);
  }
  for (const z of [-0.55, 0.55]) {
    const rail = add(new THREE.BoxGeometry(Math.hypot(W, H), 0.12, 0.1), white, 0, H / 2 + 0.12, z);
    rail.rotation.z = Math.atan2(H, W);
  }
  // Canopy on the high end.
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) add(new THREE.CylinderGeometry(0.07, 0.07, 0.85, 6), white, W / 2 - 0.55 + x, H + 0.42, z);
  add(new THREE.BoxGeometry(1.3, 0.16, 1.3), body, W / 2 - 0.55, H + 0.92);
  add(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), white, W / 2 - 0.55, H + 1.0);

  const quad = quadrant(3.6, 0.45);
  for (const side of [-1, 1]) {
    const x = side * (W / 2 + 0.2);
    add(quad, body, x, 0).scale.x = side;
    add(new THREE.TorusGeometry(3.6, 0.07, 4, 28, Math.PI / 2), white, x, 0).scale.x = side;
  }
  root.add(g);
}

/** A cylinder open at the top with a central pillar and radial walls. */
function buildRam(root: THREE.Group, x: number, z: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const body = stone(MASONRY);
  const white = stone(WHITEWASH);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 3.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: MASONRY, roughness: 0.85, side: THREE.DoubleSide, flatShading: true }));
  wall.position.y = 1.6;
  g.add(wall);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.2, 10), white);
  pillar.position.y = 1.6;
  g.add(pillar);
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.14), body);
    spoke.position.set(Math.cos((i * Math.PI) / 4) * 1.15, 3.1, Math.sin((i * Math.PI) / 4) * 1.15);
    spoke.rotation.y = -(i * Math.PI) / 4;
    g.add(spoke);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.08, 4, 32).rotateX(Math.PI / 2), white);
  rim.position.y = 3.2;
  g.add(rim);
  root.add(g);
}

/** A raised round basin with a whitewashed rim: a Jai Prakash bowl. */
function buildBasin(root: THREE.Group, x: number, z: number): void {
  const body = stone(MASONRY);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.9, 28), body);
  wall.position.set(x, 0.45, z);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xa8452b, roughness: 0.9, side: THREE.BackSide }));
  dish.position.set(x, 0.95, z);
  dish.rotation.x = Math.PI;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.1, 4, 36).rotateX(Math.PI / 2), stone(WHITEWASH));
  rim.position.set(x, 0.92, z);
  root.add(wall, dish, rim);
}

/** Jantar Mantar by day: a sundial-face floor, the observatory's big instruments behind, a whitewashed wall and trees, and a crowd of visitors. */
export function buildJantarMantar(): Arena {
  const root = new THREE.Group();

  root.add(new THREE.HemisphereLight(0xdcefff, 0x6b8a4a, 1.7));
  keyLight(root, 0xfff3dc, 3.0, [-5, 10, 7]);

  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(90, 80), new THREE.MeshStandardMaterial({ map: tiled(lawnTexture('#79a84b', '#8dbb5b'), 30, 26), roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, -0.01, -36);
  lawn.receiveShadow = true;
  root.add(lawn);

  const path = new THREE.Mesh(new THREE.PlaneGeometry(22, 40), new THREE.MeshStandardMaterial({ color: 0xc79163, roughness: 1 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.002, -14);
  path.receiveShadow = true;
  root.add(path);

  const dial = new THREE.Mesh(new THREE.CircleGeometry(DIAL_R, 96), new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.5 }));
  dial.rotation.x = -Math.PI / 2;
  dial.position.set(0, 0.006, CENTER_Z);
  dial.receiveShadow = true;
  root.add(dial);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(70, 2.4, 0.5), stone(WHITEWASH));
  wall.position.set(0, 1.2, -30);
  const wallTop = new THREE.Mesh(new THREE.BoxGeometry(70, 0.2, 0.8), stone(MASONRY));
  wallTop.position.set(0, 2.5, -30);
  root.add(wall, wallTop);

  const trees: THREE.Vector3[] = [];
  for (let x = -26; x <= 26; x += 3.4) trees.push(new THREE.Vector3(x + Math.random(), 0, -33 - Math.random() * 3));
  addTrees(root, trees, [0x3f7d3a, 0x4d9145]);

  buildSamrat(root);
  buildRam(root, 9.5, -13);
  buildBasin(root, -9.5, -13);

  const { title, subtitle } = arenaText('jantarmantar').banner;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), new THREE.MeshBasicMaterial({ map: bannerTexture(title, subtitle, '#ffb703', 1024, 225), toneMapped: false }));
  board.position.set(0, 3.0, -29.7);
  root.add(board);

  const crowd = buildCrowdRows(
    root,
    texts.placards,
    [
      { z: -5.2, y: 0, x0: -11, x1: 11 },
      { z: -6.4, y: 0.4, x0: -11, x1: 11 },
    ],
    0xb98b5e,
  );

  let excitement = 0;
  return {
    root,
    background: skyTexture([[0, '#3f8fdc'], [0.12, '#8cc6ee'], [0.2, '#cfe8f2'], [1, '#cfe8f2']]),
    fog: new THREE.Fog(HAZE, 28, 75),
    dealPlacards: crowd.dealPlacards,
    cheer(amount) {
      excitement = Math.min(1, excitement + amount);
    },
    update(t, dt) {
      excitement *= Math.exp(-dt * 1.5);
      crowd.update(t, excitement);
    },
  };
}
