import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FighterData, ModelAction, ModelClip, ModelConfig } from '../core/characters/types';
import type { RigFrame } from '../rig/animator';
import { FigureBody } from './FigureBody';
import { failModel, loadModel, withoutRootMotion } from './modelLoader';
import { Puppet3D } from './Puppet3D';
import { DEG, PX } from './space';

const DEFAULT_FADE = 0.15;
const LOOPING = new Set<ModelAction>(['idle', 'walk', 'block', 'win']);
/** Attack clips are stretched to the move's real length unless the config says otherwise. */
const FITTED = new Set<ModelAction>(['punch', 'kick', 'special']);
/** Where an action goes when the model has no clip for it. */
const FALLBACK: Partial<Record<ModelAction, ModelAction>> = {
  special: 'kick',
  kick: 'punch',
  punch: 'idle',
  ko: 'hit',
  hit: 'idle',
  win: 'idle',
  jump: 'idle',
  block: 'idle',
  walk: 'idle',
};

interface Track {
  action: THREE.AnimationAction;
  fade: number;
  /** The clip's own playback speed from the config. */
  speed: number;
  fit: boolean;
  seconds: number;
}

/** Capsule sized to the fighter's body, with a visor on the side it faces (+z). */
function placeholder(data: FighterData): THREE.Group {
  const r = (data.body.width / 2) * PX;
  const h = data.body.height * PX;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, Math.max(0, h - 2 * r), 6, 16),
    new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.6 }),
  );
  body.position.y = h / 2;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(r * 1.2, r * 0.35, r * 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  visor.position.set(0, h - r * 1.3, r * 0.85);
  const group = new THREE.Group();
  group.add(body, visor);
  group.traverse((o) => (o.castShadow = true));
  return group;
}

/**
 * A fighter drawn from a GLB, animated by crossfading between clips as the core action changes. Clips never
 * touch gameplay: the model hangs under the puppet root that the fight positions. Until the model arrives, and
 * for good if it cannot be used, the fighter's low-poly figure (or a capsule without one) stands in.
 */
export class ModelFighter extends Puppet3D {
  /** Turns on Y to face the opponent; holds the stand-in or the model. */
  private readonly facing = new THREE.Group();
  private stand: THREE.Object3D;
  private readonly fallback: FigureBody | null;
  private mixer: THREE.AnimationMixer | null = null;
  private readonly tracks = new Map<ModelAction, Track>();
  private current: Track | null = null;
  private opacity = 1;
  private lastTime: number | null = null;
  private gone = false;

  constructor(
    parent: THREE.Object3D,
    data: FighterData,
    drawOrder: number,
    private readonly config: ModelConfig,
  ) {
    super(parent, data, drawOrder);
    this.fallback = data.figure ? new FigureBody(data, data.figure) : null;
    this.stand = this.fallback?.root ?? placeholder(data);
    this.facing.add(this.stand);
    this.root.add(this.facing);
    void loadModel(config.url).then((gltf) => {
      if (gltf && !this.gone) this.attach(gltf);
    });
  }

