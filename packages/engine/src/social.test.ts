import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AffordanceDef } from './affordance.js';
import { decide, wish } from './brain.js';
import { createEntity, type EntityInit, type EntityType } from './entity.js';
import type { GameEvent } from './event.js';
import { languageShape, type LanguageDef } from './language.js';
import { mindShape, mindState, type MindDef } from './mind.js';
import { createRegistry } from './registry.js';
import { socialShape, socialState, type Bond } from './relationship.js';
import { believe, bondOf, socialStep, type SocialDef } from './social.js';
import { catchUp, step, type Presence } from './step.js';
import { createWorld, type World } from './world.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = 100_000;

const still = { awake: 0, asleep: 0 };
const NEEDS = ['hunger', 'bored', 'lonely', 'fear', 'tired'] as const;

const mind: MindDef = {
  needs: Object.fromEntries(NEEDS.map((need) => [need, still])),
  health: {
    harm: [{ need: 'hunger', above: 0.99, perHour: 1_000 }],
    heal: { perHour: 0, below: {} },
  },
  movement: {
    speed: {},
    defaultSpeed: 10,
    slow: [],
    sickFactor: 0.5,
    arriveWithin: 14,
    bounds: [0, 4000],
    fleeDistance: 200,
    bank: { stop: 8, climbOut: 14 },
  },
  sleep: {
    fallAsleepAbove: { tired: 0.92 },
    wake: { below: { tired: 0.06 }, above: { fear: 0.6 } },
  },
  attention: {
    range: 4000,
    attend: 3,
    curiosity: 0,
    distance: 1 / 2500,
    avoidBelow: -0.35,
  },
  decision: { noise: {}, defaultNoise: 0, pursueMs: 60_000 },
  activities: {
    idle: { base: 0.05, ms: [10_000, 10_000] },
    wander: { base: 0, curiosity: 0, range: 0, ms: [20_000, 20_000] },
    sleep: { whenAbove: { tired: 0.45 } },
    approach: { ms: 30_000, relief: {} },
  },
  instincts: {},
  learning: {
    rate: 0.3,
    minNeed: 0.2,
    gain: 4,
    range: [-0.3, 1],
    values: [-0.5, 1.2],
    skill: { learned: 0.5, unlearned: 0.15 },
  },
  zoneFear: { base: 0.35, curiosity: 0.3 },
  feedback: {
    windowMs: 60_000,
    rate: 0.3,
    tickle: {
      reward: 0.6,
      needs: {},
      comfort: { when: { fear: 0.4 }, needs: {} },
    },
    scold: {
      reward: -0.7,
      needs: {},
      opinion: -0.25,
      zone: { within: 90, opinion: -0.15 },
    },
  },
  biases: {
    wish: { ms: HOUR, strength: 0.5 },
    cortex: { ms: 60_000, strength: 1.5 },
  },
};

const language: LanguageDef = {
  teaching: { rate: 0.25, speakable: 0.3, speakableCoins: 0 },
  memory: {
    decayPerHour: 0,
    keepAbove: 0.8,
    consolidatePerHour: 0,
    consolidateAbove: 0.5,
  },
  speech: {
    maxWords: {},
    defaultMaxWords: 6,
    properNouns: [],
    babble: { words: [1, 1], repeat: 0, exclaim: 0 },
    sayMs: 5_000,
  },
  chatter: {
    every: [DAY, DAY],
    feelAbove: 0.55,
    feelings: {},
    callPlayer: [],
    mention: 0,
    nearby: 160,
    quiet: 1,
    hearWithin: 180,
    spreadAbove: 0.5,
    strength: 0.3,
    parentStrength: 0.45,
  },
  overhear: { within: 140, perHour: 0, parent: 1.5 },
  attention: {
    noticeWithin: 250,
    lookMs: 4_000,
    attendMs: 8_000,
    attendWithin: 320,
  },
  hearing: {
    maxWords: 12,
    wakeBelow: {},
    plain: 1,
    pointed: 1,
    attending: 1.6,
    bystanders: 0.5,
    bystanderWithin: 220,
    ignore: [],
    feelAbove: 0.6,
  },
  commands: {},
  obey: {
    base: 0.25,
    trust: 0.45,
    trait: 'agreeable',
    perTrait: 0.3,
    needs: {},
    ms: 30_000,
    strength: 1.5,
  },
};

