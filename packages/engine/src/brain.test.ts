import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AffordanceDef } from './affordance.js';
import { attend, decide, feedback, intend, mindOf, think } from './brain.js';
import type { Command } from './command.js';
import { createEntity, type EntityInit, type EntityType } from './entity.js';
import type { GameEvent } from './event.js';
import { mindShape, type Mind, type MindDef } from './mind.js';
import { createRegistry } from './registry.js';
import { step, type Presence, type StepContext } from './step.js';
import type { Target } from './target.js';
import { createWorld, type World } from './world.js';

const HOUR = 3_600_000;
const NOW = 100_000;

const mind: MindDef = {
  needs: {
    hunger: {
      awake: 0.1,
      asleep: 0.05,
      genome: { trait: 'hardiness', base: 1.2, per: -0.4 },
      stage: { baby: 2 },
    },
    bored: { awake: 0.1, asleep: 0 },
    lonely: {
      awake: 0.1,
      asleep: 0.1,
      watched: { far: 0.02, nearHand: -0.4, within: 100 },
    },
    fear: { awake: -0.5, asleep: -0.5 },
    tired: { awake: 0.05, asleep: -0.2 },
  },
  health: {
    harm: [{ need: 'hunger', above: 0.85, perHour: 0.5 }],
    heal: { perHour: 0.1, below: { hunger: 0.6 } },
  },
  movement: {
    speed: { baby: 5 },
    defaultSpeed: 10,
    slow: [{ need: 'fear', above: 0.9, factor: 0.5 }],
    sickFactor: 0.5,
    arriveWithin: 14,
    bounds: [0, 2000],
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
    curiosity: 0.3,
    distance: 1 / 2500,
    avoidBelow: -0.35,
  },
  decision: { noise: {}, defaultNoise: 0, pursueMs: 60_000 },
  activities: {
    idle: { base: 0.05, ms: [10_000, 10_000] },
    wander: { base: 0.08, curiosity: 0.1, range: 400, ms: [20_000, 20_000] },
    sleep: { whenAbove: { tired: 0.45 } },
    approach: { ms: 30_000, relief: { lonely: -0.3 } },
  },
  instincts: {
    hunger: { eat: { food: 0.4 } },
    bored: { poke: { plant: 0.3 } },
    lonely: { approach: { player: 0.45 } },
  },
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
      needs: { bored: -0.1 },
      comfort: { when: { fear: 0.4 }, needs: { fear: -0.3 } },
    },
    scold: {
      reward: -0.7,
      needs: { fear: 0.15 },
      opinion: -0.25,
      zone: { within: 90, opinion: -0.15 },
    },
  },
  biases: {
    wish: { ms: HOUR, strength: 0.5 },
    cortex: { ms: 60_000, strength: 1.5 },
  },
};

const eat: AffordanceDef = {
  verb: 'eat',
  actors: ['kith'],
  approach: 'touch',
  outcomes: [
    {
      effects: [
        { kind: 'remove' },
        { kind: 'need', need: 'hunger', delta: -0.5 },
      ],
      valence: 0.5,
    },
  ],
};

const poke: AffordanceDef = {
  verb: 'poke',
  actors: ['kith'],
  approach: 'touch',
  outcomes: [
    {
      effects: [{ kind: 'need', need: 'fear', delta: 0.3 }],
      valence: -0.6,
    },
  ],
};

const kith: EntityType = {
  id: 'kith',
  category: 'kith',
  state: z.object({
    ...mindShape,
    needs: z
      .object({
        hunger: z.number(),
        bored: z.number(),
        lonely: z.number(),
        fear: z.number(),
        tired: z.number(),
      })
      .default({ hunger: 0.3, bored: 0.3, lonely: 0.3, fear: 0, tired: 0.2 }),
  }),
  body: { w: 24, h: 28 },
  perception: { salience: 1, moving: true },
  affordances: [],
  mind,
  sprite: 'kith',
};

const thing = (
  id: string,
  category: EntityType['category'],
  affordances: AffordanceDef[],
): EntityType => ({
  id,
  category,
  state: z.object({}),
  body: { w: 10, h: 10 },
  perception: { salience: 0.5 },
  affordances,
  sprite: id,
});

