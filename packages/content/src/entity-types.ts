import type { AffordanceDef, EntityType } from '@kith/engine';
import { z } from 'zod';

// Body sizes and salience are placeholders until the brain (#8) and art (#17)
// tune them.

const foodState = z.object({
  born: z.number().default(0),
  rotten: z.boolean().default(false),
});

const toyState = z.object({});

const handheld = { carryable: true, draggable: true } as const;

const HOUR_MS = 3_600_000;

function item(
  category: 'food' | 'toy',
  id: string,
  meaning: string,
  body: EntityType['body'],
  salience: number,
  own: Pick<EntityType, 'state' | 'affordances'> = {
    state: category === 'food' ? foodState : toyState,
    affordances: [],
  },
): EntityType {
  return {
    id,
    category,
    meaning,
    body,
    perception: { salience },
    sprite: id,
    ...own,
  };
}

const spinTop: AffordanceDef = {
  verb: 'spin',
  actors: ['kith', 'player'],
  approach: 'touch',
  outcomes: [
    {
      effects: [
        { kind: 'setState', field: 'spinUntil', value: { sum: ['now', 8000] } },
      ],
      valence: 0.1,
    },
  ],
};

const eatRedMushroom: AffordanceDef = {
  verb: 'eat',
  actors: ['kith'],
  approach: 'touch',
  outcomes: [
    {
      effects: [
        { kind: 'remove' },
        { kind: 'need', need: 'hunger', delta: -0.15 },
        { kind: 'emit', event: 'ate' },
        { kind: 'sick', ms: 2 * HOUR_MS },
        { kind: 'health', delta: -0.08 },
        { kind: 'need', need: 'fear', delta: 0.3 },
        { kind: 'need', need: 'hunger', delta: 0.2 },
        { kind: 'emit', event: 'sick' },
      ],
      valence: -0.6,
    },
  ],
};

const pokeHive: AffordanceDef = {
  verb: 'poke',
  actors: ['kith'],
  approach: 'touch',
  outcomes: [
    {
      chance: { if: { gt: [{ state: 'honey' }, 0] }, then: 1, else: 0 },
      effects: [
        { kind: 'incState', field: 'honey', by: -1 },
        { kind: 'need', need: 'hunger', delta: -0.3 },
        { kind: 'need', need: 'bored', delta: -0.4 },
        { kind: 'emit', event: 'gotHoney' },
      ],
      valence: 0.3,
    },
    {
      effects: [{ kind: 'incState', field: 'anger', by: 0.45, range: [0, 1] }],
      valence: 0,
    },
    {
      chance: {
        sum: [
          { if: { gt: [{ state: 'honey' }, 0] }, then: 0.3, else: 0.55 },
          { product: [0.5, { state: 'anger' }] },
        ],
      },
      effects: [
        { kind: 'health', delta: -0.05 },
        { kind: 'need', need: 'fear', delta: 0.5 },
        { kind: 'swarm', ms: 6000 },
        { kind: 'flee', ms: 8000 },
        { kind: 'emit', event: 'stung' },
      ],
      valence: -0.7,
    },
  ],
};

const pokeCactus: AffordanceDef = {
  verb: 'poke',
  actors: ['kith'],
  approach: 'touch',
  outcomes: [
    {
      chance: 0.85,
      effects: [
        { kind: 'health', delta: -0.02 },
        { kind: 'need', need: 'fear', delta: 0.3 },
        { kind: 'emit', event: 'pricked' },
      ],
      valence: -0.55,
      otherwise: {
        effects: [{ kind: 'need', need: 'bored', delta: -0.3 }],
        valence: 0.05,
      },
    },
  ],
};

const pullLever: AffordanceDef = {
  verb: 'use',
  actors: ['player', 'robot'],
  approach: 'touch',
  outcomes: [
    {
      effects: [
        {
          kind: 'setState',
          of: { linked: 'river' },
          field: 'bridge',
          value: { test: { not: { is: 'bridge', of: { linked: 'river' } } } },
        },
      ],
      valence: 0,
    },
  ],
};

const useFoodMachine: AffordanceDef = {
  verb: 'use',
  actors: ['player', 'robot', 'kith'],
  approach: 'touch',
  available: { gt: [{ state: 'stock' }, 0] },
  outcomes: [
    {
      effects: [
        { kind: 'incState', field: 'stock', by: -1 },
        { kind: 'spawn', type: 'cake' },
      ],
      valence: 0.4,
    },
  ],
};

export const KITH_STAGES = [
  'egg',
  'baby',
  'child',
  'adult',
  'elder',
  'dead',
] as const;

