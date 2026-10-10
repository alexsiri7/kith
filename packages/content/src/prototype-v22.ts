import {
  createEntity,
  formatIssues,
  GAME_DAY_MS,
  GARDEN_TIME_SCALE,
  gameTimeParts,
  SCHEMA_VERSION,
  seedStreams,
  type Entity,
  type EntityInit,
  type Migration,
  type TypeId,
  type World,
} from '@kith/engine';
import { z } from 'zod';
import { KITH_STAGES } from './entity-types.js';
import { registry } from './registry.js';

const ITEM_TYPES: Readonly<Record<string, TypeId>> = {
  ball: 'ball',
  doll: 'doll',
  top: 'top',
  cake: 'cake',
  berry: 'berry',
  honey: 'honey',
  shroomB: 'mushroom-brown',
  shroomR: 'mushroom-red',
};

/** Centre of the prototype's `RIVER` span, x 1180 to 1300. */
const RIVER_X = 1240;

/**
 * A v2.2 prototype save, checked for the fields the world model holds today.
 * Brain, language, social state and the rest of the garden are left for the
 * full import (#16) and pass through unchecked.
 */
export const prototypeSave = z.object({
  v: z.literal(1),
  seed: z.int().min(0).max(0xffffffff),
  scale: z.number().positive().optional(),
  simTime: z.number(),
  coins: z.number(),
  presenceMs: z.number(),
  presenceCoins: z.number(),
  playerName: z.string(),
  sel: z.string().nullable().optional(),
  kith: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      stage: z.enum(KITH_STAGES),
      hatchAt: z.number(),
      born: z.number().nullable(),
      dies: z.number().nullable(),
      alive: z.boolean(),
      parents: z.array(z.string()).optional(),
      gen: z.int().optional(),
      health: z.number(),
      x: z.number(),
    }),
  ),
  robot: z.object({ name: z.string(), x: z.number() }),
  items: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      x: z.number(),
      born: z.number(),
      rotten: z.boolean().optional(),
      held: z.boolean().optional(),
    }),
  ),
  log: z.array(
    z.object({
      t: z.number(),
      type: z.string(),
      text: z.string(),
      who: z.string().nullable().optional(),
    }),
  ),
  moments: z.array(
    z.object({ t: z.number(), text: z.string(), id: z.string() }),
  ),
  dreams: z.array(
    z.object({ t: z.number(), who: z.string(), text: z.string() }),
  ),
  pending: z.array(
    z.object({
      id: z.string(),
      since: z.number(),
      until: z.number(),
      wx: z.number(),
    }),
  ),
  bridge: z.boolean(),
});
type PrototypeSave = z.infer<typeof prototypeSave>;

/**
 * Prototype times are epoch milliseconds and game time is `t * scale`.
 * Imported times count game milliseconds from midnight of the earliest game
 * day in the save, which keeps them non-negative and keeps the hour of day.
 */
function simTimeConverter(save: PrototypeSave): (t: number) => number {
  const scale = save.scale ?? 1;
  const times = [
    save.simTime,
    ...save.kith.flatMap((k) => [
      k.hatchAt,
      k.born ?? Infinity,
      k.dies ?? Infinity,
    ]),
    ...save.items.map((item) => item.born),
    ...save.log.map((entry) => entry.t),
    ...save.moments.map((moment) => moment.t),
    ...save.dreams.map((dream) => dream.t),
    ...save.pending.map((night) => night.since),
  ];
  const origin =
    Math.floor((Math.min(...times) * scale) / GAME_DAY_MS) * GAME_DAY_MS;
  return (t) => t * scale - origin;
}

function itemType(prototypeType: string): TypeId {
  const type = ITEM_TYPES[prototypeType];
  if (type === undefined) {
    throw new Error(`Unknown prototype item type "${prototypeType}"`);
  }
  return type;
}

function importEntities(
  save: PrototypeSave,
  toSim: (t: number) => number,
): Record<string, Entity> {
  const inits: EntityInit[] = [
    ...save.kith.map((k) => ({
      id: k.id,
      type: 'kith',
      x: k.x,
      state: {
        name: k.name,
        stage: k.stage,
        alive: k.alive,
        health: k.health,
        hatchAt: toSim(k.hatchAt),
        born: k.born === null ? null : toSim(k.born),
        dies: k.dies === null ? null : toSim(k.dies),
        parents: k.parents ?? [],
        generation: k.gen ?? 1,
      },
    })),
    {
      id: 'tock',
      type: 'tock',
      x: save.robot.x,
      state: { name: save.robot.name },
    },
    ...save.items.map((item) => {
      const type = itemType(item.type);
      return {
        id: item.id,
        type,
        x: item.x,
        state:
          registry.types.get(type)?.category === 'food'
            ? { born: toSim(item.born), rotten: item.rotten ?? false }
            : {},
        ...(item.held === true && { heldByPlayer: true }),
      };
    }),
    { id: 'river', type: 'river', x: RIVER_X, state: { bridge: save.bridge } },
  ];
  return Object.fromEntries(
    inits.map((init) => [init.id, createEntity(registry, init)]),
  );
}

function importPrototypeV22(raw: unknown): World {
  const parsed = prototypeSave.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Not a prototype v2.2 save:\n${formatIssues(parsed.error)
        .map((p) => `- ${p}`)
        .join('\n')}`,
    );
  }
  const save = parsed.data;
  const toSim = simTimeConverter(save);
  const simTime = toSim(save.simTime);
  const { day } = gameTimeParts(simTime);
  const selected =
    save.kith.find((k) => k.id === save.sel) ?? save.kith.find((k) => k.alive);
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: save.seed,
    clock: { simTime, scale: GARDEN_TIME_SCALE },
    // The prototype drew from Math.random, so there is no rng state to keep.
    rng: seedStreams(save.seed),
    entities: importEntities(save, toSim),
    player: {
      name: save.playerName,
      coins: save.coins,
      // Today's allowance and presence count as already paid.
      allowanceDay: day,
      presence: { day, ms: save.presenceMs, coins: save.presenceCoins },
    },
    log: save.log.map((entry) => ({
      simTime: toSim(entry.t),
      type: entry.type,
      text: entry.text,
      who: entry.who ?? null,
    })),
    moments: save.moments.map((moment) => ({
      simTime: toSim(moment.t),
      kith: moment.id,
      text: moment.text,
    })),
    dreams: save.dreams.map((dream) => ({
      simTime: toSim(dream.t),
      kith: save.kith.find((k) => k.name === dream.who)?.id ?? null,
      text: dream.text,
    })),
    pendingNights: save.pending.map((night) => ({
      kith: night.id,
      since: toSim(night.since),
      until: toSim(night.until),
      temperature: night.wx,
    })),
    selectedKith: selected?.id ?? null,
  };
}

/** Imports the prototype's v2.2 localStorage save, which has no schemaVersion. */
export const fromPrototypeV22: Migration = {
  from: 0,
  migrate: importPrototypeV22,
};