const pond: EntityType = {
  id: 'pond',
  category: 'terrain',
  state: z.object({ bridge: z.boolean().default(false) }),
  body: { w: 100, h: 20 },
  perception: { salience: 0.5 },
  affordances: [],
  zone: {
    kind: 'hazard',
    passableWhen: 'bridge',
    fallIn: {
      effects: [
        { kind: 'need', need: 'fear', delta: 0.6 },
        { kind: 'emit', event: 'fellIn' },
      ],
      valence: -0.4,
      ms: 5_000,
      continuous: [{ kind: 'need', need: 'hunger', delta: 0.01 }],
    },
  },
  sprite: 'pond',
};

const registry = createRegistry({
  types: [
    kith,
    thing('apple', 'food', [eat]),
    thing('nettle', 'plant', [poke]),
    pond,
  ],
  needs: ['hunger', 'bored', 'lonely', 'fear', 'tired'],
  meanings: [],
  verbs: ['eat', 'poke'],
});

const away: Presence = { watching: false };

function garden(
  pip: Partial<Mind> & { readonly x?: number } = {},
  ...inits: EntityInit[]
): World {
  const { x = 1000, ...state } = pip;
  const world = createWorld(7);
  const entities = [{ id: 'pip', type: 'kith', x, state }, ...inits].map(
    (init) => createEntity(registry, init),
  );
  return {
    ...world,
    clock: { ...world.clock, simTime: NOW },
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    selectedKith: 'pip',
  };
}

const needs = (levels: Partial<Record<string, number>>) => ({
  hunger: 0,
  bored: 0,
  lonely: 0,
  fear: 0,
  tired: 0,
  ...levels,
});

function run(
  world: World,
  ms: number,
  dtMs = 1000,
  presence: Presence = away,
  commands: readonly Command[] = [],
) {
  const ctx: StepContext = { registry, presence, live: true };
  const events: GameEvent[] = [];
  for (let t = 0; t < ms; t += dtMs) {
    const result = step(world, dtMs, t === 0 ? commands : [], ctx);
    world = result.world;
    events.push(...result.events);
  }
  return { world, events };
}

const at = (world: World, id = 'pip') => world.entities[id]!.x;

describe('a mind', () => {
  it('must name known needs and verbs and have the state it thinks with', () => {
    const create = () =>
      createRegistry({
        types: [
          {
            ...kith,
            state: z.object({ needs: z.object({}).default({}) }),
            mind: {
              ...mind,
              instincts: {
                thirst: { drink: { food: 1 } },
                hunger: { eat: { fruit: 1 } as Record<string, number> },
              },
            },
          },
        ],
        needs: ['hunger', 'bored', 'lonely', 'fear', 'tired'],
        meanings: [],
        verbs: ['eat'],
      });
    for (const problem of [
      'type "kith" mind uses unknown need "thirst"',
      'type "kith" mind has an instinct for unknown verb "drink"',
      'type "kith" mind has an instinct for unknown category "fruit"',
      'type "kith" mind drifts need "hunger", which its state lacks',
    ]) {
      expect(create).toThrow(problem);
    }
  });
});

