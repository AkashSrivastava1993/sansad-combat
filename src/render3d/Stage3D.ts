import * as THREE from 'three';
import type { FighterData } from '../core/characters/types';
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y } from '../config';
import { type FighterSnapshot, type MatchState, windingUp } from '../core/match/state';
import type { FightRenderer } from '../renderers/FightRenderer';
import type { FighterPuppet, ScreenPoint } from '../ui/FighterView';
import { DEFAULT_ARENA, type ArenaId } from '../content/arenas';
import { buildArena, type Arena } from './arenas';
import { CutoutFighter } from './CutoutFighter';
import { FigureFighter } from './FigureFighter';
import { ModelFighter } from './ModelFighter';
import { Projectiles3D } from './Projectiles3D';
import type { Puppet3D } from './Puppet3D';
import { DEG, PX, worldX, worldY } from './space';

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
/** View half-height in game px when the camera pushes in on a special being wound up. */
const CUTSCENE_HALF_H = 165;
/** How quickly the cutscene shot comes in and goes out, per second. */
const CUTSCENE_IN = 7;
const CUTSCENE_OUT = 2.5;
/** The shot sits this far ahead of the caster, towards their target. */
const CUTSCENE_LEAD = 60;
/** Extra width around the fighters when zooming in. */
const FRAME_MARGIN = 440;
/** Space kept above the highest fighter for the HUD. */
const HEADROOM = 110;
const MAX_PIXELS = 2.5e6;

/**
 * Three.js arena drawn on its own canvas beneath Phaser's (which stays on top for the HUD). The camera always
 * looks straight down -z, so the fight plane maps affinely to the screen and 2D overlays line up via `project`.
 */
export class Stage3D implements FightRenderer {
  readonly kind = 'three';

  private static instance: Stage3D | null | undefined;

  /** The shared stage, or null when WebGL is unavailable. */
  static get(): Stage3D | null {
    if (Stage3D.instance === undefined) {
      try {
        Stage3D.instance = new Stage3D();
      } catch (err) {
        console.warn('[3d] WebGL unavailable.', err);
        Stage3D.instance = null;
      }
    }
    return Stage3D.instance;
  }

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private arena!: Arena;
  private readonly arenas = new Map<ArenaId, Arena>();
  private readonly projectiles: Projectiles3D;
  private readonly puppets: Puppet3D[] = [];
  private host: HTMLCanvasElement | null = null;
  private layout = '';
  /** Free space around the Phaser canvas as fractions of its size; the frustum widens by the same amount. */
  private pad = { l: 0, r: 0, t: 0, b: 0 };
  private view = { x: GAME_WIDTH / 2, halfH: FULL_HALF_H };
  private shakeOffset = { x: 0, y: 0 };
  private shakeMs = 0;
  private shakeIntensity = 0;
  private clock = 0;
  /** 0 = normal framing, 1 = fully pushed in on the caster. */
  private cutscene = 0;
  private shotX = GAME_WIDTH / 2;

