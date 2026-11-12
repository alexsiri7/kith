import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Actor, AffordanceDef } from './affordance.js';
import { createEntity, type EntityInit, type EntityType } from './entity.js';
import { interact } from './interact.js';
import {
  hear,
  languageShape,
  languageStep,
  lexiconOf,
  notice,
  obey,
  speak,
  teach,
  tell,
  wordFor,
  type LanguageDef,
  type Lexicon,
} from './language.js';
import { mindShape, mindState, type Act, type MindDef } from './mind.js';
import { createRegistry } from './registry.js';
import { socialShape } from './relationship.js';
import { nextFloat } from './rng.js';
import { step, type Presence } from './step.js';
import type { Target } from './target.js';
import { createWorld, type World } from './world.js';

const HOUR = 3_600_000;
const NOW = 100_000;

const still = { awake: 0, asleep: 0 };

const mind: MindDef = {
  needs: {
    hunger: still,
    bored: still,
    lonely: still,
    fear: still,
    tired: still,
  },
  health: { harm: [], heal: { perHour: 0, below: {} } },
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
    range: 500,
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
      comfort: { when: {}, needs: {} },
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
  teaching: { rate: 0.25, speakable: 0.3, speakableCoins: 10 },
  memory: {
    decayPerHour: 0.03,
    keepAbove: 0.8,
    consolidatePerHour: 0.1,
    consolidateAbove: 0.5,
  },
  speech: {
    maxWords: { baby: 1, child: 3, adult: 6, elder: 5 },
    defaultMaxWords: 1,
    properNouns: ['you', 'self', 'robot'],
    babble: { words: [1, 3], repeat: 0.4, exclaim: 0.5 },
    sayMs: 5_000,
  },
  chatter: {
    every: [10_000, 10_000],
    feelAbove: 0.55,
    feelings: { hunger: 'hungry', bored: 'bored' },
    callPlayer: ['hunger'],
    mention: 1,
    nearby: 160,
    quiet: 0,
    hearWithin: 180,
    spreadAbove: 0.5,
    strength: 0.3,
    parentStrength: 0.45,
  },
  overhear: { within: 140, perHour: 0.04, parent: 1.5 },
  attention: {
    noticeWithin: 250,
    lookMs: 4_000,
    attendMs: 8_000,
    attendWithin: 320,
  },
  hearing: {
    maxWords: 12,
    wakeBelow: { tired: 0.45, fear: 0.5 },
    plain: 1,
    pointed: 1,
    attending: 1.6,
    bystanders: 0.5,
    bystanderWithin: 220,
    ignore: ['look', 'the'],
    feelAbove: 0.6,
  },
  commands: {
    eat: { verb: 'eat', direct: true },
    food: { verb: 'eat' },
    ball: { verb: 'play' },
    come: { verb: 'approach', direct: true },
    you: { verb: 'approach' },
  },
  obey: {
    base: 0.25,
    trust: 0.45,
    trait: 'agreeable',
    perTrait: 0.3,
    needs: { bored: -0.25 },
    ms: 30_000,
    strength: 1.5,
  },
};

const NEEDS = ['hunger', 'bored', 'lonely', 'fear', 'tired'] as const;

const kith: EntityType = {
  id: 'kith',
  category: 'kith',
  state: z.object({
    ...mindShape,
    ...languageShape,
    ...socialShape,
    name: z.string().default(''),
    needs: z
      .object(Object.fromEntries(NEEDS.map((need) => [need, z.number()])))
      .default({ hunger: 0, bored: 0, lonely: 0, fear: 0, tired: 0 }),
  }),
  body: { w: 24, h: 28 },
  perception: { salience: 1, moving: true },
  affordances: [],
  mind,
  language,
  sprite: 'kith',
};

const thing = (
  id: string,
  category: EntityType['category'],
  meaning: string | undefined,
  state: z.ZodType = z.object({}),
  affordances: AffordanceDef[] = [],
): EntityType => ({
  id,
  category,
  ...(meaning !== undefined && { meaning }),
  state,
  body: { w: 10, h: 10 },
  perception: { salience: 0.5 },
  affordances,
  sprite: id,
});