describe('needs', () => {
  it('drift by the hour, scaled by genome and stage', () => {
    const genome = {
      curiosity: 0.5,
      hardiness: 1,
      sociability: 0.5,
      learnRate: 1,
    };
    const world = garden({
      stage: 'baby',
      genome,
      needs: needs({ hunger: 0.1 }),
    });
    const later = think(world, registry, away, 'pip', HOUR).world;
    // 0.1 an hour × (1.2 − 0.4 × hardiness) × 2 for a baby.
    expect(mindOf(later, 'pip').needs.hunger).toBeCloseTo(0.1 + 0.16);
    expect(mindOf(later, 'pip').needs.bored).toBeCloseTo(0.1);
  });

  it('use the watched rates near the player’s hand', () => {
    const world = garden({
      asleep: true,
      needs: needs({ lonely: 0.5, tired: 0.5 }),
    });
    const near = { watching: true, cameraX: 0, handX: 1050 } as const;
    const far = { ...near, handX: 1500 };
    const lonely = (presence: Presence) =>
      mindOf(think(world, registry, presence, 'pip', HOUR / 10).world, 'pip')
        .needs.lonely;
    expect(lonely(near)).toBeCloseTo(0.5 - 0.04);
    expect(lonely(far)).toBeCloseTo(0.5 + 0.002);
    expect(lonely(away)).toBeCloseTo(0.5 + 0.01);
  });

  it('wear health down while starving until the Kith dies of it', () => {
    const world = garden({ health: 0.2, needs: needs({ hunger: 0.9 }) });
    const { world: dead, events } = run(world, HOUR, 60_000);
    expect(mindOf(dead, 'pip').alive).toBe(false);
    expect(events).toContainEqual({
      type: 'died',
      actor: 'pip',
      cause: 'hunger',
    });
    const healed = think(
      garden({ health: 0.5, needs: needs({ hunger: 0.3 }) }),
      registry,
      away,
      'pip',
      HOUR,
    ).world;
    expect(mindOf(healed, 'pip').health).toBeCloseTo(0.6);
  });
});

describe('attention', () => {
  it('scores need relevance, opinion, novelty and distance', () => {
    const world = garden(
      { needs: needs({ hunger: 0.8 }), opinions: { nettle: 0.2 } },
      { id: 'apple', type: 'apple', x: 1100 },
      { id: 'nettle', type: 'nettle', x: 1100 },
    );
    const [apple, nettle] = attend(world, registry, 'pip');
    // 0.8 × 0.4 + no opinion + novelty 0.3 × 0.5 − 100 / 2500
    expect(apple).toMatchObject({ id: 'apple', verbs: ['eat'] });
    expect(apple!.score).toBeCloseTo(0.32 + 0.15 - 0.04);
    // No boredom to relieve, an opinion of 0.2 and no novelty.
    expect(nettle!.score).toBeCloseTo(0.2 - 0.04);
  });

  it('ignores what it thinks badly of and what lies past a feared zone', () => {
    const world = garden(
      { opinions: { nettle: -0.5 } },
      { id: 'nettle', type: 'nettle', x: 1100 },
      { id: 'apple', type: 'apple', x: 1300 },
      { id: 'pond', type: 'pond', x: 1150 },
    );
    expect(attend(world, registry, 'pip').map((a) => a.id)).toEqual(['apple']);
    const afraid = garden(
      { opinions: { pond: -0.6 } },
      { id: 'apple', type: 'apple', x: 1300 },
      { id: 'pond', type: 'pond', x: 1150 },
    );
    expect(attend(afraid, registry, 'pip')).toEqual([]);
  });

  it('remembers where it last saw things out of range', () => {
    const world = garden(
      { memory: { apple: 1400 } },
      { id: 'apple', type: 'apple', x: 1900 },
    );
    expect(attend(world, registry, 'pip')).toMatchObject([
      { id: 'apple', x: 1400 },
    ]);
  });
});

