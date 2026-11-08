import {
  GAME_DAY_MS,
  GARDEN_TIME_SCALE,
  languageShape,
  mindShape,
  socialShape,
  type AffordanceDef,
  type EntityType,
  type Expr,
  type LifecycleDef,
} from '@kith/engine';
import { z } from 'zod';
import { BOARD_WORDS } from './meanings.js';
import { KITH_LANGUAGE, KITH_MIND, KITH_SOCIAL } from './tunables.js';

// Body sizes and salience are placeholders until art (#17) tunes them; the
// brain does not weigh salience yet.

const foodState = z.object({
  born: z.number().default(0),
  rotten: z.boolean().default(false),
});

const toyState = z.object({});

const handheld = { carryable: true, draggable: true } as const;

const HOUR_MS = 3_600_000;
/** The prototype counted these durations in real milliseconds. */
const REAL = GARDEN_TIME_SCALE;

const age: Expr = { sum: ['now', { product: [-1, { state: 'born' }] }] };

/** Food rots three garden days after it appeared, and is gone after five. */
const rots: LifecycleDef = [
  {
    when: { all: [{ not: { is: 'rotten' } }, { gt: [age, 3 * GAME_DAY_MS] }] },
    effects: [{ kind: 'setState', field: 'rotten', value: true }],
  },
  {
    when: { all: [{ is: 'rotten' }, { gt: [age, 5 * GAME_DAY_MS] }] },
    effects: [{ kind: 'remove' }],
  },
];

/** The prototype's tree, where a garden's `shade` stands. */
export const TREE_X = 380;

/** The prototype's mushroom spots, as offsets from the shade at the tree. */
export const SHADY_SPOTS = [320, 450, 1950, 2160, 1420].map((x) => x - TREE_X);

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
  const food = category === 'food';
  return {
    id,
    category,
    meaning,
    // In the river, toys float to the bank and food sinks.
    body: { ...body, ...(food ? { sinks: true } : { floats: true }) },
    perception: { salience },
    sprite: id,
    ...own,
    ...(food ? { lifecycle: rots } : {}),
  };
}