  render(frame: RigFrame): void {
    this.showAura(frame.aura);
    const dt = this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, frame.time - this.lastTime));
    this.lastTime = frame.time;
    if (!this.mixer) {
      this.fallback?.pose(frame);
      return;
    }
    this.play(frame.action, frame.actionMs);
    // Clips follow fight time, so hit-stop and slow-motion hold or slow them too.
    this.mixer.update(dt * (frame.timeScale ?? 1));
  }

  protected override orient(facing: 1 | -1, angle: number, _spin: number, turn: number): void {
    // glTF models face +z; a quarter turn points them along the fight line.
    this.facing.rotation.y = facing * (Math.PI / 2) + turn;
    this.root.scale.set(1, 1, 1);
    // A model with a knock-out clip falls by itself; anything else is tipped over like the cut-outs.
    this.root.rotation.set(0, 0, this.tracks.has('ko') ? 0 : -angle * DEG);
    if (!this.mixer) this.fallback?.faceCamera(facing);
  }

  protected setOpacity(alpha: number): void {
    this.opacity = alpha;
    this.applyOpacity();
  }

  override destroy(): void {
    this.gone = true;
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.stand);
    super.destroy();
  }

  /** Swaps the stand-in for the model, unless the config does not match the file. */
  private attach(gltf: GLTF): void {
    const cfg = this.config;
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(cfg.scale ?? 1);
    model.position.y = cfg.groundOffset ?? 0;
    model.rotation.y = (cfg.yaw ?? 0) * DEG;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = cfg.castShadow ?? true;
      mesh.receiveShadow = cfg.receiveShadow ?? false;
      mesh.frustumCulled = false;
      // Geometry belongs to the cached file; materials are per fighter so opacity changes stay local.
      mesh.geometry.userData.shared = true;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
    });

    const mixer = new THREE.AnimationMixer(model);
    const tracks = new Map<ModelAction, Track>();
    const available = gltf.animations.map((a) => a.name);
    for (const [name, entry] of Object.entries(cfg.animations)) {
      const track = this.bind(mixer, model, gltf.animations, name as ModelAction, entry);
      if (track) tracks.set(name as ModelAction, track);
      else console.warn(`[models] ${this.data.id}: no clip for ${name} in ${cfg.url}. Available clips: ${available.join(', ') || '(none)'}`);
    }
    if (!tracks.has('idle')) {
      // Without an idle clip the model would stand frozen in its bind pose.
      failModel(
        cfg.url,
        'the idle clip was not found',
        `model.animations.idle does not match any clip. Available clips: ${available.join(', ') || '(none)'}. Fix it in src/characters/data/${this.data.id}.json.`,
      );
      for (const m of this.materialsOf(model)) m.dispose();
      return;
    }

    this.facing.remove(this.stand);
    this.disposeObject(this.stand);
    this.stand = model;
    this.facing.add(model);
    this.mixer = mixer;
    for (const [name, track] of tracks) this.tracks.set(name, track);
    this.applyOpacity();
  }

  private bind(mixer: THREE.AnimationMixer, model: THREE.Object3D, clips: THREE.AnimationClip[], name: ModelAction, entry: string | ModelClip): Track | null {
    const spec = typeof entry === 'string' ? { clip: entry } : entry;
    const source = THREE.AnimationClip.findByName(clips, spec.clip);
    if (!source) return null;
    const action = mixer.clipAction(withoutRootMotion(source, model, this.config.lockRootY ?? false));
    action.setLoop((spec.loop ?? LOOPING.has(name)) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    const speed = spec.timeScale ?? 1;
    action.timeScale = speed;
    return {
      action,
      fade: spec.fade ?? this.config.fade ?? DEFAULT_FADE,
      speed,
      fit: spec.fit ?? FITTED.has(name),
      seconds: source.duration,
    };
  }

  /** Crossfades to the clip for `name` (or its fallback); does nothing while that clip is already current. */
  private play(name: ModelAction, actionMs?: number): void {
    let resolved = name;
    while (!this.tracks.has(resolved) && FALLBACK[resolved]) resolved = FALLBACK[resolved]!;
    const next = this.tracks.get(resolved);
    if (!next || next === this.current) return;
    next.action.reset().play();
    next.action.timeScale = next.fit && actionMs && next.seconds > 0 ? (next.speed * next.seconds) / (actionMs / 1000) : next.speed;
    if (this.current) next.action.crossFadeFrom(this.current.action, next.fade, false);
    this.current = next;
  }

  private materialsOf(obj: THREE.Object3D): THREE.Material[] {
    const out: THREE.Material[] = [];
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) out.push(...[mesh.material].flat());
    });
    return out;
  }

  private applyOpacity(): void {
    for (const m of this.materialsOf(this.stand)) {
      m.transparent = this.opacity < 1;
      m.opacity = this.opacity;
      m.needsUpdate = true;
    }
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.materialsOf(obj)) m.dispose();
  }
}
