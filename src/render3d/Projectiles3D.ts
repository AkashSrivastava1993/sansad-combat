import * as THREE from 'three';
import type { Projectile } from '../systems/combat/Projectile';
import { shared } from './Puppet3D';
import { PX, worldX, worldY } from './space';

const orb = shared(new THREE.IcosahedronGeometry(0.5, 1));
const box = shared(new THREE.BoxGeometry(1, 1, 1));
const ball = shared(new THREE.SphereGeometry(1, 12, 8));

interface Visual {
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  spin: THREE.Object3D | null;
}

/** Glowing orbs for projectiles and solid stand-ins for summoned helpers. */
export class Projectiles3D {
  private readonly visuals = new Map<Projectile, Visual>();

  constructor(private readonly parent: THREE.Object3D) {}

  update(list: readonly Projectile[], timeSec: number): void {
    const alive = new Set(list);
    for (const [p, vis] of this.visuals) {
      if (!alive.has(p)) this.remove(p, vis);
    }
    for (const p of list) {
      const vis = this.visuals.get(p) ?? this.create(p);
      const { x, y, width, height } = p.hitbox;
      vis.group.position.set(worldX(x + width / 2), worldY(y + height / 2), 0);
      if (vis.spin) vis.spin.rotation.set(timeSec * 3, timeSec * 5 * p.dir, 0);
      if (p.kind === 'helper') for (const m of vis.materials) m.opacity = p.armed ? 1 : 0.35;
    }
  }

  clear(): void {
    for (const [p, vis] of this.visuals) this.remove(p, vis);
  }

  private create(p: Projectile): Visual {
    const color = new THREE.Color(p.color);
    const group = new THREE.Group();
    const { width, height } = p.hitbox;
    const vis: Visual = { group, materials: [], spin: null };
    const mat = (emissive: number): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.4, transparent: true });
      vis.materials.push(m);
      return m;
    };
    const add = (geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };

    if (p.kind === 'helper') {
      add(box, mat(0.15)).scale.set(width * PX, height * PX, width * 0.6 * PX);
      const head = add(ball, mat(0.15));
      head.position.y = (height / 2 + 12) * PX;
      head.scale.setScalar(14 * PX);
    } else {
      const core = add(orb, mat(1.6));
      core.scale.set(width * PX, height * PX, Math.min(width, height) * PX);
      vis.spin = core;
      const halo = new THREE.Mesh(
        ball,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      halo.scale.set(width * 0.8 * PX, height * 0.8 * PX, width * 0.8 * PX);
      group.add(halo);
    }
    this.parent.add(group);
    this.visuals.set(p, vis);
    return vis;
  }

  private remove(p: Projectile, vis: Visual): void {
    this.parent.remove(vis.group);
    vis.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
    });
    this.visuals.delete(p);
  }
}
