import * as THREE from 'three';
import { canvasTexture } from '../hallTextures';

export const stone = (color: number | string, roughness = 0.85): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });

/** Light that casts the fighters' shadows, with a shadow box sized for the fight plane. */
export function keyLight(root: THREE.Group, color: number, intensity: number, at: [number, number, number]): void {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...at);
  light.target.position.set(0, 0, -1);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -10, right: 10, top: 8, bottom: -4, near: 1, far: 32 });
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  root.add(light, light.target);
}

/** A sky that fills the screen behind the scene: colour stops from the top (0) to the bottom (1). */
export const skyTexture = (stops: readonly (readonly [number, string])[]): THREE.CanvasTexture =>
  canvasTexture(8, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 512);
  });

/** Square paving slabs with thin joints. */
export const pavingTexture = (base: string, joint: string, slabs = 8): THREE.CanvasTexture =>
  canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    const step = 512 / slabs;
    for (let i = 0; i < slabs; i++) {
      for (let j = 0; j < slabs; j++) {
        ctx.fillStyle = (i + j) % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(i * step, j * step, step, step);
      }
    }
    ctx.strokeStyle = joint;
    ctx.lineWidth = 3;
    for (let i = 0; i <= slabs; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, 512);
      ctx.moveTo(0, i * step);
      ctx.lineTo(512, i * step);
      ctx.stroke();
    }
  });

/** Plain ground with a faint mottle, for lawns. */
export const lawnTexture = (base: string, speck: string): THREE.CanvasTexture =>
  canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = speck;
    for (let i = 0; i < 900; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2);
  });

export function tiled(tex: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

/** Low-poly trees (a trunk and two cones) planted at `spots`, as three instanced meshes. */
export function addTrees(root: THREE.Group, spots: readonly THREE.Vector3[], leaves: readonly [number, number] = [0x2f6b3a, 0x3a7d44]): void {
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6), stone(0x4a3322), spots.length);
  const lower = new THREE.InstancedMesh(new THREE.ConeGeometry(1.0, 1.9, 7), stone(leaves[0]), spots.length);
  const upper = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1.5, 7), stone(leaves[1]), spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach((p, i) => {
    const k = 0.9 + (i % 5) * 0.08;
    for (const [m, y] of [[trunks, 0.8], [lower, 2.3], [upper, 3.4]] as const) {
      dummy.position.set(p.x, y * k, p.z);
      dummy.scale.setScalar(k);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
  });
  root.add(trunks, lower, upper);
}