const social: SocialDef = {
  firstBond: {
    kith: { familiarity: 0, affection: 0.1, trust: 0.2 },
    robot: { familiarity: 0, affection: 0.05, trust: 0.15 },
  },
  player: {
    watched: 0.01,
    tickle: { affection: 0.015, trust: 0.008 },
    comfort: { affection: 0.05, trust: 0.05 },
    scold: { trust: -0.03 },
  },
  company: {
    kith: {
      within: 140,
      familiarity: 0.05,
      ease: { need: 'lonely', perHour: 0.25, base: 0.4 },
      affection: {
        perHour: 0.015,
        sociability: 0.4,
        afraid: { need: 'fear', above: 0.5, factor: 0.3 },
      },
    },
    robot: {
      within: 140,
      familiarity: 0.03,
      ease: { need: 'lonely', perHour: 0.08, base: 0.3 },
      affection: { perHour: 0.006 },
    },
  },
  warning: {
    within: 260,
    below: -0.4,
    everyMs: 60_000,
    refuse: ['no', 'bad'],
    heed: { rate: 0.15, base: 0.6, worded: 1.4 },
    teach: 0.4,
    abandon: { below: -0.3, trust: 0.6 },
    coins: 20,
  },
  family: {
    stage: 'adult',
    within: 70,
    affection: 0.55,
    content: {
      below: { hunger: 0.45, fear: 0.2, tired: 0.7, lonely: 0.6 },
      health: 0.6,
    },
    cooldownMs: 9 * DAY,
    fewerThan: 6,
    meanMs: 3 * HOUR,
    coins: 30,
    egg: {
      hatchMs: DAY,
      hatchInto: 'baby',
      nest: { meaning: 'shelter', offset: 40 },
      affection: 0.6,
    },
    genome: {
      mutate: 0.15,
      traits: {
        curiosity: { range: [0, 1], amount: 0.4 },
        learnRate: { range: [0.6, 1.5], amount: 0.4 },
      },
    },
    inherit: {
      player: {
        trust: { base: 0.1, share: 0.6 },
        affection: { base: 0.05, share: 0.4 },
      },
      bonds: { robot: { trust: { base: 0.1, share: 0.5 } } },
      parent: { affection: 0.6, trust: 0.6 },
      zones: 0.3,
      beliefs: {
        about: ['you', 'river'],
        above: 0.3,
        feel: 0.7,
        strength: 0.35,
      },
    },
  },
  grief: {
    closeAbove: 0.3,
    needs: { lonely: 0.3, fear: 0.2 },
    perAffection: { lonely: 0.5 },
    belief: { about: 'night', feel: -0.3 },
  },
};

const keepCompany: AffordanceDef = {
  verb: 'social',
  actors: ['kith'],
  approach: 'follow',
  available: {
    all: [{ is: 'alive' }, { not: { state: 'stage', oneOf: ['egg'] } }],
  },
  outcomes: [{ effects: [], valence: 0 }],
};

const kith: EntityType = {
  id: 'kith',
  category: 'kith',
  meaning: 'friend',
  state: z.object({
    ...mindShape,
    ...languageShape,
    ...socialShape,
    name: z.string().default(''),
    stage: z.enum(['egg', 'baby', 'adult']).default('egg'),
    needs: z
      .object(Object.fromEntries(NEEDS.map((need) => [need, z.number()])))
      .default({ hunger: 0, bored: 0, lonely: 0, fear: 0, tired: 0 }),
  }),
  body: { w: 24, h: 28 },
  perception: { salience: 1, moving: true },
  affordances: [keepCompany],
  mind,
  language,
  social,
  sprite: 'kith',
};

const thing = (
  id: string,
  category: EntityType['category'],
  meaning?: string,
  extra: Partial<EntityType> = {},
): EntityType => ({
  id,
  category,
  ...(meaning !== undefined && { meaning }),
  state: z.object({}),
  body: { w: 10, h: 10 },
  perception: { salience: 0.5 },
  affordances: [],
  sprite: id,
  ...extra,
});

