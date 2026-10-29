import type { FighterData, FigureConfig, ModelAction, SpecialType } from './types';

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
} as const satisfies Record<SpecialType, readonly string[]>;

const HEX = /^#[0-9a-fA-F]{6}$/;
const POSE_NUMBERS = ['lean', 'headTilt', 'bobAmp', 'bobSpeed', 'sway'] as const;
const POSE_PAIRS = ['frontArm', 'backArm', 'frontLeg', 'backLeg'] as const;
const STATIC_POSE_NAMES = ['idle', 'victory', 'lose', 'jump', 'block', 'hit', 'ko'] as const;
const PHASED_POSE_NAMES = ['punch', 'kick', 'special'] as const;
const PHASES = ['startup', 'active', 'recovery'] as const;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Returns why `d` is not a usable fighter definition, or null when it is. */
export function validateFighter(d: FighterData): string | null {
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
  if (!isNumber(d.previewHeight) || d.previewHeight <= 0) return 'previewHeight must be a positive number';
  return validatePoses(d) ?? validateSvg(d) ?? validateModel(d) ?? validateFigure(d.figure);
}

const isPair = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(isNumber);
const SVG_PIVOTS = ['shoulderBack', 'shoulderFront', 'hipBack', 'hipFront', 'neck', 'footBack', 'footFront'] as const;
const SVG_ANIM_NUMBERS = ['elbowWeight', 'restElbow', 'extendElbow', 'reach', 'kneeWeight', 'leanScale', 'headScale', 'bobScale'] as const;
const SVG_REST = ['armBack', 'armFront', 'legBack', 'legFront'] as const;
const SVG_CLOTH = ['windSwing', 'swing', 'speed', 'lag', 'breeze'] as const;