  private constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const canvas = this.renderer.domElement;
    canvas.className = 'stage3d';
    canvas.style.display = 'none';
    this.useArena(DEFAULT_ARENA);
    this.projectiles = new Projectiles3D(this.scene);
  }

  /** Shows the stage under Phaser's canvas, in the given arena, with the camera reset to the full arena. */
  begin(phaserCanvas: HTMLCanvasElement, arena: ArenaId = DEFAULT_ARENA): void {
    this.useArena(arena);
    this.arena.dealPlacards();
    const canvas = this.renderer.domElement;
    if (this.host !== phaserCanvas) {
      // The stage fills the whole page box, behind the (letterboxed) Phaser canvas.
      const page = phaserCanvas.closest('#game') ?? phaserCanvas.parentElement!;
      page.insertBefore(canvas, page.firstChild);
      this.host = phaserCanvas;
      this.layout = '';
    }
    canvas.style.display = 'block';
    this.view = { x: GAME_WIDTH / 2, halfH: FULL_HALF_H };
    this.shakeMs = 0;
    this.shakeOffset = { x: 0, y: 0 };
    this.cutscene = 0;
  }

  /** Builds an arena the first time it is needed and shows only that one. */
  private useArena(id: ArenaId): void {
    let arena = this.arenas.get(id);
    if (!arena) {
      arena = buildArena(id);
      this.arenas.set(id, arena);
      this.scene.add(arena.root);
    }
    for (const other of this.arenas.values()) other.root.visible = other === arena;
    this.arena = arena;
    this.scene.background = arena.background;
    this.scene.fog = arena.fog;
  }

  /** Hides the stage and removes the round's fighters and projectiles. */
  end(): void {
    this.renderer.domElement.style.display = 'none';
    this.projectiles.clear();
    for (const p of this.puppets) p.destroy();
    this.puppets.length = 0;
  }

  /** Adds a fighter drawn from their GLB model, else their low-poly figure, else their layered SVG art. */
  addFighter(data: FighterData): FighterPuppet {
    const order = this.puppets.length;
    const puppet = data.model
      ? new ModelFighter(this.scene, data, order, data.model)
      : data.figure
        ? new FigureFighter(this.scene, data, order, data.figure)
        : new CutoutFighter(this.scene, data, order);
    this.puppets.push(puppet);
    return puppet;
  }

  /** Draws one frame of `state`, with the camera following the fighters. */
  draw(state: MatchState, deltaMs: number): void {
    this.projectiles.update(state.projectiles, this.clock);
    this.render(
      state.fighters.map((f) => ({ x: f.x, top: f.y - f.data.body.height })),
      deltaMs,
      windingUp(state),
    );
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
  readonly project = (gx: number, gy: number): ScreenPoint => {
    const zoom = FULL_HALF_H / this.view.halfH;
    const c = this.centre();
    return { x: (gx - c.x) * zoom + GAME_WIDTH / 2, y: (gy - c.y) * zoom + GAME_HEIGHT / 2, zoom };
  };

  /** Frames the fighters (x and head height in game px) and draws a frame. */
  private render(focus: readonly { x: number; top: number }[], dtMs: number, caster: FighterSnapshot | null): void {
    const dt = dtMs / 1000;
    this.clock += dt;
    this.follow(focus, dt, caster);
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

  private follow(focus: readonly { x: number; top: number }[], dt: number, caster: FighterSnapshot | null): void {
    if (focus.length === 0) return;
    const xs = focus.map((f) => f.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const top = Math.min(...focus.map((f) => f.top));
    const fitWidth = (maxX - minX + FRAME_MARGIN) / (2 * ASPECT);
    const fitHeight = (GROUND_Y - top + HEADROOM) / (1 + GROUND_BELOW_CENTRE);
    let halfH = THREE.MathUtils.clamp(Math.max(fitWidth, fitHeight), MIN_HALF_H, FULL_HALF_H);
    let centreX = (minX + maxX) / 2;

    // While a special winds up the shot pushes in on the caster, then eases back out.
    if (caster) this.shotX = caster.x + caster.facing * CUTSCENE_LEAD;
    this.cutscene += ((caster ? 1 : 0) - this.cutscene) * (1 - Math.exp(-(caster ? CUTSCENE_IN : CUTSCENE_OUT) * dt));
    halfH = THREE.MathUtils.lerp(halfH, CUTSCENE_HALF_H, this.cutscene);
    centreX = THREE.MathUtils.lerp(centreX, this.shotX, this.cutscene);

    const halfW = halfH * ASPECT;
    const x = THREE.MathUtils.clamp(centreX, halfW, GAME_WIDTH - halfW);
    const k = 1 - Math.exp(-(FOLLOW_RATE + this.cutscene * 4) * dt);
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

  /** Fills the page box with the 3D canvas, remembering where Phaser's letterboxed canvas sits inside it. */
  private syncLayout(): void {
    const host = this.host;
    const page = this.renderer.domElement.parentElement;
    if (!host || !page) return;
    const p = page.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const key = [p.width, p.height, h.left - p.left, h.top - p.top, h.width, h.height, window.devicePixelRatio].join();
    if (key === this.layout || h.width === 0 || h.height === 0) return;
    this.layout = key;
    const l = h.left - p.left;
    const t = h.top - p.top;
    this.pad = { l: l / h.width, r: (p.width - l - h.width) / h.width, t: t / h.height, b: (p.height - t - h.height) / h.height };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2, Math.sqrt(MAX_PIXELS / (p.width * p.height))));
    this.renderer.setSize(p.width, p.height);
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
    const top = (cy + hh - camY) * k;
    const bottom = (cy - hh - camY) * k;
    const { l, r, t, b } = this.pad;
    cam.projectionMatrix.makePerspective(-hw * k * (1 + l), hw * k * (1 + r), top + (top - bottom) * t, bottom - (top - bottom) * b, cam.near, cam.far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
}