describe('decision', () => {
  it('sums need × value, opinion and biases, and keeps the best four', () => {
    const world = garden(
      {
        needs: needs({ hunger: 0.5, bored: 0.5, lonely: 0.5 }),
        opinions: { nettle: 0.1 },
        biases: [{ verb: 'poke', until: NOW + 1, strength: 0.4 }],
      },
      { id: 'apple', type: 'apple', x: 1100 },
      { id: 'nettle', type: 'nettle', x: 1100 },
    );
    const presence = { watching: true, cameraX: 0, handX: 900 } as const;
    const { options } = decide(world, registry, 'pip', presence);
    const score = (verb: string) =>
      options.find((option) => option.verb === verb)!.score;
    expect(score('poke')).toBeCloseTo(0.5 * 0.3 + 0.1 + 0.4);
    expect(score('eat')).toBeCloseTo(0.5 * 0.4);
    expect(score('approach')).toBeCloseTo(0.5 * 0.45);
    expect(score('wander')).toBeCloseTo(0.08 + 0.1 * 0.5);
    expect(options.map((o) => o.verb)).toEqual([
      'poke',
      'approach',
      'eat',
      'wander',
      'idle',
    ]);
    const chosen = mindOf(run(world, 1000, 1000, presence).world, 'pip');
    expect(chosen.act).toMatchObject({ verb: 'poke', need: 'hunger' });
    expect(chosen.lastScores.map((s) => [s.verb, s.target])).toEqual([
      ['poke', 'nettle'],
      ['approach', 'player'],
      ['eat', 'apple'],
      ['wander', null],
    ]);
  });

  it('offers the hand only when no feared zone lies on the way', () => {
    const lonely = (opinion: number) =>
      garden(
        { needs: needs({ lonely: 0.8 }), opinions: { pond: opinion } },
        { id: 'pond', type: 'pond', x: 1100 },
      );
    const presence = { watching: true, cameraX: 0, handX: 1300 } as const;
    const verbs = (world: World) =>
      decide(world, registry, 'pip', presence).options.map((o) => o.verb);
    expect(verbs(lonely(0))).toContain('approach');
    expect(verbs(lonely(-0.6))).not.toContain('approach');
  });

  it('adds noise from the behaviour stream that grows with youth', () => {
    const noisy: MindDef = {
      ...mind,
      decision: { ...mind.decision, noise: { baby: 0.35 } },
    };
    const noisyRegistry = createRegistry({
      types: [{ ...kith, mind: noisy }],
      needs: ['hunger', 'bored', 'lonely', 'fear', 'tired'],
      meanings: [],
      verbs: ['eat', 'poke'],
    });
    const scores = (stage: string, seed: number) => {
      const world = { ...garden({ stage }), rng: createWorld(seed).rng };
      return decide(world, noisyRegistry, 'pip', away).options.map(
        (o) => o.score,
      );
    };
    expect(scores('adult', 1)).toEqual(scores('adult', 2));
    expect(scores('baby', 1)).not.toEqual(scores('baby', 2));
    expect(scores('baby', 1)).toEqual(scores('baby', 1));
  });
});

