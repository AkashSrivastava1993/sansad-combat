import type { FighterData, FighterLook, FighterPalette } from './types';

const FALLBACK_PALETTE: FighterPalette = { secondary: '#cccccc', accent: '#ffffff', skin: '#e0b48c', dark: '#222222' };

const getPalette = (data: FighterData): FighterPalette => data.palette ?? FALLBACK_PALETTE;

/** Resolves a colour token ("primary", a palette name, or "#rrggbb") to a hex string. */
export function resolveLookColor(data: FighterData, token: string): string {
  if (token.startsWith('#')) return token;
  if (token === 'primary') return data.color;
  return getPalette(data)[token as keyof FighterPalette] ?? data.color;
}

const defaults = new WeakMap<FighterData, FighterLook>();

/** The fighter's rig description; sensible proportions are derived from the body box when the JSON has none. */
export function getLook(data: FighterData): FighterLook {
  if (data.look) return data.look;
  let look = defaults.get(data);
  if (!look) {
    const { width: w, height: h } = data.body;
    look = {
      proportions: {
        legLength: h * 0.42,
        torsoHeight: h * 0.34,
        neck: h * 0.02,
        headWidth: h * 0.2,
        headHeight: h * 0.22,
        shoulderWidth: w * 0.75,
        waistWidth: w * 0.6,
        hipWidth: w * 0.28,
        upperArm: h * 0.18,
        foreArm: h * 0.16,
        armWidth: 11,
        legWidth: 14,
        footLength: 18,
      },
      hair: { style: 'short', color: 'dark' },
      face: { eyes: 'round', brows: { thickness: 3, color: 'dark' }, mouth: 'flat' },
    };
    defaults.set(data, look);
  }
  return look;
}

/** Height above the feet of the highest point of the body, head wear and props. */
export function lookHeight(data: FighterData): number {
  const look = getLook(data);
  const p = look.proportions;
  const headCentre = p.legLength + p.torsoHeight + p.neck + p.headHeight / 2;
  let top = headCentre + p.headHeight / 2;
  for (const layer of look.outfit ?? []) {
    if (layer.type === 'cap') top = Math.max(top, headCentre + p.headHeight * (layer.style === 'crown' ? 0.85 : 0.7));
    if (layer.type !== 'shape') continue;
    const reach = layer.height / 2 + Math.abs(layer.y);
    const base =
      layer.anchor === 'head'
        ? headCentre
        : layer.anchor === 'torso' || layer.anchor === 'back'
          ? p.legLength
          : layer.anchor === 'feet'
            ? 0
            : p.legLength + p.torsoHeight * 0.5;
    top = Math.max(top, base + reach);
  }
  return top;
}
