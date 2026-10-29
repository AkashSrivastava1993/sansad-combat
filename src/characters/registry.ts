import { FACTIONS } from '../config';
import { FighterRegistry, type FactionGroup } from '../core/characters/registry';
import type { FighterData } from '../core/characters/types';

// Every JSON file in ./data is loaded as a fighter; the Vite glob is the only bundler-specific part.
const modules = import.meta.glob<FighterData>('./data/*.json', { eager: true, import: 'default' });
const registry = new FighterRegistry(modules, (message) => console.warn(`[characters] ${message}`));


export const getFighters = (): FighterData[] => registry.all();
export const getFighter = (id: string): FighterData | undefined => registry.get(id);

export const factionOf = (f: FighterData): string => f.faction;

export const getFactionGroups = (): FactionGroup[] => registry.factionGroups(Object.keys(FACTIONS));