describe('learning', () => {
  it('values a verb on a category by how much it relieved each need', () => {
    const world = garden(
      { needs: needs({ hunger: 0.8 }) },
      { id: 'apple', type: 'apple', x: 1050 },
    );
    const { world: fed, events } = run(world, 20_000);
    const pip = mindOf(fed, 'pip');
    expect(fed.entities.apple).toBeUndefined();
    expect(pip.opinions.apple).toBeCloseTo(0.5);
    // Relief 0.5 × gain 4 is clamped to 1: 0.4 + 0.3 × 1 × 0.8.
    expect(pip.values.hunger?.eat?.food).toBeCloseTo(0.64);
    expect(pip.skills).toEqual(['hunger:eat:food']);
    expect(events).toContainEqual({
      type: 'learnedSkill',
      actor: 'pip',
      skill: 'hunger:eat:food',
    });
    expect(pip.last).toMatchObject({
      verb: 'eat',
      type: 'apple',
      category: 'food',
    });
  });

  it('turns an outcome’s valence into an opinion of the type', () => {
    const world = garden(
      {
        needs: needs({ bored: 0.9 }),
        genome: {
          curiosity: 0.5,
          hardiness: 0.5,
          sociability: 0.5,
          learnRate: 0.5,
        },
      },
      { id: 'nettle', type: 'nettle', x: 1020 },
    );
    const { world: stung } = run(world, 5_000);
    expect(mindOf(stung, 'pip').opinions.nettle).toBeCloseTo(-0.6 * 0.5);
  });

  it('takes a tickle or scold as feedback on the current or just-ended act', () => {
    const act = {
      verb: 'poke',
      target: { kind: 'entity', id: 'nettle' },
      type: 'nettle',
      category: 'plant',
      need: 'bored',
      before: needs({ bored: 0.5 }),
      until: NOW + 10_000,
      tx: 1100,
      engagedUntil: null,
      done: false,
    } as const;
    const world = garden(
      { act, needs: needs({ bored: 0.5 }) },
      { id: 'nettle', type: 'nettle', x: 1100 },
    );
    const tickled = mindOf(
      feedback(world, registry, 'pip', 'tickle').world,
      'pip',
    );
    expect(tickled.values.bored?.poke?.plant).toBeCloseTo(0.3 + 0.6 * 0.3);
    expect(tickled.needs.bored).toBeCloseTo(0.4);
    const scolded = mindOf(
      feedback(world, registry, 'pip', 'scold').world,
      'pip',
    );
    expect(scolded.values.bored?.poke?.plant).toBeCloseTo(0.3 - 0.7 * 0.3);
    expect(scolded.opinions.nettle).toBeCloseTo(-0.25);
    expect(scolded.act?.done).toBe(true);
    expect(scolded.needs.fear).toBeCloseTo(0.15);
    const ended = garden({
      last: {
        verb: 'idle',
        type: null,
        category: 'self',
        need: 'bored',
        end: NOW - 70_000,
      },
    });
    expect(
      mindOf(feedback(ended, registry, 'pip', 'tickle').world, 'pip').values,
    ).toEqual({});
  });

  it('forgets a skill whose value falls below the threshold', () => {
    const world = garden({
      values: { bored: { idle: { self: 0.2 } } },
      skills: ['bored:idle:self'],
      last: {
        verb: 'idle',
        type: null,
        category: 'self',
        need: 'bored',
        end: NOW,
      },
    });
    const { world: scolded, events } = feedback(
      world,
      registry,
      'pip',
      'scold',
    );
    expect(mindOf(scolded, 'pip').skills).toEqual([]);
    expect(events).toEqual([
      { type: 'unlearnedSkill', actor: 'pip', skill: 'bored:idle:self' },
    ]);
  });

  it('thinks worse of a zone it is scolded near', () => {
    const world = garden({ x: 1050 }, { id: 'pond', type: 'pond', x: 1150 });
    const scolded = feedback(world, registry, 'pip', 'scold').world;
    expect(mindOf(scolded, 'pip').opinions.pond).toBeCloseTo(-0.15);
  });
});

describe('biases', () => {
  it('lets a cortex intent tip a choice for a while, never past safety', () => {
    const world = garden(
      { needs: needs({ hunger: 0.6 }) },
      { id: 'apple', type: 'apple', x: 1100 },
      { id: 'nettle', type: 'nettle', x: 1100 },
    );
    const intent: Command = {
      type: 'cortexIntent',
      kith: 'pip',
      verb: 'poke',
      target: { kind: 'entity', id: 'nettle' },
    };
    const choice = (w: World, commands: readonly Command[] = []) =>
      mindOf(run(w, 1000, 1000, away, commands).world, 'pip').act?.verb;
    expect(choice(world)).toBe('eat');
    expect(choice(world, [intent])).toBe('poke');
    const dozing = garden({ asleep: true, needs: needs({ tired: 0.5 }) });
    expect(
      mindOf(run(dozing, 1000, 1000, away, [intent]).world, 'pip'),
    ).toMatchObject({
      asleep: true,
      act: null,
    });
  });

  it('scopes a cortex intent to the entity or zone it names', () => {
    const world = garden({}, { id: 'pond', type: 'pond', x: 1100 });
    const targets = (target: Target) =>
      mindOf(intend(world, registry, 'pip', 'poke', target), 'pip').biases.map(
        (bias) => bias.target,
      );
    expect(targets({ kind: 'zone', id: 'pond' })).toEqual(['pond']);
    expect(targets({ kind: 'entity', id: 'pond' })).toEqual(['pond']);
    expect(targets({ kind: 'player' })).toEqual([undefined]);
  });

  it('spends a wish once the Kith has done it', () => {
    const world = garden(
      { needs: needs({ bored: 0.1 }) },
      { id: 'nettle', type: 'nettle', x: 1100 },
    );
    const wants: Command = {
      type: 'setWants',
      kith: 'pip',
      wants: [{ verb: 'poke', target: 'nettle' }],
    };
    const first = run(world, 1000, 1000, away, [wants]).world;
    expect(mindOf(first, 'pip').biases).toMatchObject([
      { verb: 'poke', target: 'nettle', wish: true },
    ]);
    expect(mindOf(first, 'pip').act?.verb).toBe('poke');
    const done = run(first, 10_000).world;
    expect(mindOf(done, 'pip').biases).toEqual([]);
  });
});