const board = thing(
  'board',
  'gadget',
  undefined,
  z.object({
    shown: z.int().min(0).default(0),
    shownUntil: z.number().default(0),
  }),
  [
    {
      verb: 'use',
      actors: ['player', 'kith'],
      approach: 'touch',
      outcomes: [
        {
          effects: [
            {
              kind: 'lesson',
              words: [
                { meaning: 'ball', word: 'ball' },
                { meaning: 'food', word: 'food' },
                { meaning: 'eat', word: 'eat' },
              ],
              strength: { player: 0.6, kith: 0.9 },
              within: 320,
              ms: 12_000,
            },
          ],
          valence: 0,
        },
      ],
    },
  ],
);

const sign = thing('sign', 'gadget', undefined, z.object({}), [
  {
    verb: 'use',
    actors: ['kith'],
    approach: 'touch',
    outcomes: [
      {
        effects: [{ kind: 'teach', word: 'glow', meaning: 'sun', strength: 1 }],
        valence: 0,
      },
    ],
  },
]);

const registry = createRegistry({
  types: [
    kith,
    thing('tock', 'robot', 'robot', z.object({ name: z.string().default('') })),
    thing('ball', 'toy', 'ball'),
    board,
    sign,
  ],
  needs: NEEDS,
  meanings: [
    'you',
    'self',
    'robot',
    'ball',
    'food',
    'eat',
    'come',
    'hungry',
    'bored',
    'sun',
    'happy',
  ],
  verbs: ['eat', 'play', 'use'],
});

interface KithInit {
  readonly x?: number;
  readonly [field: string]: unknown;
}

function garden(
  kiths: Readonly<Record<string, KithInit>>,
  ...inits: EntityInit[]
): World {
  const world = createWorld(7);
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
    selectedKith: 'pip',
    player: { ...world.player, name: 'Alex' },
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

const words = (entries: Readonly<Record<string, [string, number]>>): Lexicon =>
  Object.fromEntries(
    Object.entries(entries).map(([word, [meaning, strength]]) => [
      word,
      { meaning, strength },
    ]),
  );

const lexicon = (world: World, id = 'pip') => lexiconOf(world, registry, id);
const strength = (world: World, word: string, id = 'pip') =>
  lexicon(world, id)[word]?.strength;
const stateOf = (world: World, id = 'pip') =>
  world.entities[id]!.state as Record<string, unknown>;

const away: Presence = { watching: false };
const watching: Presence = { watching: true, cameraX: 1000, handX: null };

const act: Act = {
  verb: 'idle',
  target: null,
  type: null,
  category: 'self',
  need: 'bored',
  before: {},
  until: NOW + 10_000,
  tx: 1000,
  engagedUntil: null,
  done: false,
};

const ball: Target = { kind: 'entity', id: 'ball' };

describe('a language', () => {
  it('must name known content, have its state, and come with a mind', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mind, ...mindless } = kith;
    const create = () =>
      createRegistry({
        types: [
          {
            ...mindless,
            state: z.object({ ...mindShape, lexicon: z.string().default('') }),
            language: {
              ...language,
              commands: { fly: { verb: 'soar' } },
              hearing: { ...language.hearing, wakeBelow: { thirst: 0.5 } },
            },
          },
        ],
        needs: NEEDS,
        meanings: ['you', 'self', 'robot', 'hungry', 'bored'],
        verbs: [],
      });
    for (const problem of [
      'type "kith" language needs a mind',
      'type "kith" language needs state field lexicon',
      'type "kith" language uses unknown meaning "fly"',
      'type "kith" language commands unknown verb "soar"',
      'type "kith" language uses unknown need "thirst"',
    ]) {
      expect(create).toThrow(problem);
    }
  });
});

