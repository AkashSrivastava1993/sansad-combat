import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FighterData } from '../core/characters/types';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF | null>>();

export type ModelStatus =
  | { state: 'loading'; /** 0-1, or -1 while the size is unknown. */ progress: number }
  | { state: 'ready'; clips: string[] }
  | { state: 'failed'; reason: string };

const statuses = new Map<string, ModelStatus>();
const listeners = new Set<(path: string, status: ModelStatus) => void>();

export const modelStatus = (path: string): ModelStatus | undefined => statuses.get(path);

/** Calls `fn` for every progress, success or failure of any model, and returns a function that stops it. */
export function onModelStatus(fn: (path: string, status: ModelStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function report(path: string, status: ModelStatus): void {
  statuses.set(path, status);
  for (const fn of listeners) fn(path, status);
}

/** Marks a model as unusable, e.g. because its clip names do not match the config. */
export function failModel(path: string, reason: string, detail: string): void {
  console.error(`[models] ${path}: ${reason}. ${detail}`);
  report(path, { state: 'failed', reason });
}

async function download(url: string, onProgress: (fraction: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Dev servers answer unknown paths with the index page instead of a 404.
  if ((res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('file not found');
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(total ? got / total : -1);
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out.buffer;
}

async function fetchModel(path: string): Promise<GLTF | null> {
  const url = new URL(path, document.baseURI).href;
  try {
    report(path, { state: 'loading', progress: 0 });
    const bytes = await download(url, (progress) => report(path, { state: 'loading', progress }));
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== 'glTF') throw new Error('not a binary glTF (.glb) file');
    const gltf = await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1));
    const clips = gltf.animations.map((a) => a.name);
    console.info(`[models] ${path} loaded; ${clips.length} clips: ${clips.join(', ') || '(none)'}`);
    report(path, { state: 'ready', clips });
    return gltf;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    failModel(path, reason, 'Using the fallback look; check the file at that path.');
    return null;
  }
}

/** Fetches a fighter's GLB once; resolves to null (after an error message) when it is missing or unreadable. */
export function loadModel(path: string): Promise<GLTF | null> {
  let pending = cache.get(path);
  if (!pending) {
    pending = fetchModel(path);
    cache.set(path, pending);
  }
  return pending;
}

/** Starts loading every configured model so fights find them ready. */
export function preloadModels(fighters: readonly FighterData[]): void {
  for (const f of fighters) if (f.model) void loadModel(f.model.url);
}

/**
 * Copy of `clip` that stays where it started: the root-most animated bone loses its sideways travel (and its
 * height too when `lockY`), since the game moves the fighter itself.
 */
export function withoutRootMotion(clip: THREE.AnimationClip, root: THREE.Object3D, lockY: boolean): THREE.AnimationClip {
  const nodeOf = (track: THREE.KeyframeTrack): string => THREE.PropertyBinding.parseTrackName(track.name).nodeName;
  const depthOf = (name: string): number => {
    const node = root.getObjectByName(name);
    if (!node) return Infinity;
    let depth = 0;
    for (let o = node; o !== root && o.parent; o = o.parent) depth++;
    return depth;
  };
  const positions = clip.tracks.filter((t) => t.name.endsWith('.position'));
  const top = Math.min(...positions.map((t) => depthOf(nodeOf(t))));
  const tracks = clip.tracks.map((t) => {
    if (!positions.includes(t) || depthOf(nodeOf(t)) !== top) return t.clone();
    const values = Float32Array.from(t.values);
    for (let i = 3; i < values.length; i += 3) {
      values[i] = values[0]!;
      values[i + 2] = values[2]!;
      if (lockY) values[i + 1] = values[1]!;
    }
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(values));
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}