const pokeHive: AffordanceDef = {
  verb: 'poke',
  actors: ['kith'],
  approach: 'touch',
  outcomes: [{ effects: [], valence: 0 }],
};

const registry = createRegistry({
  types: [
    kith,
    thing('tock', 'robot', 'robot'),
    thing('beehive', 'hazard', 'bees', { affordances: [pokeHive] }),
    thing('hut', 'structure', 'shelter'),
    thing('river', 'terrain', 'water', {
      body: { w: 120, h: 40 },
      zone: { kind: 'hazard', fallIn: { effects: [], valence: 0, ms: 0 } },
    }),
  ],
  needs: NEEDS,
  meanings: ['friend', 'robot', 'bees', 'shelter', 'water', 'no', 'bad'],
  verbs: ['social', 'poke'],
});

const away: Presence = { watching: false };

interface KithInit {
  readonly x?: number;
  readonly [field: string]: unknown;
}

function garden(
  kiths: Readonly<Record<string, KithInit>>,
  ...inits: EntityInit[]
): World {
  const world = createWorld(11);
  const entities = [
    ...Object.entries(kiths).map(([id, { x = 1000, ...state }]) => ({
      id,
      type: 'kith',
      x,
      state: {
        stage: 'adult',
        name: id[0]!.toUpperCase() + id.slice(1),
        ...state,
      },
    })),
    ...inits,
  ].map((init) => createEntity(registry, init));
  return {
    ...world,
    clock: { ...world.clock, simTime: NOW },
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    selectedKith: Object.keys(kiths)[0] ?? null,
  };
}

const needs = (levels: Partial<Record<(typeof NEEDS)[number], number>>) => ({
  hunger: 0,
  bored: 0,
  lonely: 0,
  fear: 0,
  tired: 0,
  ...levels,
});

const bond = (affection: number, trust = 0.2): Bond => ({
  familiarity: 0.5,
  affection,
  trust,
});

const mindIn = (world: World, id: string) =>
  mindState.parse(world.entities[id]!.state);
const socialIn = (world: World, id: string) =>
  socialState.parse(world.entities[id]!.state);

const later = (world: World, ms: number): World => ({
  ...world,
  clock: { ...world.clock, simTime: world.clock.simTime + ms },
});

