import * as THREE from 'three';
import type { FighterData } from '../characters/types';
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y } from '../config';
import { hasSvg } from '../rig/svg/atlas';
import type { Projectile } from '../systems/combat/Projectile';
import type { FighterPuppet, ScreenPoint } from '../ui/FighterView';
import { buildArena, type Arena } from './arena';
import { CutoutFighter } from './CutoutFighter';
import { ModelFighter } from './ModelFighter';
import { Projectiles3D } from './Projectiles3D';
import type { Puppet3D } from './Puppet3D';
import { DEG, PX, worldX, worldY } from './space';

export type FighterStyle3D = 'cutout' | 'model';

const ASPECT = GAME_WIDTH / GAME_HEIGHT;
/** Half the view height in game px when the whole arena is framed. */
const FULL_HALF_H = GAME_HEIGHT / 2;
const MIN_HALF_H = 205;
/** Keeps the ground line at the same screen height at every zoom. */
const GROUND_BELOW_CENTRE = (GROUND_Y - GAME_HEIGHT / 2) / FULL_HALF_H;
const HALF_FOV_TAN = Math.tan(14 * DEG);
/** Camera height above the view centre, in view half-heights; looking down shows the floor in perspective. */
const ELEVATION = 0.6;
const FOLLOW_RATE = 4;
/** Extra width around the fighters when zooming in. */
const FRAME_MARGIN = 440;
/** Space kept above the highest fighter for the HUD. */
const HEADROOM = 110;
const MAX_PIXELS = 2.5e6;

/**
 * Three.js arena drawn on its own canvas beneath Phaser's (which stays on top for the HUD). The camera always
 * looks straight down -z, so the fight plane maps affinely to the screen and 2D overlays line up via `project`.
 */
export class Stage3D {
  private static instance: Stage3D | null | undefined;

  /** The shared stage, or null when WebGL is unavailable. */
  static get(): Stage3D | null {
    if (Stage3D.instance === undefined) {
      try {
        Stage3D.instance = new Stage3D();
      } catch (err) {
        console.warn('[3d] WebGL unavailable; falling back to 2D.', err);
        Stage3D.instance = null;
      }
    }
    return Stage3D.instance;
  }

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly arena: Arena;
  private readonly projectiles: Projectiles3D;
  private readonly puppets: Puppet3D[] = [];
  private host: HTMLCanvasElement | null = null;
  private layout = '';
  private view = { x: GAME_WIDTH / 2, halfH: FULL_HALF_H };
  private shakeOffset = { x: 0, y: 0 };
  private shakeMs = 0;
  private shakeIntensity = 0;
  private clock = 0;