function validateSvg(d: FighterData): string | null {
  const svg = d.svg;
  if (!svg) return 'svg is required';
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

const isHex = (v: unknown): boolean => typeof v === 'string' && HEX.test(v);
const HAIR_STYLES = ['bald', 'short', 'bun', 'curly', 'wavy'];

function validateFigure(f: FigureConfig | undefined): string | null {
  if (f === undefined) return null;
  if (typeof f !== 'object' || f === null) return 'figure must be an object';
  const hex = (path: string, v: unknown, optional = false): string | null =>
    (optional && v === undefined) || isHex(v) ? null : `figure.${path} must be "#rrggbb"`;
  const checks = [
    hex('skin', f.skin),
    hex('shoes', f.shoes),
    hex('top.color', f.top?.color),
    hex('top.sleeves', f.top?.sleeves, true),
    hex('bottom.color', f.bottom?.color),
    hex('bottom.trim', f.bottom?.trim, true),
    hex('vest', f.vest, true),
    hex('stole', f.stole, true),
    hex('pallu', f.pallu, true),
    hex('stripes', f.stripes, true),
    hex('watch', f.watch, true),
    hex('bangles', f.bangles, true),
    hex('border', f.border, true),
    hex('moustache', f.moustache, true),
    f.hair === undefined ? null : hex('hair.color', f.hair.color),
    f.beard === undefined ? null : hex('beard.color', f.beard.color),
    f.topi === undefined ? null : hex('topi.color', f.topi.color) ?? hex('topi.band', f.topi.band, true),
  ];
  const failed = checks.find((c) => c !== null);
  if (failed) return failed;
  if (f.top.length !== 'short' && f.top.length !== 'knee') return 'figure.top.length must be short or knee';
  if (f.bulk !== undefined && (!isNumber(f.bulk) || f.bulk <= 0)) return 'figure.bulk must be a positive number';
  if (f.hair !== undefined && !HAIR_STYLES.includes(f.hair.style)) return `figure.hair.style must be one of ${HAIR_STYLES.join(', ')}`;
  if (f.beard !== undefined && !['short', 'full', 'long'].includes(f.beard.length)) return 'figure.beard.length must be short, full or long';
  if (f.glasses !== undefined && f.glasses !== 'clear' && f.glasses !== 'dark' && f.glasses !== 'frame') return 'figure.glasses must be clear, dark or frame';
  if (f.prop !== undefined && !['kettle', 'broom', 'mic'].includes(f.prop)) return 'figure.prop must be kettle, broom or mic';
  return null;
}

const MODEL_ACTIONS = new Set<ModelAction>(['idle', 'walk', 'jump', 'punch', 'kick', 'block', 'hit', 'ko', 'win', 'special']);

function validateModel(d: FighterData): string | null {
  const m = d.model;
  if (m === undefined) return null;
  if (typeof m !== 'object' || m === null) return 'model must be an object';
  if (typeof m.url !== 'string' || m.url === '') return 'model.url must be a non-empty string';
  if (m.scale !== undefined && (!isNumber(m.scale) || m.scale <= 0)) return 'model.scale must be a positive number';
  for (const k of ['groundOffset', 'yaw'] as const) if (m[k] !== undefined && !isNumber(m[k])) return `model.${k} must be a number`;
  if (m.fade !== undefined && (!isNumber(m.fade) || m.fade < 0)) return 'model.fade must be a non-negative number';
  for (const k of ['lockRootY', 'castShadow', 'receiveShadow'] as const) {
    if (m[k] !== undefined && typeof m[k] !== 'boolean') return `model.${k} must be a boolean`;
  }
  const anims = m.animations as Record<string, unknown> | undefined;
  if (typeof anims !== 'object' || anims === null || anims.idle === undefined) return 'model.animations.idle is required';
  for (const [action, entry] of Object.entries(anims)) {
    if (!MODEL_ACTIONS.has(action as ModelAction)) return `model.animations.${action} is not an action (${[...MODEL_ACTIONS].join(', ')})`;
    if (typeof entry === 'string' && entry !== '') continue;
    const clip = entry as Record<string, unknown> | null;
    if (typeof clip !== 'object' || clip === null || typeof clip.clip !== 'string' || clip.clip === '') {
      return `model.animations.${action} must be a clip name or { clip }`;
    }
    for (const k of ['loop', 'fit']) {
      if (clip[k] !== undefined && typeof clip[k] !== 'boolean') return `model.animations.${action}.${k} must be a boolean`;
    }
    if (clip.timeScale !== undefined && (!isNumber(clip.timeScale) || clip.timeScale <= 0)) return `model.animations.${action}.timeScale must be a positive number`;
    if (clip.fade !== undefined && (!isNumber(clip.fade) || clip.fade < 0)) return `model.animations.${action}.fade must be a non-negative number`;
  }
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

function validatePoses(d: FighterData): string | null {
  const poses = d.poses;
  for (const name of STATIC_POSE_NAMES) {
    const pose = poses?.[name];
    if (pose !== undefined) {
      const err = validatePose(pose, `poses.${name}`);
      if (err) return err;
    }
  }
  for (const name of PHASED_POSE_NAMES) {
    const phased = poses?.[name];
    for (const phase of PHASES) {
      const pose = phased?.[phase];
      if (pose !== undefined) {
        const err = validatePose(pose, `poses.${name}.${phase}`);
        if (err) return err;
      }
    }
  }
  return null;
}

function validateSpecial(s: FighterData['special'] | undefined): string | null {
  if (!s || typeof s.name !== 'string') return 'special.name must be a string';
  const extra = (SPECIAL_EXTRA as Record<string, readonly string[]>)[s.type];
  if (!extra) return 'special.type must be projectile, dash, shield, stun, teleport or summon';
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
  if (s.type === 'projectile' && s.color !== undefined && !HEX.test(s.color)) {
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

const FX_IDS = new Set<string>(['constitution', 'bulldozer', 'cycle', 'lathi', 'panja', 'broom', 'mic', 'baarish', 'jaadu']);
const HIT_NUMBERS = ['damage', 'hitstunMs', 'blockstunMs', 'knockback'] as const;

function validateSpecialExtras(r: Record<string, unknown>): string | null {
  for (const k of ['knockdown', 'pierce']) {
    if (r[k] !== undefined && typeof r[k] !== 'boolean') return `special.${k} must be a boolean`;
  }
  for (const k of ['impact', 'label']) if (r[k] !== undefined && typeof r[k] !== 'string') return `special.${k} must be a string`;
  if (r.spinTurns !== undefined && !isNumber(r.spinTurns)) return 'special.spinTurns must be a number';
  if (r.spawnFrom !== undefined && r.spawnFrom !== 'self' && r.spawnFrom !== 'edge' && r.spawnFrom !== 'opponent') {
    return 'special.spawnFrom must be self, edge or opponent';
  }
  if (r.fx !== undefined && !FX_IDS.has(r.fx as string)) return `special.fx must be one of ${[...FX_IDS].join(', ')}`;
  if (r.volley !== undefined) {
    const v = r.volley as Record<string, unknown> | null;
    for (const k of ['standOffX', 'strikes', 'beatMs']) if (!isNumber(v?.[k])) return `special.volley.${k} must be a number`;
    if (v?.vanish !== undefined && typeof v.vanish !== 'boolean') return 'special.volley.vanish must be a boolean';
    if (v?.delayMs !== undefined && !isNumber(v.delayMs)) return 'special.volley.delayMs must be a number';
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