describe('relationships', () => {
  it('grows familiar with and fond of Kith nearby, and less lonely', () => {
    const world = garden({
      pip: { needs: needs({ lonely: 0.8 }) },
      bo: { x: 1100 },
      far: { x: 2000 },
    });
    const after = socialStep(world, registry, away, 'pip', HOUR).world;
    const bo = bondOf(after, registry, 'pip', 'bo');
    expect(bo.familiarity).toBeCloseTo(0.05);
    // 0.015 × (0.4 + its sociability, 0.5).
    expect(bo.affection).toBeCloseTo(0.1 + 0.015 * 0.9);
    expect(mindIn(after, 'pip').needs.lonely).toBeCloseTo(
      0.8 - 0.25 * (0.4 + 0.1),
    );
    expect(socialIn(after, 'pip').bonds.far).toBeUndefined();
  });

  it('grows no fonder of a Kith asleep or afraid, and keeps Tock company', () => {
    const world = garden(
      {
        pip: { needs: needs({ lonely: 0.8 }) },
        sleepy: { x: 1050, asleep: true },
        scared: { x: 950, needs: needs({ fear: 0.6 }) },
      },
      { id: 'tock', type: 'tock', x: 1020 },
    );
    const after = socialStep(world, registry, away, 'pip', HOUR).world;
    expect(bondOf(after, registry, 'pip', 'sleepy').affection).toBe(0.1);
    expect(bondOf(after, registry, 'pip', 'scared').affection).toBeCloseTo(
      0.1 + 0.015 * 0.9 * 0.3,
    );
    expect(bondOf(after, registry, 'pip', 'tock')).toEqual({
      familiarity: 0.03,
      affection: 0.05 + 0.006,
      trust: 0.15,
    });
  });

  it('keeps no company while asleep', () => {
    const world = garden({ pip: { asleep: true }, bo: { x: 1050 } });
    const after = socialStep(world, registry, away, 'pip', HOUR).world;
    expect(after).toBe(world);
  });

  it('grows familiar with the player who watches, and is moved by tickles and scolds', () => {
    const world = garden({ pip: {} });
    const watched = socialStep(
      world,
      registry,
      { watching: true, cameraX: 0, handX: null },
      'pip',
      HOUR,
    ).world;
    expect(socialIn(watched, 'pip').player.familiarity).toBeCloseTo(0.01);

    const ctx = { registry, presence: away, live: true };
    const player = (w: World) => socialIn(w, 'pip').player;
    const tickled = step(world, 0, [{ type: 'tickle' }], ctx).world;
    expect(player(tickled).affection).toBeCloseTo(0.115);
    expect(player(tickled).trust).toBeCloseTo(0.208);
    const scared = garden({ pip: { needs: needs({ fear: 0.5 }) } });
    const comforted = step(scared, 0, [{ type: 'tickle' }], ctx).world;
    expect(player(comforted).affection).toBeCloseTo(0.15);
    expect(player(comforted).trust).toBeCloseTo(0.25);
    const scolded = step(world, 0, [{ type: 'scold' }], ctx).world;
    expect(player(scolded).trust).toBeCloseTo(0.17);
  });

  it('seeks out the Kith it loves when lonely', () => {
    const world = garden(
      {
        pip: {
          needs: needs({ lonely: 1 }),
          bonds: { loved: bond(0.9) },
          values: { lonely: { social: { kith: 0.4 } } },
        },
        near: { x: 1100 },
        loved: { x: 1600 },
      },
      { id: 'egg', type: 'kith', x: 1010, state: { stage: 'egg' } },
    );
    const after = step(world, 1000, [], {
      registry,
      presence: away,
      live: true,
    }).world;
    expect(mindIn(after, 'pip').act).toMatchObject({
      verb: 'social',
      target: { kind: 'entity', id: 'loved' },
    });
  });

  it('still considers a Kith it is wished to keep company with, beside one it loves more', () => {
    const world = wish(
      garden({
        pip: { needs: needs({ lonely: 0.5 }), bonds: { loved: bond(0.9) } },
        loved: { x: 1010 },
        stranger: { x: 2000 },
      }),
      registry,
      'pip',
      [{ verb: 'social', target: 'stranger' }],
    );
    const targets = decide(world, registry, 'pip', away)
      .options.filter((option) => option.verb === 'social')
      .map((option) => option.target);
    expect(targets).toEqual(
      expect.arrayContaining([
        { kind: 'entity', id: 'loved' },
        { kind: 'entity', id: 'stranger' },
      ]),
    );
  });
});

