import * as THREE from 'three';
import { FACTIONS, FONT_FAMILY } from '../config';

export interface Arena {
  update(timeSec: number, dt: number): void;
  /** Gets the crowd jumping; decays on its own. */
  cheer(amount: number): void;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const matTexture = (): THREE.CanvasTexture =>
  canvasTexture(1024, 400, (ctx) => {
    ctx.fillStyle = '#232a44';
    ctx.fillRect(0, 0, 1024, 400);
    ctx.fillStyle = '#323c62';
    for (let x = 0; x <= 1024; x += 64) ctx.fillRect(x - 1, 0, 2, 400);
    ctx.strokeStyle = '#8fa0ff';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 1008, 384);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(512, 200, 150, 120, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(229,72,63,0.85)';
    ctx.font = `bold 64px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', 512, 204);
  });

const backdropTexture = (): THREE.CanvasTexture =>
  canvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#07080d');
    g.addColorStop(0.6, '#1c1638');
    g.addColorStop(1, '#3a1f4d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  });

const bannerTexture = (text: string, sub: string, color: string, w: number, h: number): THREE.CanvasTexture =>
  canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#10131f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = Math.round(h * 0.42);
    ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    while (ctx.measureText(text).width > w * 0.88 && size > 10) ctx.font = `bold ${(size -= 2)}px ${FONT_FAMILY}`;
    ctx.fillText(text, w / 2, h * (sub ? 0.42 : 0.5));
    if (sub) {
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(h * 0.16)}px ${FONT_FAMILY}`;
      ctx.fillText(sub, w / 2, h * 0.78);
    }
  });

const CROWD_ROWS = 3;
const CROWD_SPACING = 0.62;
const CROWD_HALF_WIDTH = 13;
const CROWD_FRONT_Z = -7.2;
const ROW_DEPTH = 0.85;