describe('teaching', () => {
  it('gains rate × learn rate × strength, and pays once a word is speakable', () => {
    const genome = { ...mindState.parse({}).genome, learnRate: 0.8 };
    let world = garden({ pip: { genome } });
    world = teach(world, registry, 'pip', 'Ball', 'ball', 1).world;
    expect(strength(world, 'ball')).toBeCloseTo(0.2);
    const second = teach(world, registry, 'pip', 'ball', 'ball', 1);
    expect(strength(second.world, 'ball')).toBeCloseTo(0.4);
    expect(second.events).toEqual([
      { type: 'learnedWord', actor: 'pip', word: 'ball' },
    ]);
    expect(second.world.player.coins).toBe(world.player.coins + 10);
    const third = teach(second.world, registry, 'pip', 'ball', 'ball', 1);
    expect(third.events).toEqual([]);
    expect(third.world.player.coins).toBe(second.world.player.coins);
  });

  it('starts a word over when it is heard with another meaning', () => {
    const world = garden({ pip: { lexicon: words({ ball: ['ball', 0.6] }) } });
    expect(
      lexicon(teach(world, registry, 'pip', 'ball', 'food', 1).world).ball,
    ).toEqual({ meaning: 'food', strength: 0.25 });
  });

  it('ignores invalid words, unknown meanings, and who cannot learn', () => {
    const world = garden(
      { pip: {}, bo: {}, egg: { stage: 'egg' }, gone: { alive: false } },
      { id: 'tock', type: 'tock', x: 0 },
    );
    const unchanged = [
      teach(world, registry, 'pip', 'two words', 'ball', 1),
      teach(world, registry, 'pip', 'ball', 'kite', 1),
      teach(world, registry, 'pip', 'ghost', 'kin:nobody', 1),
      teach(world, registry, 'egg', 'ball', 'ball', 1),
      teach(world, registry, 'gone', 'ball', 'ball', 1),
      teach(world, registry, 'tock', 'ball', 'ball', 1),
    ];
    for (const result of unchanged) expect(result.world).toBe(world);
    expect(
      lexicon(teach(world, registry, 'pip', 'bo', 'kin:bo', 1).world).bo,
    ).toEqual({ meaning: 'kin:bo', strength: 0.25 });
  });

  it('marks its first word and its first name for the player', () => {
    let world = garden({ pip: {} });
    world = teach(world, registry, 'pip', 'ball', 'ball', 1).world;
    world = teach(world, registry, 'pip', 'alex', 'you', 1).world;
    world = teach(world, registry, 'pip', 'lex', 'you', 1).world;
    expect(world.moments.map((m) => m.text)).toEqual([
      'Pip started learning a first word: "ball".',
      'Pip began to learn your name.',
    ]);
  });

  it('teaches an actor through the teach effect', () => {
    const world = garden({ pip: {} }, { id: 'sign', type: 'sign', x: 1000 });
    const use = (w: World) => {
      const result = interact(w, registry, {
        actor: { kind: 'entity', id: 'pip' },
        target: 'sign',
        verb: 'use',
      });
      if (!result.ok) throw new Error(result.reason);
      return result.world;
    };
    expect(strength(use(use(world)), 'glow')).toBeCloseTo(0.5);
  });
});

describe('memory', () => {
  const lex = words({
    yum: ['hungry', 0.5],
    ball: ['ball', 0.85],
    eat: ['eat', 0.6],
    food: ['food', 0.4],
    sun: ['sun', 0.01],
  });

  it('fades words while awake, except those it knows well', () => {
    const world = garden({ pip: { lexicon: lex } });
    const { world: later, events } = languageStep(
      world,
      registry,
      away,
      false,
      'pip',
      HOUR,
    );
    expect(strength(later, 'yum')).toBeCloseTo(0.47);
    expect(strength(later, 'ball')).toBe(0.85);
    expect(strength(later, 'sun')).toBeUndefined();
    expect(events).toEqual([{ type: 'forgotWord', actor: 'pip', word: 'sun' }]);
  });

  it('settles words it half knows in sleep, while weaker ones still fade', () => {
    const world = garden({
      pip: { lexicon: lex, asleep: true, needs: needs({ tired: 0.5 }) },
    });
    const later = languageStep(world, registry, away, true, 'pip', HOUR).world;
    expect(strength(later, 'eat')).toBeCloseTo(0.7);
    expect(strength(later, 'food')).toBeCloseTo(0.37);
  });
});

