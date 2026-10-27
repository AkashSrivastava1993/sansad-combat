import * as THREE from 'three';
import type { FighterData } from '../characters/types';
import type { RigFrame } from '../rig/animator';
import type { FighterPuppet } from '../ui/FighterView';
import { DEG, PX, worldX, worldY } from './space';

let blobTexture: THREE.Texture | null = null;

function contactShadow(): THREE.Texture {
  if (blobTexture) return blobTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobTexture = new THREE.CanvasTexture(canvas);
  return blobTexture;
}

/** Geometry reused by every puppet; never disposed. */
export function shared<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.shared = true;
  return geo;
}

const blobGeometry = shared(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

/** A fighter in the 3D scene whose `root` has its origin at the feet and faces +x. */
export abstract class Puppet3D implements FighterPuppet {
  protected readonly root = new THREE.Group();
  private readonly blob: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private alpha = 1;

  constructor(
    private readonly parent: THREE.Object3D,
    protected readonly data: FighterData,
  ) {
    this.blob = new THREE.Mesh(
      blobGeometry,
      new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false }),
    );
    this.blob.renderOrder = -1;
    parent.add(this.root, this.blob);
  }

  abstract render(frame: RigFrame): void;
  protected abstract setOpacity(alpha: number): void;

  place(x: number, y: number, facing: 1 | -1, angle: number, alpha: number, spin = 1): void {
    const wy = worldY(y);
    this.root.position.set(worldX(x), wy, 0);
    this.root.scale.x = facing * spin;
    this.root.rotation.set(0, 0, -angle * DEG);

    // The contact shadow shrinks and fades as the fighter leaves the floor.
    const k = 1 / (1 + Math.max(0, wy) * 1.5);
    const w = this.data.body.width * PX * 1.6 * k;
    this.blob.position.set(worldX(x), 0.004, 0);
    this.blob.scale.set(w, 1, w * 0.45);
    this.blob.material.opacity = 0.7 * k * alpha;

    if (alpha !== this.alpha) {
      this.alpha = alpha;
      this.setOpacity(alpha);
    }
  }

  destroy(): void {
    this.parent.remove(this.root, this.blob);
    this.blob.material.dispose();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
      for (const m of [mesh.material, mesh.customDepthMaterial].flat()) m?.dispose();
    });
  }
}
