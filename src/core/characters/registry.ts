import type { FighterData } from './types';
import { validateFighter } from './validate';

export interface FactionGroup {
  faction: string;
  fighters: FighterData[];
}

/** Validated fighter definitions, keyed by id. Invalid entries are skipped and reported through `warn`. */
export class FighterRegistry {
  private readonly byId = new Map<string, FighterData>();

  /** `sources` maps a label (e.g. the JSON file path) to its parsed contents. */
  constructor(sources: Record<string, FighterData>, warn: (message: string) => void = () => {}) {
    for (const [label, data] of Object.entries(sources)) {
      const error = validateFighter(data);
      if (error) {
        warn(`Skipping ${label}: ${error}`);
        continue;
      }
      this.byId.set(data.id, data);
    }
  }

  all(): FighterData[] {
    return [...this.byId.values()];
  }

  get(id: string): FighterData | undefined {
    return this.byId.get(id);
  }

  /** Groups fighters by faction: those named in `order` first (in that order), then any others. */
  factionGroups(order: readonly string[]): FactionGroup[] {
    const groups = new Map<string, FighterData[]>(order.map((name) => [name, []]));
    for (const f of this.byId.values()) {
      if (!groups.has(f.faction)) groups.set(f.faction, []);
      groups.get(f.faction)!.push(f);
    }
    return [...groups].filter(([, list]) => list.length > 0).map(([faction, list]) => ({ faction, fighters: list }));
  }
}