describe('speech', () => {
  const known = words({
    alex: ['you', 0.5],
    bo: ['kin:bo', 0.5],
    yum: ['hungry', 0.5],
    ball: ['ball', 0.5],
    eat: ['eat', 0.5],
    food: ['food', 0.5],
    sun: ['sun', 0.5],
    zz: ['sun', 0.2],
  });

  it('says only words it knows, as many as its stage allows', () => {
    const said = (stage: string) => {
      const world = garden({ pip: { stage, lexicon: known }, bo: { x: 3000 } });
      const { events } = speak(
        world,
        registry,
        'pip',
        'Alex bo zz yum, kite ball eat food sun.',
      );
      return events;
    };
    expect(said('baby')).toEqual([
      { type: 'said', actor: 'pip', text: 'Alex.' },
    ]);
    expect(said('child')[0]).toMatchObject({ text: 'Alex Bo yum.' });
    expect(said('adult')[0]).toMatchObject({
      text: 'Alex Bo yum ball eat food.',
    });
    expect(said('elder')[0]).toMatchObject({ text: 'Alex Bo yum ball eat.' });
  });

  it('babbles in its own syllables when it knows none of the words', () => {
    const world = garden({ pip: { syllables: ['ka', 'lu'] } });
    for (let seed = 0; seed < 20; seed++) {
      const seeded = { ...world, rng: createWorld(seed).rng };
      const { events, world: after } = speak(
        seeded,
        registry,
        'pip',
        'hello there',
      );
      expect(events[0]).toMatchObject({ type: 'said', actor: 'pip' });
      const { text } = events[0] as { text: string };
      expect(text).toMatch(/^(ka|lu){1,2}( (ka|lu){1,2}){0,2}!?$/);
      expect(after.rng.behaviour).not.toEqual(seeded.rng.behaviour);
    }
  });

  it('names a meaning by its strongest speakable word', () => {
    const synonyms = words({
      hungry: ['hungry', 0.4],
      yum: ['hungry', 0.9],
      nom: ['hungry', 0.2],
    });
    expect(wordFor(synonyms, 'hungry', language)).toBe('yum');
    const reversed = Object.fromEntries(Object.entries(synonyms).reverse());
    expect(wordFor(reversed, 'hungry', language)).toBe('yum');
    expect(wordFor(words({ nom: ['hungry', 0.2] }), 'hungry', language)).toBe(
      null,
    );
  });

  it('holds its chatter while it speaks', () => {
    const world = garden({ pip: {} });
    const { world: after } = speak(world, registry, 'pip', 'hi');
    expect(stateOf(after).nextChatter).toBe(NOW + 5_000);
  });
});