export const NEEDS = [
  'hunger',
  'cold',
  'tired',
  'bored',
  'lonely',
  'fear',
] as const;

export const ENTITY_TYPES: readonly EntityType[] = [
  {
    id: 'kith',
    category: 'kith',
    meaning: 'friend',
    state: z.object({
      name: z.string().default(''),
      stage: z.enum(KITH_STAGES).default('egg'),
      alive: z.boolean().default(true),
      health: z.number().default(1),
      hatchAt: z.number().nullable().default(null),
      born: z.number().nullable().default(null),
      dies: z.number().nullable().default(null),
      parents: z.array(z.string()).default([]),
      generation: z.int().default(1),
      needs: z
        .object(
          Object.fromEntries(
            NEEDS.map((need) => [need, z.number().min(0).max(1)]),
          ),
        )
        .default({
          hunger: 0.3,
          cold: 0,
          tired: 0.2,
          bored: 0.3,
          lonely: 0.3,
          fear: 0,
        }),
      sickUntil: z.number().default(0),
      fleeing: z
        .object({ from: z.string(), until: z.number() })
        .nullable()
        .default(null),
      biases: z
        .array(
          z.object({
            verb: z.string(),
            until: z.number(),
            strength: z.number(),
          }),
        )
        .default([]),
      lexicon: z
        .record(
          z.string(),
          z.object({ meaning: z.string(), strength: z.number() }),
        )
        .default({}),
    }),
    body: { w: 24, h: 28 },
    perception: { salience: 1, moving: true },
    affordances: [],
    sprite: 'kith',
  },
  {
    id: 'tock',
    category: 'robot',
    meaning: 'robot',
    state: z.object({ name: z.string().default('Tock') }),
    body: { w: 26, h: 36 },
    perception: { salience: 0.6, moving: true },
    affordances: [],
    sprite: 'tock',
  },
  item('toy', 'ball', 'ball', { w: 16, h: 16, ...handheld }, 0.7),
  item('toy', 'doll', 'doll', { w: 18, h: 24, ...handheld }, 0.5),
  item('toy', 'top', 'toy', { w: 18, h: 18, ...handheld }, 0.5, {
    state: z.object({ spinUntil: z.number().default(0) }),
    affordances: [spinTop],
  }),
  item('food', 'cake', 'food', { w: 18, h: 14, ...handheld }, 0.6),
  item('food', 'berry', 'food', { w: 10, h: 10, ...handheld }, 0.5),
  item('food', 'honey', 'honey', { w: 14, h: 14, ...handheld }, 0.6),
  item('food', 'mushroom-brown', 'mushroom', { w: 12, h: 12 }, 0.4),
  item('food', 'mushroom-red', 'mushroom', { w: 12, h: 12 }, 0.5, {
    state: foodState,
    affordances: [eatRedMushroom],
  }),
  {
    id: 'river',
    category: 'terrain',
    meaning: 'water',
    state: z.object({ bridge: z.boolean().default(false) }),
    body: { w: 120, h: 40 },
    perception: { salience: 0.8 },
    affordances: [],
    zone: { kind: 'hazard', passableWhen: 'bridge' },
    sprite: 'river',
  },
  {
    id: 'beehive',
    category: 'hazard',
    meaning: 'bees',
    state: z.object({
      honey: z.int().min(0).default(2),
      anger: z.number().min(0).max(1).default(0),
      swarm: z
        .object({ victim: z.string(), until: z.number() })
        .nullable()
        .default(null),
    }),
    body: { w: 30, h: 34 },
    perception: { salience: 0.8 },
    affordances: [pokeHive],
    sprite: 'beehive',
  },
  {
    id: 'cactus',
    category: 'plant',
    meaning: 'cactus',
    state: z.object({}),
    body: { w: 28, h: 48 },
    perception: { salience: 0.6 },
    affordances: [pokeCactus],
    sprite: 'cactus',
  },
  {
    id: 'lever',
    category: 'gadget',
    // The river whose bridge this lever raises and lowers.
    state: z.object({ river: z.string().default('river') }),
    body: { w: 12, h: 30 },
    perception: { salience: 0.4 },
    affordances: [pullLever],
    sprite: 'lever',
  },
  {
    id: 'food-machine',
    category: 'gadget',
    meaning: 'machine',
    state: z.object({ stock: z.int().min(0).default(3) }),
    body: { w: 36, h: 52 },
    perception: { salience: 0.6 },
    affordances: [useFoodMachine],
    sprite: 'food-machine',
  },
];