describe('movement and zones', () => {
  const across = (opinion: number) =>
    garden(
      { needs: needs({ hunger: 0.8 }), opinions: { pond: opinion } },
      { id: 'pond', type: 'pond', x: 1100 },
      { id: 'apple', type: 'apple', x: 1200 },
    );

  it('falls into a zone it does not fear, and climbs out where it came in', () => {
    const { world, events } = run(across(0), 8_000);
    expect(events).toContainEqual({
      type: 'fellIn',
      actor: 'pip',
      target: 'pond',
    });
    const wet = mindOf(world, 'pip');
    expect(wet.inZone).toMatchObject({ zone: 'pond', from: -1 });
    expect(at(world)).toBe(1100);
    expect(wet.opinions.pond).toBeCloseTo(-0.4);
    const out = run(world, 10_000).world;
    expect(mindOf(out, 'pip').inZone).toBeNull();
    expect(at(out)).toBeLessThan(1050);
  });

  it('is held in the zone under its continuous effects, per second', () => {
    const wet = run(across(0), 8_000).world;
    const before = mindOf(wet, 'pip').needs.hunger!;
    const held = mindOf(run(wet, 1_000).world, 'pip');
    expect(held.inZone).not.toBeNull();
    expect(held.needs.hunger! - before).toBeCloseTo(0.01 + 0.1 / 3600, 5);
  });

  it('stops at the bank of a zone it fears', () => {
    const wandering = garden(
      {
        opinions: { pond: -0.6 },
        act: {
          verb: 'wander',
          target: null,
          type: null,
          category: 'self',
          need: 'bored',
          before: needs({}),
          until: NOW + 60_000,
          tx: 1300,
          engagedUntil: null,
          done: false,
        },
      },
      { id: 'pond', type: 'pond', x: 1100 },
    );
    const { world, events } = run(wandering, 6_000);
    expect(events).toContainEqual({
      type: 'avoided',
      actor: 'pip',
      target: 'pond',
    });
    expect(events.some((e) => e.type === 'fellIn')).toBe(false);
    expect(at(world)).toBeLessThan(1050);
  });

  it('crosses freely while the zone is passable', () => {
    const world = garden(
      {
        needs: needs({ hunger: 0.8 }),
      },
      { id: 'pond', type: 'pond', x: 1100, state: { bridge: true } },
      { id: 'apple', type: 'apple', x: 1200 },
    );
    const { events } = run(world, 25_000);
    expect(events.some((e) => e.type === 'fellIn')).toBe(false);
    expect(run(world, 25_000).world.entities.apple).toBeUndefined();
  });
});

describe('fleeing', () => {
  const fleeing = (x: number) =>
    garden(
      { x, fleeing: { from: 'nettle', until: NOW + 10_000 } },
      { id: 'nettle', type: 'nettle', x: x + 50 },
    );

  it('runs away from what it flees until the time is up', () => {
    const fled = run(fleeing(1000), 9_000).world;
    expect(at(fled)).toBe(1000 - 9 * 10);
    expect(mindOf(fled, 'pip').act).toBeNull();
  });

  it('stays within the bounds it can move in', () => {
    expect(at(run(fleeing(30), 9_000).world)).toBe(0);
  });
});

describe('sleep', () => {
  it('falls asleep when exhausted and wakes once rested', () => {
    const world = garden({ needs: needs({ tired: 0.95 }) });
    const asleep = run(world, 1000).world;
    expect(mindOf(asleep, 'pip').asleep).toBe(true);
    const rested = run(asleep, 5 * HOUR, 60_000).world;
    expect(mindOf(rested, 'pip').asleep).toBe(false);
  });
});