describe('commands', () => {
  const known = words({
    ball: ['ball', 0.5],
    eat: ['eat', 0.5],
    food: ['food', 0.2],
    come: ['come', 0.5],
  });
  const trusting = (trust: number) => ({
    player: { familiarity: 0, affection: 0.1, trust },
  });
  const willing = {
    ...trusting(1),
    genome: { ...mindState.parse({}).genome, agreeable: 1 },
  };
  const unwilling = {
    ...trusting(0),
    genome: { ...mindState.parse({}).genome, agreeable: 0 },
    needs: needs({ bored: 1, tired: 0.3 }),
  };

  it('takes the first direct command, else the last word that names one', () => {
    const world = garden({ pip: { lexicon: known, ...willing } });
    const verb = (said: string[]) =>
      obey(world, registry, 'pip', said).events.map(
        (e) => e.type === 'understood' && e.verb,
      );
    expect(verb(['ball', 'eat', 'come'])).toEqual(['eat']);
    expect(verb(['come', 'ball'])).toEqual(['approach']);
    expect(verb(['ball'])).toEqual(['play']);
    expect(verb(['food', 'kite'])).toEqual([]);
  });

  it('obeys by chance from trust, genome and needs', () => {
    const asleep = { asleep: true, act, needs: needs({ tired: 0.3 }) };
    const sure = garden({ pip: { lexicon: known, ...willing, ...asleep } });
    const yes = obey(sure, registry, 'pip', ['eat']);
    expect(yes.events).toEqual([
      { type: 'understood', actor: 'pip', verb: 'eat', obeyed: true },
    ]);
    expect(yes.world.rng).toEqual(sure.rng);
    expect(stateOf(yes.world)).toMatchObject({
      biases: [{ verb: 'eat', until: NOW + 30_000, strength: 1.5 }],
      act: { ...act, done: true, until: NOW },
      asleep: false,
    });

    const never = garden({ pip: { lexicon: known, ...asleep, ...unwilling } });
    const no = obey(never, registry, 'pip', ['eat']);
    expect(no.events).toEqual([
      { type: 'understood', actor: 'pip', verb: 'eat', obeyed: false },
    ]);
    expect(no.world).toBe(never);
  });

  it('obeys a middling Kith when its roll falls below the chance', () => {
    const middling = {
      ...trusting(0.5),
      genome: { ...mindState.parse({}).genome, agreeable: 0.5 },
    };
    const world = garden({ pip: { lexicon: known, ...middling } });
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 20; seed++) {
      const seeded = { ...world, rng: createWorld(seed).rng };
      const { events } = obey(seeded, registry, 'pip', ['eat']);
      const roll = nextFloat(seeded.rng.behaviour).value;
      expect(events).toEqual([
        { type: 'understood', actor: 'pip', verb: 'eat', obeyed: roll < 0.625 },
      ]);
      seen.add(roll < 0.625);
    }
    expect(seen).toEqual(new Set([true, false]));
  });

  it('obeys a lone word it knows even while busy or feeling strongly', () => {
    const lexicon = words({ come: ['come', 0.5], yum: ['hungry', 0.5] });
    for (const busy of [
      { act: { ...act, verb: 'play', target: ball } },
      { needs: needs({ hunger: 0.9 }) },
    ]) {
      const world = garden(
        { pip: { lexicon, ...willing, ...busy } },
        { id: 'ball', type: 'ball', x: 1050 },
      );
      const come = hear(world, registry, 'come');
      expect(come.events).toEqual([
        { type: 'understood', actor: 'pip', verb: 'approach', obeyed: true },
      ]);
      expect(lexiconOf(come.world, registry, 'pip')).toEqual(lexicon);
      const yum = hear(world, registry, 'yum');
      expect(yum.events).toEqual([]);
      expect(lexiconOf(yum.world, registry, 'pip')).toEqual(lexicon);
    }
  });

  it('never takes a word it was just taught as a command', () => {
    const world = garden({
      pip: {
        lexicon: words({ alex: ['you', 0.5], come: ['come', 0.5] }),
        ...willing,
      },
    });
    const { events } = hear(world, registry, 'Alex!');
    expect(events.map((e) => e.type)).not.toContain('understood');
    expect(hear(world, registry, 'come').events.map((e) => e.type)).toEqual([
      'understood',
    ]);
  });
});

