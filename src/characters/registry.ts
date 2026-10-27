import { FACTIONS } from '../config';
import type { FighterData, SpecialType } from './types';

// Every JSON file in ./data is loaded as a fighter.
const modules = import.meta.glob<FighterData>('./data/*.json', { eager: true, import: 'default' });

const MOVE_NUMBERS = [
  'startupMs',
  'activeMs',
  'recoveryMs',
  'damage',
  'hitstunMs',
  'blockstunMs',
  'knockback',
] as const;
const HITBOX_NUMBERS = ['x', 'y', 'width', 'height'] as const;

const SPECIAL_COMMON = ['cost', 'cooldownMs', 'damage', 'startupMs', 'activeMs', 'recoveryMs'] as const;
const SPECIAL_HIT = ['hitstunMs', 'blockstunMs', 'knockback'] as const;
const SPECIAL_EXTRA = {
  projectile: [...SPECIAL_HIT, 'speed', 'width', 'height', 'y', 'spawnX', 'lifetimeMs'],
  dash: [...SPECIAL_HIT, 'speed'],
  shield: [],
  stun: SPECIAL_HIT,
  teleport: [...SPECIAL_HIT, 'behindOffset'],
  summon: [...SPECIAL_HIT, 'offsetX', 'width', 'height', 'y', 'strikeDelayMs', 'lifetimeMs'],
  pour: [...SPECIAL_HIT, 'riseHeight', 'spoutX', 'spoutY', 'width', 'trackSpeed'],
} as const satisfies Record<SpecialType, readonly string[]>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const PALETTE_KEYS = ['secondary', 'accent', 'skin', 'dark'] as const;
const COLOR_TOKENS = new Set<string>(['primary', ...PALETTE_KEYS]);
const LOOK_SHAPES = new Set<string>(['rect', 'ellipse', 'triangle']);
const ANCHORS = new Set<string>(['head', 'torso', 'back', 'handFront', 'handBack', 'feet']);
const HAIR_STYLES = new Set<string>(['bald', 'short', 'messy', 'slick', 'long', 'bun', 'volume', 'braid']);
const PROPORTION_KEYS = [
  'legLength',
  'torsoHeight',
  'neck',
  'headWidth',
  'headHeight',
  'shoulderWidth',
  'waistWidth',
  'hipWidth',
  'upperArm',
  'foreArm',
  'armWidth',
  'legWidth',
  'footLength',
] as const;
const POSE_NUMBERS = ['lean', 'headTilt', 'bobAmp', 'bobSpeed', 'sway'] as const;
const POSE_PAIRS = ['frontArm', 'backArm', 'frontLeg', 'backLeg'] as const;
const STATIC_POSE_NAMES = ['idle', 'victory', 'lose', 'jump', 'block', 'hit', 'ko'] as const;
const PHASED_POSE_NAMES = ['punch', 'kick', 'special'] as const;
const PHASES = ['startup', 'active', 'recovery'] as const;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isColor = (v: unknown): boolean => typeof v === 'string' && (COLOR_TOKENS.has(v) || HEX.test(v));