const spinTop: AffordanceDef = {
  verb: 'spin',
  actors: ['kith', 'player'],
  approach: 'touch',
  outcomes: [
    {
      effects: [
        {
          kind: 'setState',
          field: 'spinUntil',
          value: { sum: ['now', 8_000 * REAL] },
        },
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
        { kind: 'swarm', ms: 6_000 * REAL },
        { kind: 'flee', ms: 8_000 * REAL },
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

const useWordBoard: AffordanceDef = {
  verb: 'use',
  actors: ['player', 'kith'],
  approach: 'touch',
  outcomes: [
    {
      effects: [
        {
          kind: 'lesson',
          words: BOARD_WORDS,
          strength: { player: 0.6, kith: 0.9 },
          within: 320,
          ms: 12_000 * REAL,
        },
      ],
      valence: 0.1,
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
        { kind: 'spawn', type: 'cake', computed: { born: 'now' } },
      ],
      valence: 0.4,
    },
  ],
};

/** Keeping another Kith company; being near is what does it good. */
const keepCompany: AffordanceDef = {
  verb: 'social',
  actors: ['kith'],
  approach: 'follow',
  available: {
    all: [{ is: 'alive' }, { not: { state: 'stage', oneOf: ['egg'] } }],
  },
  duration: [10_000 * REAL, 20_000 * REAL],
  outcomes: [{ effects: [], valence: 0 }],
};

const mushroomSpot = {
  offsets: SHADY_SPOTS,
  spread: 25,
  computed: { born: 'now' },
} as const;

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
      ...mindShape,
      ...languageShape,
      ...socialShape,
      name: z.string().default(''),
      stage: z.enum(KITH_STAGES).default('egg'),
      dies: z.number().nullable().default(null),
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
    }),
    body: { w: 24, h: 28 },
    perception: { salience: 1, moving: true },
    affordances: [keepCompany],
    mind: KITH_MIND,
    language: KITH_LANGUAGE,
    social: KITH_SOCIAL,
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
    zone: {
      kind: 'hazard',
      passableWhen: 'bridge',
      fallIn: {
        effects: [
          { kind: 'need', need: 'cold', delta: 0.35 },
          { kind: 'need', need: 'fear', delta: 0.6 },
          { kind: 'health', delta: -0.06 },
          { kind: 'emit', event: 'fellIn' },
        ],
        valence: -0.4,
        ms: 7_000 * REAL,
        continuous: [{ kind: 'need', need: 'cold', delta: 0.25 / REAL }],
      },
      current: { speed: 25 / REAL, bank: 14 },
    },
    lifecycle: [
      {
        when: { all: [{ weather: 'storm' }, { is: 'bridge' }] },
        effects: [
          { kind: 'setState', field: 'bridge', value: false },
          { kind: 'emit', event: 'bridgeRaised' },
        ],
      },
    ],
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
    lifecycle: [
      {
        everyMs: 6 * HOUR_MS,
        when: { gt: [{ weather: 'temp' }, 6] },
        effects: [{ kind: 'incState', field: 'honey', by: 1, range: [0, 2] }],
      },
    ],
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
    id: 'word-board',
    category: 'gadget',
    state: z.object({
      /** The index into its words of the word it shows. */
      shown: z.int().min(0).default(0),
      shownUntil: z.number().default(0),
    }),
    body: { w: 30, h: 44, draggable: true },
    perception: { salience: 0.5 },
    affordances: [useWordBoard],
    sprite: 'word-board',
  },
  {
    id: 'food-machine',
    category: 'gadget',
    meaning: 'machine',
    state: z.object({ stock: z.int().min(0).default(3) }),
    body: { w: 36, h: 52 },
    perception: { salience: 0.6 },
    affordances: [useFoodMachine],
    lifecycle: [
      {
        everyMs: GAME_DAY_MS,
        effects: [{ kind: 'setState', field: 'stock', value: 3 }],
      },
    ],
    sprite: 'food-machine',
  },
  {
    // One slot of the carrot row.
    id: 'carrot',
    category: 'food',
    meaning: 'food',
    state: z.object({ growth: z.number().min(0).max(1).default(0.2) }),
    body: { w: 14, h: 20 },
    perception: { salience: 0.5 },
    affordances: [],
    lifecycle: [
      {
        when: { gt: [{ weather: 'temp' }, 4] },
        perHour: true,
        effects: [
          { kind: 'incState', field: 'growth', by: 1 / 8, range: [0, 1] },
        ],
      },
    ],
    sprite: 'carrot',
  },
  {
    id: 'berry-bush',
    category: 'plant',
    meaning: 'food',
    state: z.object({ berries: z.int().min(0).max(4).default(0) }),
    body: { w: 40, h: 30 },
    perception: { salience: 0.6 },
    affordances: [],
    lifecycle: [
      {
        everyMs: 3 * HOUR_MS,
        when: { gt: [{ weather: 'temp' }, 4] },
        effects: [{ kind: 'incState', field: 'berries', by: 1, range: [0, 4] }],
      },
    ],
    sprite: 'berry-bush',
  },
  {
    id: 'shelter',
    category: 'structure',
    meaning: 'shelter',
    state: z.object({
      integrity: z.number().min(0).max(1).default(1),
      damaged: z.boolean().default(false),
    }),
    body: { w: 60, h: 50 },
    perception: { salience: 0.7 },
    affordances: [],
    // Storms wear it down, and it mends itself slowly, as in the prototype.
    lifecycle: [
      {
        when: { weather: 'storm' },
        perHour: true,
        effects: [
          { kind: 'incState', field: 'integrity', by: -0.06, range: [0, 1] },
        ],
      },
      {
        when: {
          all: [
            { not: { is: 'damaged' } },
            { not: { gt: [{ state: 'integrity' }, 0.3] } },
          ],
        },
        effects: [
          { kind: 'setState', field: 'damaged', value: true },
          { kind: 'emit', event: 'shelterDamaged' },
        ],
      },
      {
        when: {
          all: [{ is: 'damaged' }, { gt: [{ state: 'integrity' }, 0.3] }],
        },
        effects: [{ kind: 'setState', field: 'damaged', value: false }],
      },
      {
        perHour: true,
        effects: [
          { kind: 'incState', field: 'integrity', by: 0.03, range: [0, 1] },
        ],
      },
    ],
    sprite: 'shelter',
  },
  {
    // Where mushrooms come up: half a garden day apart while fewer than four
    // grow, at one of the shady spots.
    id: 'shade',
    category: 'terrain',
    state: z.object({}),
    body: { w: 1, h: 1 },
    perception: { salience: 0 },
    affordances: [],
    lifecycle: [
      {
        everyMs: 12 * HOUR_MS,
        when: { lt: [{ count: ['mushroom-brown', 'mushroom-red'] }, 4] },
        chance: 0.5,
        effects: [{ kind: 'spawn', type: 'mushroom-brown', ...mushroomSpot }],
        otherwise: [{ kind: 'spawn', type: 'mushroom-red', ...mushroomSpot }],
      },
    ],
    sprite: 'shade',
  },
];