describe('warnings', () => {
  const heading = {
    verb: 'poke',
    target: { kind: 'entity', id: 'hive' },
    type: 'beehive',
    category: 'hazard',
    need: 'bored',
    before: {},
    until: NOW + 60_000,
    tx: 1200,
    engagedUntil: null,
    done: false,
  };
  const hive = { id: 'hive', type: 'beehive', x: 1200 };

  it("lowers a warned Kith's opinion by its trust, and is a moment the first time", () => {
    const world = garden(
      {
        pip: { opinions: { beehive: -0.8 } },
        bo: { x: 1150, act: heading, opinions: { beehive: 0.1 } },
      },
      hive,
    );
    const { world: after, events } = socialStep(
      world,
      registry,
      away,
      'pip',
      1000,
    );
    // Its trust in Pip is 0.2, and Pip has no words to say it with.
    const opinion = 0.1 - 0.15 * (0.6 + 0.2);
    expect(mindIn(after, 'bo').opinions.beehive).toBeCloseTo(opinion);
    expect(events).toContainEqual({ type: 'said', actor: 'pip', text: '!!' });
    expect(events).toContainEqual({
      type: 'warned',
      actor: 'pip',
      target: 'bo',
    });
    expect(after.moments).toEqual([
      expect.objectContaining({
        kith: 'pip',
        text: expect.stringMatching(/^Pip warned Bo about the bees/),
      }),
    ]);
    expect(after.player.coins).toBe(world.player.coins + 20);

    const again = socialStep(
      later(
        { ...after, entities: { ...after.entities, bo: world.entities.bo! } },
        60_000,
      ),
      registry,
      away,
      'pip',
      1000,
    );
    expect(again.events).toContainEqual(
      expect.objectContaining({ type: 'warned' }),
    );
    expect(again.world.moments).toHaveLength(1);
  });

  it('says the words it knows, teaching them, and the warned Kith turns back', () => {
    const world = garden(
      {
        pip: {
          opinions: { beehive: -0.8 },
          lexicon: {
            buzz: { meaning: 'bees', strength: 0.6 },
            nah: { meaning: 'no', strength: 0.6 },
          },
        },
        bo: {
          x: 1150,
          act: heading,
          opinions: { beehive: -0.2 },
          bonds: { pip: bond(0.5, 0.6) },
        },
      },
      hive,
    );
    const { world: after, events } = socialStep(
      world,
      registry,
      away,
      'pip',
      1000,
    );
    expect(events).toContainEqual({
      type: 'said',
      actor: 'pip',
      text: 'buzz nah!',
    });
    const bo = mindIn(after, 'bo');
    expect(bo.opinions.beehive).toBeCloseTo(-0.2 - 0.15 * 1.2 * 1.4);
    expect(bo.act).toMatchObject({ done: true, until: NOW });
    const lexicon = after.entities.bo!.state as { lexicon: object };
    expect(Object.keys(lexicon.lexicon)).toEqual(['buzz', 'nah']);
  });

  it('warns no one who fears it already, is too far, or too soon', () => {
    const scared = garden(
      {
        pip: { opinions: { beehive: -0.8 } },
        bo: { x: 1150, act: heading, opinions: { beehive: -0.5 } },
      },
      hive,
    );
    expect(socialStep(scared, registry, away, 'pip', 1000).events).toEqual([]);
    const far = garden(
      {
        pip: { opinions: { beehive: -0.8 } },
        bo: { x: 1300, act: heading },
      },
      hive,
    );
    expect(socialStep(far, registry, away, 'pip', 1000).events).toEqual([]);
    const soon = garden(
      {
        pip: { opinions: { beehive: -0.8 }, lastWarned: NOW - 30_000 },
        bo: { x: 1150, act: heading },
      },
      hive,
    );
    expect(socialStep(soon, registry, away, 'pip', 1000).events).toEqual([]);
  });
});