function validate(d: FighterData): string | null {
  if (typeof d?.id !== 'string' || typeof d.name !== 'string') return 'id and name must be strings';
  if (!/^#[0-9a-fA-F]{6}$/.test(d.color)) return 'color must be "#rrggbb"';
  for (const k of ['maxHealth', 'walkSpeed', 'jumpVelocity'] as const) {
    if (!isNumber(d.stats?.[k])) return `stats.${k} must be a number`;
  }
  if (!isNumber(d.body?.width) || !isNumber(d.body?.height)) return 'body.width/height must be numbers';
  for (const name of ['light', 'heavy'] as const) {
    const move = d.moves?.[name];
    if (!move) return `moves.${name} is missing`;
    for (const k of MOVE_NUMBERS) if (!isNumber(move[k])) return `moves.${name}.${k} must be a number`;
    for (const k of HITBOX_NUMBERS) {
      if (!isNumber(move.hitbox?.[k])) return `moves.${name}.hitbox.${k} must be a number`;
    }
  }
  return validateSpecial(d.special) ?? validateFlavour(d);
}

function validateFlavour(d: FighterData): string | null {
  if (typeof d.faction !== 'string' || d.faction === '') return 'faction must be a non-empty string';
  if (d.winQuote !== undefined && typeof d.winQuote !== 'string') return 'winQuote must be a string';
  if (d.taunts !== undefined && (!Array.isArray(d.taunts) || d.taunts.some((t) => typeof t !== 'string'))) {
    return 'taunts must be an array of strings';
  }
  if (d.palette) {
    for (const k of PALETTE_KEYS) if (!HEX.test(d.palette[k] ?? '')) return `palette.${k} must be "#rrggbb"`;
  }
  return validateLook(d) ?? validateSvg(d);
}

const isPair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(isNumber);
const SVG_PIVOTS = ['shoulderBack', 'shoulderFront', 'hipBack', 'hipFront', 'neck', 'footBack', 'footFront'] as const;
const SVG_ANIM_NUMBERS = ['elbowWeight', 'restElbow', 'extendElbow', 'reach', 'kneeWeight', 'leanScale', 'headScale', 'bobScale'] as const;
const SVG_REST = ['armBack', 'armFront', 'legBack', 'legFront'] as const;
const SVG_CLOTH = ['windSwing', 'swing', 'speed', 'lag', 'breeze'] as const;

function validateSvg(d: FighterData): string | null {
  const svg = d.svg;
  if (!svg) return null;
  if (typeof svg.id !== 'string' || svg.id === '') return 'svg.id must be a string';
  if (!isNumber(svg.scale) || svg.scale <= 0) return 'svg.scale must be a positive number';
  for (const k of SVG_PIVOTS) if (!isPair(svg.pivots?.[k])) return `svg.pivots.${k} must be [x, y]`;
  for (const k of ['elbowBack', 'elbowFront'] as const) {
    if (svg.pivots[k] !== undefined && !isPair(svg.pivots[k])) return `svg.pivots.${k} must be [x, y]`;
  }
  if (!['arm-front', 'arm-back', 'none'].includes(svg.propFollows)) return 'svg.propFollows must be arm-front, arm-back or none';
  const a = svg.anim;
  for (const k of SVG_ANIM_NUMBERS) if (!isNumber(a?.[k])) return `svg.anim.${k} must be a number`;
  for (const k of SVG_REST) if (!isNumber(a.restAngles?.[k])) return `svg.anim.restAngles.${k} must be a number`;
  for (const k of ['armBackLower', 'armFrontLower'] as const) {
    if (a.restAngles[k] !== undefined && !isNumber(a.restAngles[k])) return `svg.anim.restAngles.${k} must be a number`;
  }
  if (!isPair(a.cloth?.pivot)) return 'svg.anim.cloth.pivot must be [x, y]';
  for (const k of SVG_CLOTH) if (!isNumber(a.cloth[k])) return `svg.anim.cloth.${k} must be a number`;
  return null;
}

function validatePose(pose: unknown, path: string): string | null {
  if (typeof pose !== 'object' || pose === null) return `${path} must be an object`;
  const rec = pose as Record<string, unknown>;
  for (const k of POSE_NUMBERS) if (rec[k] !== undefined && !isNumber(rec[k])) return `${path}.${k} must be a number`;
  for (const k of POSE_PAIRS) {
    const pair = rec[k];
    if (pair !== undefined && !(Array.isArray(pair) && pair.length === 2 && pair.every(isNumber))) {
      return `${path}.${k} must be [number, number]`;
    }
  }
  return null;
}

function validateLook(d: FighterData): string | null {
  const look = d.look;
  if (!look) return null;
  if (!d.palette) return 'look requires a palette';
  const prop = look.proportions as unknown as Record<string, unknown> | undefined;
  for (const k of PROPORTION_KEYS) if (!isNumber(prop?.[k])) return `look.proportions.${k} must be a number`;
  const p = look.proportions;
  const total = p.legLength + p.torsoHeight + p.neck + p.headHeight;
  if (Math.abs(total - d.body.height) > 8) {
    return `look.proportions heights add up to ${total} but body.height is ${d.body.height}`;
  }
  if (!HAIR_STYLES.has(look.hair?.style) || !isColor(look.hair?.color)) return 'look.hair needs a valid style and colour';
  if (look.hair.streak !== undefined && !isColor(look.hair.streak)) return 'look.hair.streak must be a colour';
  const face = look.face;
  if (!['round', 'narrow', 'wide'].includes(face?.eyes)) return 'look.face.eyes must be round, narrow or wide';
  if (!['flat', 'smile', 'smirk', 'open'].includes(face?.mouth)) return 'look.face.mouth must be flat, smile, smirk or open';
  if (!isNumber(face.brows?.thickness) || !isColor(face.brows?.color)) return 'look.face.brows needs thickness and colour';
  for (const k of ['top', 'pants', 'shoes', 'sleeveColor'] as const) {
    if (look.base?.[k] !== undefined && !isColor(look.base[k])) return `look.base.${k} must be a colour`;
  }
  for (const [i, layer] of (look.outfit ?? []).entries()) {
    const at = `look.outfit[${i}]`;
    if (!isColor(layer.color)) return `${at}.color must be a palette name or #rrggbb`;
    if (layer.type === 'shape') {
      if (!LOOK_SHAPES.has(layer.shape) || !ANCHORS.has(layer.anchor)) return `${at} needs a valid shape and anchor`;
      for (const k of ['x', 'y', 'width', 'height'] as const) if (!isNumber(layer[k])) return `${at}.${k} must be a number`;
    } else if (layer.type === 'kurta') {
      if (!isNumber(layer.length)) return `${at}.length must be a number`;
    } else if (layer.type === 'shawl' || layer.type === 'scarf') {
      if (!isNumber(layer.tail)) return `${at}.tail must be a number`;
    } else if (layer.type === 'checks') {
      if (!isNumber(layer.rows) || !isNumber(layer.cols)) return `${at}.rows and cols must be numbers`;
    } else if (!['vest', 'cap', 'beard', 'moustache', 'glasses'].includes(layer.type)) {
      return `${at}.type is not a known outfit layer`;
    }
  }
  for (const name of STATIC_POSE_NAMES) {
    const pose = look.poses?.[name];
    if (pose !== undefined) {
      const err = validatePose(pose, `look.poses.${name}`);
      if (err) return err;
    }
  }
  for (const name of PHASED_POSE_NAMES) {
    const phased = look.poses?.[name];
    for (const phase of PHASES) {
      const pose = phased?.[phase];
      if (pose !== undefined) {
        const err = validatePose(pose, `look.poses.${name}.${phase}`);
        if (err) return err;
      }
    }
  }
  return null;
}

function validateSpecial(s: FighterData['special'] | undefined): string | null {
  if (!s || typeof s.name !== 'string') return 'special.name must be a string';
  const extra = (SPECIAL_EXTRA as Record<string, readonly string[]>)[s.type];
  if (!extra) return 'special.type must be projectile, dash, shield, stun, teleport, summon or pour';
  const record = s as unknown as Record<string, unknown>;
  for (const k of [...SPECIAL_COMMON, ...extra]) {
    if (!isNumber(record[k])) return `special.${k} must be a number`;
  }
  if (typeof s.description !== 'string') return 'special.description must be a string';
  if (record.guardBreak !== undefined && typeof record.guardBreak !== 'boolean') {
    return 'special.guardBreak must be a boolean';
  }
  if (record.reflectRatio !== undefined && !isNumber(record.reflectRatio)) {
    return 'special.reflectRatio must be a number';
  }
  if (s.type !== 'shield' && s.burn !== undefined && !(isNumber(s.burn.damagePerSec) && isNumber(s.burn.durationMs))) {
    return 'special.burn needs damagePerSec and durationMs numbers';
  }
  if ((s.type === 'projectile' || s.type === 'pour') && s.color !== undefined && !HEX.test(s.color)) {
    return 'special.color must be "#rrggbb"';
  }
  if (s.type === 'dash' || s.type === 'teleport') {
    for (const k of HITBOX_NUMBERS) if (!isNumber(s.hitbox?.[k])) return `special.hitbox.${k} must be a number`;
  }
  if (s.type === 'stun' && (!isNumber(s.area?.width) || !isNumber(s.area?.height))) {
    return 'special.area.width/height must be numbers';
  }
  return validateSpecialExtras(record);
}

const FX_IDS = new Set<string>(['constitution', 'bulldozer', 'cycle', 'lathi', 'panja']);
const HIT_NUMBERS = ['damage', 'hitstunMs', 'blockstunMs', 'knockback'] as const;

function validateSpecialExtras(r: Record<string, unknown>): string | null {
  for (const k of ['knockdown', 'pierce']) {
    if (r[k] !== undefined && typeof r[k] !== 'boolean') return `special.${k} must be a boolean`;
  }
  for (const k of ['impact', 'label']) if (r[k] !== undefined && typeof r[k] !== 'string') return `special.${k} must be a string`;
  if (r.spinTurns !== undefined && !isNumber(r.spinTurns)) return 'special.spinTurns must be a number';
  if (r.spawnFrom !== undefined && r.spawnFrom !== 'self' && r.spawnFrom !== 'edge') return 'special.spawnFrom must be self or edge';
  if (r.fx !== undefined && !FX_IDS.has(r.fx as string)) return `special.fx must be one of ${[...FX_IDS].join(', ')}`;
  if (r.volley !== undefined) {
    const v = r.volley as Record<string, unknown> | null;
    for (const k of ['standOffX', 'strikes', 'beatMs']) if (!isNumber(v?.[k])) return `special.volley.${k} must be a number`;
  }
  if (r.finisher !== undefined) {
    const fin = r.finisher as Record<string, unknown> | null;
    if (typeof fin !== 'object' || fin === null) return 'special.finisher must be an object';
    for (const k of HIT_NUMBERS) if (fin[k] !== undefined && !isNumber(fin[k])) return `special.finisher.${k} must be a number`;
    if (fin.knockdown !== undefined && typeof fin.knockdown !== 'boolean') return 'special.finisher.knockdown must be a boolean';
    if (fin.impact !== undefined && typeof fin.impact !== 'string') return 'special.finisher.impact must be a string';
  }
  return null;
}

const fighters = new Map<string, FighterData>();
for (const [path, data] of Object.entries(modules)) {
  const error = validate(data);
  if (error) {
    console.warn(`[characters] Skipping ${path}: ${error}`);
    continue;
  }
  fighters.set(data.id, data);
}

export const getFighters = (): FighterData[] => [...fighters.values()];
export const getFighter = (id: string): FighterData | undefined => fighters.get(id);

export const factionOf = (f: FighterData): string => f.faction;

export interface FactionGroup {
  faction: string;
  fighters: FighterData[];
}

/** Groups fighters by faction: configured factions first (in config order), then any others. */
export function getFactionGroups(): FactionGroup[] {
  const groups = new Map<string, FighterData[]>(Object.keys(FACTIONS).map((name) => [name, []]));
  for (const f of fighters.values()) {
    const name = factionOf(f);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(f);
  }
  return [...groups].filter(([, list]) => list.length > 0).map(([faction, list]) => ({ faction, fighters: list }));
}