describe('channels', () => {
  it('teaches the pointed-at thing’s name, more strongly while it attends', () => {
    const world = garden(
      {
        pip: {},
        bo: { x: 1100 },
        far: { x: 1400 },
        sleepy: { x: 1050, asleep: true, needs: needs({ tired: 0.9 }) },
      },
      { id: 'ball', type: 'ball', x: 1050 },
    );
    const heard = hear(world, registry, 'look ball', ball).world;
    expect(strength(heard, 'ball')).toBeCloseTo(0.25);
    expect(strength(heard, 'ball', 'bo')).toBeCloseTo(0.125);
    expect(strength(heard, 'ball', 'far')).toBeUndefined();
    expect(strength(heard, 'ball', 'sleepy')).toBeUndefined();
    const looking = notice(world, registry, ball);
    expect(stateOf(looking).look).toEqual({ x: 1050, until: NOW + 4_000 });
    expect(stateOf(looking, 'bo').look).toEqual({
      x: 1050,
      until: NOW + 4_000,
    });
    expect(stateOf(looking, 'far').look).toBeNull();
    expect(
      strength(hear(looking, registry, 'ball', ball).world, 'ball'),
    ).toBeCloseTo(0.4);
  });

  it('does not name a thing with a word that means something else', () => {
    const world = garden(
      { pip: { lexicon: words({ zap: ['sun', 0.5] }) } },
      { id: 'ball', type: 'ball', x: 1050 },
    );
    expect(lexicon(hear(world, registry, 'zap', ball).world)).toEqual(
      lexicon(world),
    );
    expect(lexicon(hear(world, registry, 'the look', ball).world)).toEqual(
      lexicon(world),
    );
  });

  it('names a Kith only by its own name', () => {
    const world = garden({ pip: {}, bo: { x: 1100 } });
    const self: Target = { kind: 'entity', id: 'pip' };
    expect(lexicon(hear(world, registry, 'blob', self).world)).toEqual({});
    const named = hear(world, registry, 'my bo', {
      kind: 'entity',
      id: 'bo',
    }).world;
    expect(lexicon(named).bo).toEqual({ meaning: 'kin:bo', strength: 0.25 });
  });

  it('learns names and feelings from plain talk', () => {
    const world = garden(
      { pip: { needs: needs({ hunger: 0.9 }) }, bo: { x: 3000 } },
      { id: 'tock', type: 'tock', x: 0, state: { name: 'Tock' } },
    );
    const heard = hear(world, registry, 'Alex Pip Tock Bo').world;
    expect(lexicon(heard)).toEqual(
      words({
        alex: ['you', 0.25],
        pip: ['self', 0.25],
        tock: ['robot', 0.25],
        bo: ['kin:bo', 0.25],
      }),
    );
    expect(lexicon(hear(world, registry, 'yum').world)).toEqual(
      words({ yum: ['hungry', 0.25] }),
    );
  });

  it('is woken by talk only once it is rested and unafraid', () => {
    const tired = garden({
      pip: { asleep: true, needs: needs({ tired: 0.5 }) },
    });
    expect(hear(tired, registry, 'Alex').world).toBe(tired);
    const rested = garden({
      pip: { asleep: true, needs: needs({ tired: 0.3 }) },
    });
    const heard = hear(rested, registry, 'Alex').world;
    expect(stateOf(heard).asleep).toBe(false);
    expect(strength(heard, 'alex')).toBeCloseTo(0.25);
  });

  describe('the word board', () => {
    const use = (world: World, actor: Actor) => {
      const result = interact(world, registry, {
        actor,
        target: 'board',
        verb: 'use',
      });
      if (!result.ok) throw new Error(result.reason);
      return result.world;
    };
    const pip: Actor = { kind: 'entity', id: 'pip' };
    const shown = (world: World) => stateOf(world, 'board').shown;

    it('shows a word it does not know, then repeats it until half learned', () => {
      let world = garden({ pip: {} }, { id: 'board', type: 'board', x: 1100 });
      world = use(world, pip);
      expect(shown(world)).toBe(1);
      expect(stateOf(world, 'board').shownUntil).toBe(NOW + 12_000);
      expect(strength(world, 'food')).toBeCloseTo(0.225);
      world = use(use(world, pip), pip);
      expect(shown(world)).toBe(1);
      expect(strength(world, 'food')).toBeCloseTo(0.675);
      world = use(world, pip);
      expect(shown(world)).toBe(2);
      expect(strength(world, 'eat')).toBeCloseTo(0.225);
    });

    it('teaches the selected Kith more gently when the player uses it', () => {
      const world = use(
        garden({ pip: {} }, { id: 'board', type: 'board', x: 1100 }),
        { kind: 'player' },
      );
      expect(strength(world, 'food')).toBeCloseTo(0.15);
    });

    it('teaches nothing out of reach, but still moves on', () => {
      const world = use(
        garden({ pip: {} }, { id: 'board', type: 'board', x: 2000 }),
        { kind: 'player' },
      );
      expect(shown(world)).toBe(1);
      expect(lexicon(world)).toEqual({});
    });
  });

  it('lets Tock name things for an awake Kith', () => {
    const world = garden(
      { pip: {}, sleepy: { asleep: true, needs: needs({ tired: 0.9 }) } },
      { id: 'tock', type: 'tock', x: 900 },
    );
    const told = tell(world, registry, 'tock', 'pip', 'ball', 'ball', 0.25);
    expect(told.events[0]).toEqual({
      type: 'said',
      actor: 'tock',
      text: 'ball.',
    });
    expect(strength(told.world, 'ball')).toBeCloseTo(0.0625);
    const unheard = tell(
      world,
      registry,
      'tock',
      'sleepy',
      'ball',
      'ball',
      0.25,
    );
    expect(unheard.world).toBe(world);
    expect(unheard.events).toHaveLength(1);
  });
});