  private constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const canvas = this.renderer.domElement;
    canvas.className = 'stage3d';
    canvas.style.display = 'none';
    this.arena = buildArena(this.scene);
    this.projectiles = new Projectiles3D(this.scene);
  }

  /** Shows the stage under Phaser's canvas with the camera reset to the full arena. */
  begin(phaserCanvas: HTMLCanvasElement): void {
    const canvas = this.renderer.domElement;
    if (this.host !== phaserCanvas) {
      phaserCanvas.parentElement!.insertBefore(canvas, phaserCanvas);
      this.host = phaserCanvas;
      this.layout = '';
    }
    canvas.style.display = 'block';
    this.view = { x: GAME_WIDTH / 2, halfH: FULL_HALF_H };
    this.shakeMs = 0;
    this.shakeOffset = { x: 0, y: 0 };
  }

  /** Hides the stage and removes the round's fighters and projectiles. */
  end(): void {
    this.renderer.domElement.style.display = 'none';
    this.projectiles.clear();
    for (const p of this.puppets) p.destroy();
    this.puppets.length = 0;
  }

  /** Cut-out style needs SVG art; fighters without it get a model. */
  addFighter(data: FighterData, style: FighterStyle3D): FighterPuppet {
    const puppet =
      style === 'cutout' && data.svg && hasSvg(data.id)
        ? new CutoutFighter(this.scene, data, this.puppets.length)
        : new ModelFighter(this.scene, data);
    this.puppets.push(puppet);
    return puppet;
  }

  updateProjectiles(list: readonly Projectile[]): void {
    this.projectiles.update(list, this.clock);
  }

  /** Same meaning as Phaser's camera shake: intensity is a fraction of the view size; a running shake wins unless forced. */
  shake(ms: number, intensity: number, force = false): void {
    if (this.shakeMs > 0 && !force) return;
    this.shakeMs = ms;
    this.shakeIntensity = intensity;
  }

  cheer(amount: number): void {
    this.arena.cheer(amount);
  }

  /** Where a point on the fight plane (game px) currently appears on screen, and the scale there. */
  project(gx: number, gy: number): ScreenPoint {
    const zoom = FULL_HALF_H / this.view.halfH;
    const c = this.centre();
    return { x: (gx - c.x) * zoom + GAME_WIDTH / 2, y: (gy - c.y) * zoom + GAME_HEIGHT / 2, zoom };
  }

  /** Frames the fighters (x and head height in game px) and draws a frame. */
  render(focus: readonly { x: number; top: number }[], dtMs: number): void {
    const dt = dtMs / 1000;
    this.clock += dt;
    this.follow(focus, dt);
    this.updateShake(dtMs);
    this.syncLayout();
    this.applyCamera();
    this.arena.update(this.clock, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private centre(): { x: number; y: number } {
    return {
      x: this.view.x + this.shakeOffset.x,
      y: GROUND_Y - GROUND_BELOW_CENTRE * this.view.halfH + this.shakeOffset.y,
    };
  }

  private follow(focus: readonly { x: number; top: number }[], dt: number): void {
    if (focus.length === 0) return;
    const xs = focus.map((f) => f.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const top = Math.min(...focus.map((f) => f.top));
    const fitWidth = (maxX - minX + FRAME_MARGIN) / (2 * ASPECT);
    const fitHeight = (GROUND_Y - top + HEADROOM) / (1 + GROUND_BELOW_CENTRE);
    const halfH = THREE.MathUtils.clamp(Math.max(fitWidth, fitHeight), MIN_HALF_H, FULL_HALF_H);
    const halfW = halfH * ASPECT;
    const x = THREE.MathUtils.clamp((minX + maxX) / 2, halfW, GAME_WIDTH - halfW);
    const k = 1 - Math.exp(-FOLLOW_RATE * dt);
    this.view.halfH += (halfH - this.view.halfH) * k;
    this.view.x += (x - this.view.x) * k;
  }

  private updateShake(dtMs: number): void {
    this.shakeMs -= dtMs;
    if (this.shakeMs <= 0) {
      this.shakeOffset = { x: 0, y: 0 };
      return;
    }
    const zoom = FULL_HALF_H / this.view.halfH;
    this.shakeOffset = {
      x: ((Math.random() * 2 - 1) * this.shakeIntensity * GAME_WIDTH) / zoom,
      y: ((Math.random() * 2 - 1) * this.shakeIntensity * GAME_HEIGHT) / zoom,
    };
  }

  /** Keeps the 3D canvas exactly under Phaser's, which the scale manager letterboxes. */
  private syncLayout(): void {
    const host = this.host;
    if (!host) return;
    const { offsetLeft: x, offsetTop: y, offsetWidth: w, offsetHeight: h } = host;
    const key = `${x},${y},${w},${h},${window.devicePixelRatio}`;
    if (key === this.layout || w === 0 || h === 0) return;
    this.layout = key;
    const style = this.renderer.domElement.style;
    style.left = `${x}px`;
    style.top = `${y}px`;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2, Math.sqrt(MAX_PIXELS / (w * h))));
    this.renderer.setSize(w, h);
  }

  private applyCamera(): void {
    const c = this.centre();
    const cx = worldX(c.x);
    const cy = worldY(c.y);
    const hh = this.view.halfH * PX;
    const hw = hh * ASPECT;
    const dist = hh / HALF_FOV_TAN;
    const camY = cy + ELEVATION * hh;
    const cam = this.camera;
    cam.near = 0.1;
    cam.far = 80;
    cam.position.set(cx, camY, dist);
    cam.updateMatrixWorld();
    // Off-axis frustum: the camera sits above the view centre but keeps looking straight ahead.
    const k = cam.near / dist;
    cam.projectionMatrix.makePerspective(-hw * k, hw * k, (cy + hh - camY) * k, (cy - hh - camY) * k, cam.near, cam.far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
}
