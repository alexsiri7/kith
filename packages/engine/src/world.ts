import { GARDEN_TIME_SCALE, type SimClock } from './clock.js';
import type { Entity } from './entity.js';
import { seedStreams, type RngStreams } from './rng.js';

export type EntityId = string;

export const SCHEMA_VERSION = 1;

/** Days are game days: the engine has no real clock. */
export interface Player {
  readonly name: string;
  readonly coins: number;
  readonly allowanceDay: number;
  readonly presence: {
    readonly day: number;
    readonly ms: number;
    readonly coins: number;
  };
}

export interface LogEntry {
  readonly simTime: number;
  readonly type: string;
  readonly text: string;
  readonly who: EntityId | null;
}

export interface Moment {
  readonly simTime: number;
  readonly kith: EntityId;
  readonly text: string;
}

export interface Dream {
  readonly simTime: number;
  readonly kith: EntityId | null;
  readonly text: string;
}

export interface PendingNight {
  readonly kith: EntityId;
  readonly since: number;
  readonly until: number;
  readonly temperature: number;
}

/** Plain data only, so a world serialises to the same JSON wherever it ran. */
export interface World {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly seed: number;
  readonly clock: SimClock;
  readonly rng: RngStreams;
  /** Each key equals its entity's `id`. */
  readonly entities: Readonly<Record<EntityId, Entity>>;
  readonly player: Player;
  readonly log: readonly LogEntry[];
  readonly moments: readonly Moment[];
  readonly dreams: readonly Dream[];
  readonly pendingNights: readonly PendingNight[];
  readonly selectedKith: EntityId | null;
}

export function createWorld(seed: number): World {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    clock: { simTime: 0, scale: GARDEN_TIME_SCALE },
    rng: seedStreams(seed),
    entities: {},
    player: {
      name: '',
      coins: 120,
      allowanceDay: 0,
      presence: { day: 0, ms: 0, coins: 0 },
    },
    log: [],
    moments: [],
    dreams: [],
    pendingNights: [],
    selectedKith: null,
  };
}

export function serialiseWorld(world: World): string {
  return JSON.stringify(world);
}