describe('families', () => {
  const ctx = { registry, presence: away, live: false };

  /** Steps a minute at a time until `done` or `limitMs` has passed. */
  function run(
    world: World,
    limitMs: number,
    done: (events: readonly GameEvent[]) => boolean,
  ) {
    const events: GameEvent[] = [];
    const at = new Map<GameEvent, number>();
    const start = world.clock.simTime;
    while (world.clock.simTime - start < limitMs && !done(events)) {
      const result = step(world, 60_000, [], ctx);
      world = result.world;
      for (const event of result.events) at.set(event, world.clock.simTime);
      events.push(...result.events);
    }
    return { world, events, at };
  }

  const eggOf = (events: readonly GameEvent[]) => {
    const laid = events.find((e) => e.type === 'eggLaid');
    if (laid === undefined) throw new Error('No egg was laid');
    return laid;
  };

  it('two Kith bond and lay an egg within a week, which hatches a day later', () => {
    const world = garden({
      pip: { player: bond(0.6, 0.8) },
      bo: { x: 1040, player: bond(0.2, 0.4) },
    });
    const {
      world: after,
      events,
      at,
    } = run(world, 7 * DAY, (events) => events.some((e) => e.type === 'hatch'));
    const laid = eggOf(events);
    // The lower id lays it.
    expect(laid.actor).toBe('bo');
    expect(at.get(laid)).toBeLessThan(NOW + 7 * DAY);
    for (const [kith, other] of [
      ['pip', 'bo'],
      ['bo', 'pip'],
    ] as const) {
      expect(bondOf(after, registry, kith, other).affection).toBeGreaterThan(
        0.55,
      );
    }
    const hatched = events.find((e) => e.type === 'hatch')!;
    expect(hatched.actor).toBe(laid.target);
    expect(at.get(hatched)! - at.get(laid)!).toBe(DAY);
    const child = laid.target;
    expect(after.entities[child]!.x).toBe(1020);
    expect(mindIn(after, child).stage).toBe('baby');
    const childSocial = socialIn(after, child);
    expect(childSocial.generation).toBe(2);
    // Trust in the player: 0.1 + 0.6 × the parents' average, 0.6.
    expect(childSocial.player.trust).toBeCloseTo(0.46);
    expect(childSocial.bonds.pip).toMatchObject({ affection: 0.6, trust: 0.6 });
    expect(socialIn(after, 'pip').bonds[child]!.affection).toBeGreaterThan(
      0.55,
    );
    expect(socialIn(after, 'pip').lastEgg).toBe(at.get(laid));
    expect(socialIn(after, 'bo').lastEgg).toBe(at.get(laid));
    expect(after.moments.map((m) => m.text)).toContain(
      'Bo and Pip made an egg together.',
    );
  });

  it('lays no egg between Kith who are related, apart, unloved or laid lately', () => {
    const loving = (other: string) => ({ bonds: { [other]: bond(0.9) } });
    const cases = [
      garden({
        bo: { ...loving('pip'), parents: ['mum'] },
        pip: { ...loving('bo'), parents: ['mum'] },
      }),
      garden({ bo: loving('pip'), pip: { ...loving('bo'), x: 1100 } }),
      garden({ bo: loving('pip'), pip: {} }),
      garden({
        bo: { ...loving('pip'), lastEgg: NOW - DAY },
        pip: loving('bo'),
      }),
      garden({
        bo: loving('pip'),
        pip: { ...loving('bo'), needs: needs({ hunger: 0.5 }) },
      }),
    ];
    for (const world of cases) {
      const { events } = run(world, DAY, () => false);
      expect(events.filter((e) => e.type === 'eggLaid')).toEqual([]);
    }
  });

  it('lays no egg while six Kith live, and lays once fewer do', () => {
    const crowd = (others: number) =>
      garden({
        bo: { bonds: { pip: bond(0.9) } },
        pip: { bonds: { bo: bond(0.9) } },
        ...Object.fromEntries(
          Array.from({ length: others }, (_, i) => [
            `kin${i}`,
            { x: 3000 + i * 100 },
          ]),
        ),
      });
    const laid = (world: World) =>
      run(world, DAY, (events) =>
        events.some((e) => e.type === 'eggLaid'),
      ).events.some((e) => e.type === 'eggLaid');
    expect(laid(crowd(4))).toBe(false);
    expect(laid(crowd(3))).toBe(true);
  });

  it('lays its egg by the nearest shelter, crossing the parents', () => {
    const genome = (curiosity: number) => ({
      ...mindState.parse({}).genome,
      curiosity,
      sociability: curiosity,
    });
    const world = garden(
      {
        bo: {
          bonds: { pip: bond(0.9) },
          genome: genome(0),
          syllables: ['ba', 'be', 'bi'],
        },
        pip: {
          bonds: { bo: bond(0.9) },
          genome: genome(1),
          syllables: ['pa', 'pe', 'pi'],
        },
      },
      { id: 'hut', type: 'hut', x: 300 },
      { id: 'far-hut', type: 'hut', x: 2000 },
    );
    const { world: after, events } = run(world, 7 * DAY, (events) =>
      events.some((e) => e.type === 'eggLaid'),
    );
    const egg = after.entities[eggOf(events).target]!;
    expect(egg.x).toBe(340);
    const child = mindIn(after, egg.id).genome;
    expect([0, 1]).toContain(child.sociability);
    expect(child.curiosity).toBeGreaterThanOrEqual(0);
    expect(child.curiosity).toBeLessThanOrEqual(1);
    const { syllables } = egg.state as { syllables: string[] };
    expect(syllables.slice(0, 2)).toEqual(['ba', 'pe']);
    expect(['bi', 'pi']).toContain(syllables[2]);
  });

  it('hatches a child that inherits trust, wariness and key beliefs', () => {
    const parent = (trust: number, river: number) => ({
      player: bond(0.5, trust),
      bonds: { tock: bond(0.2, trust) },
      opinions: { river },
      beliefs: [
        { about: 'you', feel: 0.8, text: 'kind', strength: 0.9 },
        { about: 'bees', feel: -1, text: 'ouch', strength: 0.9 },
      ],
    });
    const world = garden(
      {
        mum: parent(0.8, -0.9),
        dad: parent(0.4, -0.2),
        egg: { stage: 'egg', hatchAt: NOW, parents: ['mum', 'dad'] },
      },
      { id: 'tock', type: 'tock', x: 0 },
    );
    const { world: after, events } = socialStep(
      world,
      registry,
      away,
      'egg',
      1000,
    );
    expect(events).toEqual([{ type: 'hatch', actor: 'egg' }]);
    const child = socialIn(after, 'egg');
    expect(child.born).toBe(NOW);
    expect(child.player.trust).toBeCloseTo(0.1 + 0.6 * 0.6);
    expect(child.player.affection).toBeCloseTo(0.05 + 0.4 * 0.5);
    expect(child.bonds.tock!.trust).toBeCloseTo(0.1 + 0.5 * 0.6);
    expect(mindIn(after, 'egg').opinions.river).toBeCloseTo(0.3 * -0.9);
    expect(child.beliefs).toEqual([
      {
        about: 'you',
        feel: expect.closeTo(0.8 * 0.7 * 0.5 + 0.8 * 0.7 * 0.6),
        text: 'kind',
        strength: 0.35,
      },
    ]);
    expect(after.moments.at(-1)?.text).toBe('Egg hatched.');
  });

  it('lets the player name an egg', () => {
    const world = garden({ pip: {}, egg: { stage: 'egg', name: '' } });
    const named = step(
      world,
      0,
      [{ type: 'rename', kith: 'egg', name: 'Wren' }],
      {
        registry,
        presence: away,
        live: true,
      },
    ).world;
    expect(named.entities.egg!.state).toMatchObject({ name: 'Wren' });
  });
});

