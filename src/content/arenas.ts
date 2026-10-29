import { texts } from './texts';

/** Fight arenas in menu order; their names, banners, placards and ticker lines live in texts.json. */
export const ARENA_IDS = ['sansad', 'indiagate', 'jantarmantar'] as const;
export type ArenaId = (typeof ARENA_IDS)[number];
export const DEFAULT_ARENA: ArenaId = 'sansad';

export const arenaText = (id: ArenaId): (typeof texts.arenas)[ArenaId] => texts.arenas[id];
