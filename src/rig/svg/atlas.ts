import type Phaser from 'phaser';
import type { FighterData, SvgLayerId } from '../../characters/types';

/** Rasterise at this fraction of the art size; the sprites are drawn smaller than the art, so this keeps edges crisp. */
export const TEXTURE_SCALE = 0.75;

/** Back-to-front. `legs` in the SVG is split into one layer per leg. */
export const SVG_DRAW_ORDER: readonly SvgLayerId[] = [
  'back',
  'arm-back',
  'arm-back-lower',
  'leg-back',
  'leg-front',
  'torso',
  'head',
  'arm-front',
  'arm-front-lower',
  'prop',
];

const REQUIRED: readonly SvgLayerId[] = ['leg-back', 'leg-front', 'torso', 'head', 'arm-back', 'arm-front'];

interface Source {
  group: string;
  /** Nested group holding only this layer; preferred over `half` when the SVG has it. */
  sub?: string;
  /** For `legs` without named sub-groups: which half of the children belongs to this layer. */
  half?: 'first' | 'second';
  /** The layer exists only if the SVG has the `sub` group. */
  subOnly?: boolean;
}

const SOURCES: Record<SvgLayerId, Source> = {
  back: { group: 'back' },
  'arm-back': { group: 'arm-back', sub: 'arm-back-upper' },
  'arm-back-lower': { group: 'arm-back', sub: 'arm-back-lower', subOnly: true },
  'leg-back': { group: 'legs', sub: 'leg-back', half: 'first' },
  'leg-front': { group: 'legs', sub: 'leg-front', half: 'second' },
  torso: { group: 'torso' },
  head: { group: 'head' },
  'arm-front': { group: 'arm-front', sub: 'arm-front-upper' },
  'arm-front-lower': { group: 'arm-front', sub: 'arm-front-lower', subOnly: true },
  prop: { group: 'prop' },
};

export interface SvgArt {
  canvas: [number, number];
  /** Where the feet are anchored, in art units. */
  anchor: [number, number];
}

interface Manifest extends SvgArt {
  fighters: { id: string; file: string }[];
}

let art: SvgArt = { canvas: [256, 512], anchor: [128, 500] };
const ready = new Set<string>();
const images = new Map<string, HTMLImageElement>();

export const svgArt = (): SvgArt => art;
export const hasSvg = (fighterId: string): boolean => ready.has(fighterId);
export const svgTextureKey = (fighterId: string, layer: SvgLayerId): string => `svg:${fighterId}:${layer}`;
export const svgImage = (fighterId: string, layer: SvgLayerId): HTMLImageElement | undefined =>
  images.get(svgTextureKey(fighterId, layer));

const assetUrl = (file: string): string => new URL(`assets/characters/${file}`, document.baseURI).href;

function layerMarkup(root: Element, source: Source): string | null {
  const clone = root.cloneNode(true) as Element;
  let kept: Element | null = null;
  for (const child of Array.from(clone.children)) {
    if (child.tagName === 'g' && child.id === source.group) kept = child;
    else child.remove();
  }
  if (!kept) return null;
  const kids = Array.from(kept.children);
  const named = source.sub ? kids.find((k) => k.id === source.sub) : undefined;
  if (!named && source.subOnly) return null;
  if (named) {
    for (const k of kids) if (k !== named) k.remove();
  } else if (source.half) {
    const half = Math.ceil(kids.length / 2);
    for (const k of source.half === 'first' ? kids.slice(half) : kids.slice(0, half)) k.remove();
  }
  if (kept.children.length === 0) return null;
  clone.setAttribute('width', String(art.canvas[0] * TEXTURE_SCALE));
  clone.setAttribute('height', String(art.canvas[1] * TEXTURE_SCALE));
  return new XMLSerializer().serializeToString(clone);
}

function loadImage(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('SVG layer failed to decode'));
    img.src = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  });
}

async function loadFighter(scene: Phaser.Scene, data: FighterData, file: string): Promise<void> {
  const res = await fetch(assetUrl(file));
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.tagName !== 'svg') throw new Error(`${file}: not valid SVG`);

  const loaded = new Map<SvgLayerId, HTMLImageElement>();
  for (const layer of SVG_DRAW_ORDER) {
    const markup = layerMarkup(root, SOURCES[layer]);
    if (markup) loaded.set(layer, await loadImage(markup));
  }
  const missing = REQUIRED.filter((l) => !loaded.has(l));
  if (missing.length > 0) throw new Error(`${file}: missing layers ${missing.join(', ')}`);

  for (const [layer, img] of loaded) {
    const key = svgTextureKey(data.id, layer);
    images.set(key, img);
    if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
  }
  ready.add(data.id);
}

/** Loads every fighter that has an `svg` block; any that fail stay on the procedural rig. */
export async function loadSvgAtlas(scene: Phaser.Scene, fighters: readonly FighterData[]): Promise<void> {
  let manifest: Manifest;
  try {
    const res = await fetch(assetUrl('manifest.json'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = (await res.json()) as Manifest;
  } catch (err) {
    console.warn('[svg] No character manifest; using the procedural rig.', err);
    return;
  }
  art = { canvas: manifest.canvas, anchor: manifest.anchor };
  const files = new Map(manifest.fighters.map((f) => [f.id, f.file]));

  await Promise.all(
    fighters.map(async (f) => {
      if (!f.svg) return;
      const file = files.get(f.svg.id);
      if (!file) {
        console.warn(`[svg] ${f.id}: "${f.svg.id}" is not in the manifest; using the procedural rig.`);
        return;
      }
      try {
        await loadFighter(scene, f, file);
      } catch (err) {
        console.warn(`[svg] ${f.id}: falling back to the procedural rig.`, err);
      }
    }),
  );
}
