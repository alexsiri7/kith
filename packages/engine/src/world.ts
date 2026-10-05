import { GARDEN_TIME_SCALE, type SimClock } from './clock.js';
import { seedStreams, type RngStreams } from './rng.js';

export type EntityId = string;

/** Plain data only, so a world serialises to the same JSON wherever it ran. */
export interface World {
  readonly seed: number;
  readonly clock: SimClock;
  readonly rng: RngStreams;
  readonly selectedKith: EntityId | null;
}

export function createWorld(seed: number): World {
  return {
    seed,
    clock: { simTime: 0, scale: GARDEN_TIME_SCALE },
    rng: seedStreams(seed),
    selectedKith: null,
  };
}

export function serialiseWorld(world: World): string {
  return JSON.stringify(world);
}
