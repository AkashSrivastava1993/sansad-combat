import type { SpecialData } from '../characters/types';
import { GAME_WIDTH } from '../config';
import type { Fighter } from './Fighter';
import { clampToArena } from './geometry';
import { Projectile } from './Projectile';

/** What a special does the moment its active phase begins; shields, dashes and stuns act through the fighter's own state instead. */
export type SpecialLaunch =
  | { kind: 'spawn'; projectile: Projectile }
  | { kind: 'teleport'; x: number; facing: 1 | -1 };

/** Works out the effect of `special` starting its active phase for `user` against an opponent standing at `opponentX`. */
export function launchSpecial(user: Fighter, special: SpecialData, opponentX: number): SpecialLaunch | null {
  const { facing } = user;
  if (special.type === 'projectile') {
    const s = special;
    const edge = facing === 1 ? -s.width / 2 : GAME_WIDTH + s.width / 2;
    const onOpponent = clampToArena(opponentX, s.width);
    const x = s.spawnFrom === 'edge' ? edge : s.spawnFrom === 'opponent' ? onOpponent : user.x + facing * s.spawnX;
    const haltX = s.volley ? clampToArena(opponentX - facing * s.volley.standOffX, s.width) : x;
    return { kind: 'spawn', projectile: new Projectile(user, s, x, facing, 'projectile', haltX) };
  }
  if (special.type === 'summon') {
    const x = clampToArena(opponentX - facing * special.offsetX, special.width);
    const shape = { ...special, speed: 0, armMs: special.strikeDelayMs };
    return { kind: 'spawn', projectile: new Projectile(user, shape, x, facing, 'helper') };
  }
  if (special.type === 'teleport') return teleportBehind(user, opponentX, special.behindOffset);
  return null;
}

/** Reappears on the far side of the opponent facing them; stays on this side if the stage edge is in the way. */
function teleportBehind(user: Fighter, opponentX: number, offset: number): SpecialLaunch {
  const { facing } = user;
  const width = user.data.body.width;
  const behind = opponentX + facing * offset;
  if (behind >= width / 2 && behind <= GAME_WIDTH - width / 2) {
    return { kind: 'teleport', x: behind, facing: facing === 1 ? -1 : 1 };
  }
  return { kind: 'teleport', x: clampToArena(opponentX - facing * offset, width), facing };
}