describe('chatter', () => {
  const mum = {
    lexicon: words({
      yum: ['hungry', 0.9],
      alex: ['you', 0.5],
      bo: ['kin:bo', 0.9],
    }),
    needs: needs({ hunger: 0.9 }),
  };

  it('says what it feels, calling the watching player by name', () => {
    const world = garden({ mum });
    expect(
      languageStep(world, registry, watching, true, 'mum', 1000).events,
    ).toEqual([{ type: 'said', actor: 'mum', text: 'Alex yum!' }]);
    const after = languageStep(world, registry, away, true, 'mum', 1000);
    expect(after.events).toEqual([
      { type: 'said', actor: 'mum', text: 'yum!' },
    ]);
    expect(stateOf(after.world, 'mum').nextChatter).toBe(NOW + 10_000);
    expect(
      languageStep(after.world, registry, away, true, 'mum', 1000).events,
    ).toEqual([]);
  });

  it('spreads the words it knows well to awake Kith in earshot, a parent’s faster', () => {
    const world = garden({
      mum,
      kid: { x: 1100, parents: ['mum'] },
      other: { x: 900 },
      far: { x: 1200 },
      sleepy: { x: 1050, asleep: true, needs: needs({ tired: 0.9 }) },
      confused: { x: 1000, lexicon: words({ yum: ['food', 0.1] }) },
    });
    const { world: after } = languageStep(
      world,
      registry,
      away,
      true,
      'mum',
      1000,
    );
    expect(strength(after, 'yum', 'kid')).toBeCloseTo(0.1125);
    expect(strength(after, 'yum', 'other')).toBeCloseTo(0.075);
    expect(strength(after, 'yum', 'far')).toBeUndefined();
    expect(strength(after, 'yum', 'sleepy')).toBeUndefined();
    expect(lexicon(after, 'confused').yum).toEqual({
      meaning: 'food',
      strength: 0.1,
    });
  });

  it('does not spread names', () => {
    const world = garden({
      mum: { ...mum, needs: needs({}) },
      bo: { x: 1100 },
    });
    const { world: after, events } = languageStep(
      world,
      registry,
      away,
      true,
      'mum',
      1000,
    );
    expect(events).toEqual([{ type: 'said', actor: 'mum', text: 'Bo!' }]);
    expect(lexicon(after, 'bo')).toEqual({});
  });

  it('is silent while unattended, when Kith overhear each other instead', () => {
    const world = garden({
      mum,
      kid: { x: 1100, parents: ['mum'] },
      other: { x: 900 },
    });
    let next = languageStep(world, registry, away, false, 'mum', HOUR);
    expect(next.events).toEqual([]);
    next = languageStep(next.world, registry, away, false, 'kid', HOUR);
    next = languageStep(next.world, registry, away, false, 'other', HOUR);
    expect(strength(next.world, 'yum', 'kid')).toBeCloseTo(0.015);
    expect(strength(next.world, 'yum', 'other')).toBeCloseTo(0.01);
    expect(strength(next.world, 'bo', 'kid')).toBeUndefined();
  });
});

describe('step', () => {
  it('lets the player point and speak to the selected Kith', () => {
    const world = garden({ pip: {} }, { id: 'ball', type: 'ball', x: 1050 });
    const { world: after } = step(
      world,
      0,
      [
        { type: 'point', target: ball },
        { type: 'say', text: 'ball', pointing: ball },
      ],
      { registry, presence: away, live: false },
    );
    expect(strength(after, 'ball')).toBeCloseTo(0.4);
  });
});