/** A night-time rally stage: lit floor, bleachers of cheering supporters, banners and light rigs. */
export function buildArena(scene: THREE.Scene): Arena {
  scene.background = new THREE.Color(0x07080d);
  scene.fog = new THREE.Fog(0x0b0d12, 13, 32);

  scene.add(new THREE.HemisphereLight(0xa8b8ff, 0x2a1a26, 1.1));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(-4, 9, 8);
  key.target.position.set(0, 0, -1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 8, bottom: -4, near: 1, far: 32 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x8fa0ff, 1.2);
  rim.position.set(3, 6, -8);
  scene.add(rim);

  const factionColors = Object.values(FACTIONS).map((f) => f.color);
  const left = factionColors[0] ?? '#2b8c8c';
  const right = factionColors[1] ?? '#b5452c';
  for (const [x, color] of [
    [-3.2, left],
    [3.2, right],
  ] as const) {
    const spot = new THREE.SpotLight(color, 60, 16, 0.5, 0.7, 1.4);
    spot.position.set(x, 7, 1.5);
    spot.target.position.set(x * 0.6, 0, -0.5);
    scene.add(spot, spot.target);
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 30),
    new THREE.MeshStandardMaterial({ color: 0x151a2c, roughness: 0.32, metalness: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -6;
  floor.receiveShadow = true;
  scene.add(floor);

  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 4.7),
    new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.55, metalness: 0.1 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.002, -0.7);
  ring.receiveShadow = true;
  scene.add(ring);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 22),
    new THREE.MeshBasicMaterial({ map: backdropTexture(), fog: false }),
  );
  backdrop.position.set(0, 8, -14);
  scene.add(backdrop);

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.9),
    new THREE.MeshBasicMaterial({ map: bannerTexture('SANSAD COMBAT', 'LIVE FROM THE RALLY GROUND', '#e5483f', 1024, 278), toneMapped: false }),
  );
  banner.position.set(0, 3.5, -11);
  scene.add(banner);

  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d29, roughness: 0.8 });
  for (let r = 0; r < CROWD_ROWS; r++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(CROWD_HALF_WIDTH * 2 + 2, 0.4 + r * 0.45, 0.85), dark);
    step.position.set(0, (0.4 + r * 0.45) / 2, CROWD_FRONT_Z - r * ROW_DEPTH);
    step.receiveShadow = true;
    scene.add(step);
  }
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(CROWD_HALF_WIDTH * 2 + 2, 0.8, 0.15), dark);
  barrier.position.set(0, 0.4, CROWD_FRONT_Z + 0.8);
  barrier.receiveShadow = true;
  scene.add(barrier);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xff3366, toneMapped: false });
  const led = new THREE.Mesh(new THREE.BoxGeometry(CROWD_HALF_WIDTH * 2 + 2, 0.08, 0.02), ledMat);
  led.position.set(0, 0.7, CROWD_FRONT_Z + 0.88);
  scene.add(led);

  // Supporters: instanced so a few hundred cost one draw call.
  const perRow = Math.floor((CROWD_HALF_WIDTH * 2) / CROWD_SPACING);
  const count = perRow * CROWD_ROWS;
  const crowd = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.2, 0.42, 3, 8),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    count,
  );
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a6048, roughness: 0.8 }), count);
  const shirts = ['#2b8c8c', '#b5452c', '#e8dcc0', '#ffd24a', '#5a6490', '#f4f4f4', '#3fa7e5', '#c0392b'];
  const seats: { x: number; y: number; z: number; phase: number; speed: number }[] = [];
  const color = new THREE.Color();
  for (let r = 0; r < CROWD_ROWS; r++) {
    for (let i = 0; i < perRow; i++) {
      const idx = seats.length;
      seats.push({
        x: -CROWD_HALF_WIDTH + i * CROWD_SPACING + (r % 2) * 0.3 + (Math.random() - 0.5) * 0.12,
        y: 0.4 + r * 0.45 + 0.42,
        z: CROWD_FRONT_Z - r * ROW_DEPTH,
        phase: Math.random() * Math.PI * 2,
        speed: 3 + Math.random() * 3,
      });
      crowd.setColorAt(idx, color.set(shirts[(i * 7 + r * 3) % shirts.length]!).multiplyScalar(0.35));
    }
  }
  crowd.castShadow = heads.castShadow = true;
  scene.add(crowd, heads);

  const truss = new THREE.Mesh(new THREE.BoxGeometry(22, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x3a3f52, metalness: 0.7, roughness: 0.35 }));
  truss.position.set(0, 6.4, -3);
  scene.add(truss);
  const beamColors = [0xffffff, 0x2b8c8c, 0xff3399, 0xb5452c, 0xffd24a, 0xffffff];
  const beams = beamColors.map((c, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(-8 + i * 3.2, 6.3, -3);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 7, 24, 1, true).translate(0, -3.5, 0),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    pivot.add(beam);
    scene.add(pivot);
    return pivot;
  });

  for (const x of [-6.8, 6.8]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 1.2), dark);
    stack.position.set(x, 1.5, -4.6);
    stack.castShadow = stack.receiveShadow = true;
    scene.add(stack);
    for (const y of [0.8, 2.1]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.5 }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(x, y, -3.98);
      scene.add(cone);
    }
  }

  const m = new THREE.Matrix4();
  let excitement = 0;
  return {
    cheer(amount) {
      excitement = Math.min(1, excitement + amount);
    },
    update(t, dt) {
      excitement *= Math.exp(-dt * 1.5);
      const amp = 0.04 + excitement * 0.22;
      seats.forEach((s, i) => {
        const hop = Math.max(0, Math.sin(t * s.speed * (1 + excitement) + s.phase)) * amp;
        m.makeTranslation(s.x, s.y + hop, s.z);
        crowd.setMatrixAt(i, m);
        m.makeTranslation(s.x, s.y + hop + 0.42, s.z);
        heads.setMatrixAt(i, m);
      });
      crowd.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      beams.forEach((b, i) => {
        b.rotation.z = Math.sin(t * 0.6 + i * 1.3) * 0.35;
        b.rotation.x = Math.cos(t * 0.45 + i) * 0.2 + 0.15;
      });
      ledMat.color.setHSL((t * 0.08) % 1, 0.9, 0.55);
    },
  };
}
