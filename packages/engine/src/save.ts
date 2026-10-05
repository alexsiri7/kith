import { z } from 'zod';
import {
  checkEntity,
  entitySchema,
  formatIssues,
  type Entity,
} from './entity.js';
import type { Registry } from './registry.js';
import { SCHEMA_VERSION, type EntityId, type World } from './world.js';

export interface Migration {
  /** The schema version this migration upgrades from, by exactly one. */
  readonly from: number;
  migrate(save: unknown): unknown;
}

/** A save without `schemaVersion` is version 0: the prototype v2.2 localStorage format. */
export function saveVersion(save: unknown): number {
  if (typeof save !== 'object' || save === null || Array.isArray(save)) {
    throw new Error('Save must be a JSON object');
  }
  if (!('schemaVersion' in save)) return 0;
  const version = save.schemaVersion;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    throw new Error(
      `Save schemaVersion must be a non-negative integer, got ${JSON.stringify(version)}`,
    );
  }
  return version;
}

/** Applies `migrations` in order until the save is at `SCHEMA_VERSION`. */
export function migrate(
  save: unknown,
  migrations: readonly Migration[],
): unknown {
  let version = saveVersion(save);
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Save schemaVersion ${version} is newer than this build (${SCHEMA_VERSION})`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const migration = migrations.find((m) => m.from === version);
    if (migration === undefined) {
      throw new Error(`No migration from schemaVersion ${version}`);
    }
    save = migration.migrate(save);
    const next = saveVersion(save);
    if (next !== version + 1) {
      throw new Error(
        `Migration from schemaVersion ${version} produced version ${next}, expected ${version + 1}`,
      );
    }
    version = next;
  }
  return save;
}

const uint32 = z.int().min(0).max(0xffffffff);
const simTime = z.number().min(0);
const entityId = z.string();

const rngState = z.tuple([uint32, uint32, uint32, uint32]);

const worldSchema: z.ZodType<World> = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  seed: uint32,
  clock: z.object({ simTime, scale: z.number().positive() }),
  rng: z.object({
    weather: rngState,
    genetics: rngState,
    behaviour: rngState,
    spawning: rngState,
  }),
  entities: z.record(entityId, entitySchema),
  player: z.object({
    name: z.string(),
    coins: z.number(),
    allowanceDay: z.int(),
    presence: z.object({
      day: z.int(),
      ms: z.number().min(0),
      coins: z.number(),
    }),
  }),
  log: z.array(
    z.object({
      simTime,
      type: z.string(),
      text: z.string(),
      who: entityId.nullable(),
    }),
  ),
  moments: z.array(z.object({ simTime, kith: entityId, text: z.string() })),
  dreams: z.array(
    z.object({ simTime, kith: entityId.nullable(), text: z.string() }),
  ),
  pendingNights: z.array(
    z.object({
      kith: entityId,
      since: simTime,
      until: simTime,
      temperature: z.number(),
    }),
  ),
  selectedKith: entityId.nullable(),
});

/**
 * Checks a current-version save against the world schema and the registry,
 * filling entity state defaults. Throws one error listing every problem.
 */
export function validateWorld(raw: unknown, registry: Registry): World {
  const parsed = worldSchema.safeParse(raw);
  if (!parsed.success) throw invalidWorld(formatIssues(parsed.error));
  const problems: string[] = [];
  const entities: Record<EntityId, Entity> = {};
  for (const [key, entity] of Object.entries(parsed.data.entities)) {
    const checked = checkEntity(registry, key, entity);
    problems.push(...checked.problems);
    entities[key] = { ...entity, state: checked.state };
  }
  if (problems.length > 0) throw invalidWorld(problems);
  return { ...parsed.data, entities };
}

function invalidWorld(problems: readonly string[]): Error {
  return new Error(
    `Invalid world:\n${problems.map((p) => `- ${p}`).join('\n')}`,
  );
}

export function deserialiseWorld(
  json: string,
  registry: Registry,
  migrations: readonly Migration[] = [],
): World {
  return validateWorld(migrate(JSON.parse(json), migrations), registry);
}
