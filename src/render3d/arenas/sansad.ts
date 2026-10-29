import * as THREE from 'three';
import { arenaText } from '../../content/arenas';
import { texts } from '../../content/texts';
import { FACTIONS } from '../../config';
import { buildColonnade } from '../colonnade';
import { buildCrowd } from '../crowd';
import { CENTER_Z, FLOOR_R, WALL_R } from '../hallLayout';
import { bannerTexture, rangoliTexture, wallTexture } from '../hallTextures';
import type { Arena } from '.';
import { keyLight } from './kit';

/** A parliament hall seen from the front: rangoli floor, tiered crowd with placards, a circular colonnade hung with banners. */
export function buildSansad(): Arena {
  const root = new THREE.Group();

  root.add(new THREE.HemisphereLight(0xffe2c0, 0x2a1a26, 1.2));
  keyLight(root, 0xfff1dd, 2.4, [-4, 9, 8]);
  const rim = new THREE.DirectionalLight(0x8fa0ff, 1.0);
  rim.position.set(3, 6, -8);
  root.add(rim);

  const factionColors = Object.values(FACTIONS).map((f) => f.color);
  for (const [x, color] of [
    [-3.2, factionColors[0] ?? '#2b8c8c'],
    [3.2, factionColors[1] ?? '#b5452c'],
  ] as const) {
    const spot = new THREE.SpotLight(color, 60, 16, 0.5, 0.7, 1.4);
    spot.position.set(x, 7, 1.5);
    spot.target.position.set(x * 0.6, 0, -0.5);
    root.add(spot, spot.target);
  }
  for (const x of [-7, 7]) {
    const lamp = new THREE.PointLight(0xffb86b, 70, 18);
    lamp.position.set(x, 5.5, -8);
    root.add(lamp);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x1b1322, roughness: 0.45, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -8;
  floor.receiveShadow = true;
  root.add(floor);

  const rangoli = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_R, 96), new THREE.MeshStandardMaterial({ map: rangoliTexture(), roughness: 0.55, metalness: 0.05 }));
  rangoli.rotation.x = -Math.PI / 2;
  rangoli.position.set(0, 0.003, CENTER_Z);
  rangoli.receiveShadow = true;
  root.add(rangoli);
  const rim2 = new THREE.Mesh(new THREE.RingGeometry(FLOOR_R, FLOOR_R + 0.35, 96), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.8, roughness: 0.35 }));
  rim2.rotation.x = -Math.PI / 2;
  rim2.position.set(0, 0.004, CENTER_Z);
  root.add(rim2);

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(WALL_R, WALL_R, 14, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: wallTexture(), side: THREE.BackSide }),
  );
  wall.position.set(0, 7, CENTER_Z);
  root.add(wall);

  const { title, subtitle } = arenaText('sansad').banner;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), new THREE.MeshBasicMaterial({ map: bannerTexture(title, subtitle, '#e5483f', 1024, 282), toneMapped: false }));
  banner.position.set(0, 9.4, CENTER_Z - WALL_R + 0.3);
  root.add(banner);

  const colonnade = buildColonnade(root, texts.flags);
  const crowd = buildCrowd(root, texts.placards);

  let excitement = 0;
  return {
    root,
    background: new THREE.Color(0x120a14),
    fog: new THREE.Fog(0x120a14, 18, 50),
    dealPlacards: crowd.dealPlacards,
    cheer(amount) {
      excitement = Math.min(1, excitement + amount);
    },
    update(t, dt) {
      excitement *= Math.exp(-dt * 1.5);
      crowd.update(t, excitement);
      colonnade.update(t);
    },
  };
}
