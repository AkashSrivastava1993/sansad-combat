// Prints a GLB's animation clips and size, and a ready-to-paste `model` block for a fighter's JSON.
// Usage: node scripts/inspect-glb.mjs public/assets/models/didi.glb didi
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [file, fighterId] = process.argv.slice(2);
if (!file || !fighterId) {
  console.error('Usage: node scripts/inspect-glb.mjs <file.glb> <fighter-id>');
  process.exit(1);
}

const buf = readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a binary glTF (.glb) file.');
const jsonLength = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
const fighter = JSON.parse(readFileSync(new URL(`../src/characters/data/${fighterId}.json`, import.meta.url), 'utf8'));

// Bounds of every mesh in world space, from the POSITION accessors' min/max and the node transforms.
const mul = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
};
const local = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
};
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
const visit = (index, parent) => {
  const node = gltf.nodes[index];
  const world = mul(parent, local(node));
  if (node.mesh !== undefined) {
    for (const prim of gltf.meshes[node.mesh].primitives) {
      const acc = gltf.accessors[prim.attributes.POSITION];
      if (!acc?.min || !acc?.max) continue;
      for (let i = 0; i < 8; i++) {
        const p = [i & 1 ? acc.max[0] : acc.min[0], i & 2 ? acc.max[1] : acc.min[1], i & 4 ? acc.max[2] : acc.min[2]];
        for (let a = 0; a < 3; a++) {
          const v = world[a] * p[0] + world[4 + a] * p[1] + world[8 + a] * p[2] + world[12 + a];
          min[a] = Math.min(min[a], v);
          max[a] = Math.max(max[a], v);
        }
      }
    }
  }
  for (const child of node.children ?? []) visit(child, world);
};
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (const root of gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []) visit(root, identity);

const height = max[1] - min[1];
// A figure stands body.height * 1.08 game px tall; one world unit is 100 px.
const wanted = (fighter.body.height * 1.08) / 100;
const scale = Number((wanted / height).toFixed(3));
const groundOffset = Number((-min[1] * scale).toFixed(3));

const clips = (gltf.animations ?? []).map((a) => a.name ?? '(unnamed)');
const guess = {
  idle: /idle|stand|breath/i,
  walk: /walk|run|move/i,
  jump: /jump|hop/i,
  punch: /punch|jab|hook|attack|strike/i,
  kick: /kick/i,
  block: /block|guard|defen/i,
  hit: /hit|damage|react|hurt/i,
  ko: /death|die|ko|fall|dead/i,
  win: /win|victory|dance|cheer|celebrat/i,
};
const animations = {};
for (const [action, re] of Object.entries(guess)) {
  const clip = clips.find((c) => re.test(c));
  if (clip) animations[action] = clip;
}

console.log(`${basename(file)}: ${(buf.length / 1024).toFixed(0)} KB`);
console.log(`Clips (${clips.length}): ${clips.join(', ') || 'none'}`);
console.log(`Size: ${(max[0] - min[0]).toFixed(2)} x ${height.toFixed(2)} x ${(max[2] - min[2]).toFixed(2)} (x y z, glTF units); feet at y = ${min[1].toFixed(2)}`);
if (!animations.idle) console.warn('\nNo clip looks like "idle": map one by hand, it is required.');
const missing = Object.keys(guess).filter((a) => !animations[a]);
if (missing.length) console.warn(`No clip guessed for: ${missing.join(', ')} (they fall back to idle or another clip).`);
console.log(`\nAdd this to src/characters/data/${fighterId}.json:\n`);
console.log(`  "model": ${JSON.stringify({ url: `assets/models/${basename(file)}`, scale, groundOffset, animations }, null, 2).replace(/\n/g, '\n  ')},`);