describe('grief', () => {
  it('spikes the needs of close Kith only, with a belief and a moment', () => {
    const world = garden({
      dying: { needs: needs({ hunger: 1 }), health: 0.001 },
      close: { x: 3000, bonds: { dying: bond(0.6) } },
      stranger: { x: 3000, bonds: { dying: bond(0.2) } },
    });
    const { world: after, events } = catchUp(world, registry, NOW + 60_000);
    expect(events).toContainEqual({
      type: 'died',
      actor: 'dying',
      cause: 'hunger',
    });
    expect(mindIn(after, 'close').needs).toMatchObject({
      lonely: expect.closeTo(0.3 + 0.5 * 0.6),
      fear: expect.closeTo(0.2),
    });
    expect(socialIn(after, 'close').beliefs).toEqual([
      { about: 'night', feel: -0.3, text: 'Dying gone', strength: 0.5 },
    ]);
    expect(mindIn(after, 'stranger').needs).toEqual(needs({}));
    expect(socialIn(after, 'stranger').beliefs).toEqual([]);
    expect(after.moments.map((m) => m.text)).toEqual([
      'Close is grieving for Dying.',
    ]);
  });
});

describe('beliefs', () => {
  it('strengthen and reshape, keeping the strongest eight', () => {
    let beliefs = believe([], 'you', 0.5, 'nice');
    beliefs = believe(beliefs, 'you', -0.5, '');
    expect(beliefs).toEqual([
      { about: 'you', feel: 0.25 - 0.3, text: 'nice', strength: 0.75 },
    ]);
    for (let i = 0; i < 10; i++) beliefs = believe(beliefs, `b${i}`, 0, '');
    expect(beliefs).toHaveLength(8);
    expect(beliefs[0]!.about).toBe('you');
  });
});

describe('registry', () => {
  it('needs a mind and language, and known needs, meanings and stages', () => {
    const bad: SocialDef = {
      ...social,
      warning: { ...social.warning, refuse: ['nope'] },
      family: { ...social.family, stage: 'teen' },
      grief: { ...social.grief, needs: { sorrow: 1 } },
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { language: _, ...mute } = kith;
    expect(() =>
      createRegistry({
        types: [{ ...mute, social: bad }],
        needs: NEEDS,
        meanings: ['friend', 'shelter', 'no', 'bad'],
        verbs: ['social'],
      }),
    ).toThrow(
      [
        'Invalid content:',
        '- type "kith" social needs a mind and language',
        '- type "kith" social uses unknown need "sorrow"',
        '- type "kith" social uses unknown meaning "nope"',
        '- type "kith" social uses unknown stage "teen"',
      ].join('\n'),
    );
  });
});
