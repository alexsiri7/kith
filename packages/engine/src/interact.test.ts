import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type {
  Actor,
  AffordanceDef,
  CustomEffect,
  Effect,
  OutcomeDef,
} from './affordance.js';
import { createEntity, type EntityType } from './entity.js';
import { engage, interact, type Interaction } from './interact.js';
import { createRegistry, type Registry } from './registry.js';
import { nextFloat } from './rng.js';
import { step } from './step.js';
import { createWorld, serialiseWorld, type World } from './world.js';

const kith: EntityType = {
  id: 'kith',
  category: 'kith',
  state: z.object({
    health: z.number().default(1),
    needs: z
      .object({ hunger: z.number(), fear: z.number() })
      .default({ hunger: 0.5, fear: 0 }),
    sickUntil: z.number().default(0),
    fleeing: z
      .object({ from: z.string(), until: z.number() })
      .nullable()
      .default(null),
    biases: z
      .array(
        z.object({ verb: z.string(), until: z.number(), strength: z.number() }),
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
};

const lamp: EntityType = {
  id: 'lamp',
  category: 'gadget',
  state: z.object({ lit: z.boolean().default(false) }),
  body: { w: 10, h: 30 },
  perception: { salience: 0.5 },
  affordances: [],
  sprite: 'lamp',
};

const thingState = z.object({
  count: z.number().default(2),
  open: z.boolean().default(false),
  until: z.number().default(0),
  lamp: z.string().default('lamp'),
  swarm: z
    .object({ victim: z.string(), until: z.number() })
    .nullable()
    .default(null),
});
type ThingState = z.infer<typeof thingState>;

const pip: Actor = { kind: 'entity', id: 'pip' };
const player: Actor = { kind: 'player' };

function setup(
  affordance: Partial<AffordanceDef>,
  customEffects: Record<string, CustomEffect> = {},
): { registry: Registry; world: World } {
  const thing: EntityType = {
    id: 'thing',
    category: 'gadget',
    state: thingState,
    body: { w: 20, h: 20 },
    perception: { salience: 0.5 },
    affordances: [
      {
        verb: 'use',
        actors: ['kith', 'player'],
        approach: 'touch',
        outcomes: [],
        ...affordance,
      },
    ],
    sprite: 'thing',
  };
  const robot: EntityType = { ...lamp, id: 'robot', category: 'robot' };
  const registry = createRegistry({
    types: [kith, lamp, thing, robot],
    needs: ['hunger', 'fear', 'thirst'],
    meanings: ['light', 'dark'],
    verbs: ['use', 'eat'],
    customEffects,
  });
  const base = createWorld(42);
  const entities = [
    { id: 'pip', type: 'kith', x: 100 },
    { id: 'thing', type: 'thing', x: 120 },
    { id: 'lamp', type: 'lamp', x: 300 },
    { id: 'tock', type: 'robot', x: 50 },
  ].map((init) => createEntity(registry, init));
  return {
    registry,
    world: {
      ...base,
      clock: { ...base.clock, simTime: 1000 },
      entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    },
  };
}

function useWith(
  effects: readonly Effect[],
  actor: Actor = pip,
  customEffects?: Record<string, CustomEffect>,
) {
  const { registry, world } = setup(
    {
      actors: [actor.kind === 'player' ? 'player' : 'kith'],
      outcomes: [{ effects, valence: 0.5 }],
    },
    customEffects,
  );
  const result = interact(world, registry, {
    actor,
    target: 'thing',
    verb: 'use',
  });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const stateOf = (world: World, id: string) =>
  world.entities[id]?.state as Record<string, unknown>;
const thingOf = (world: World) => stateOf(world, 'thing') as ThingState;

describe('effects', () => {
  it('need changes one of the actor’s needs, clamped to [0, 1]', () => {
    const { world } = useWith([
      { kind: 'need', need: 'hunger', delta: -0.3 },
      { kind: 'need', need: 'fear', delta: 2 },
    ]);
    expect(stateOf(world, 'pip').needs).toEqual({ hunger: 0.2, fear: 1 });
    expect(() => useWith([{ kind: 'need', need: 'thirst', delta: 1 }])).toThrow(
      'pip has no need "thirst"',
    );
  });

  it('health changes the actor’s health, clamped to [0, 1]', () => {
    expect(
      stateOf(useWith([{ kind: 'health', delta: -0.25 }]).world, 'pip').health,
    ).toBe(0.75);
    expect(
      stateOf(useWith([{ kind: 'health', delta: 3 }]).world, 'pip').health,
    ).toBe(1);
  });

  it('setState writes a literal, a predicate or an expression', () => {
    const { world } = useWith([
      { kind: 'setState', field: 'open', value: true },
      {
        kind: 'setState',
        field: 'lit',
        of: { linked: 'lamp' },
        value: { test: { not: { is: 'lit', of: { linked: 'lamp' } } } },
      },
      { kind: 'setState', field: 'until', value: { sum: ['now', 8000] } },
      {
        kind: 'setState',
        field: 'count',
        value: { product: [{ state: 'count' }, 3] },
      },
    ]);
    expect(thingOf(world)).toMatchObject({ open: true, until: 9000, count: 6 });
    expect(stateOf(world, 'lamp').lit).toBe(true);
  });

  it('incState adds to a number, within an optional range', () => {
    const { world } = useWith([
      { kind: 'incState', field: 'count', by: -1 },
      { kind: 'incState', field: 'until', by: 5, range: [0, 3] },
    ]);
    expect(thingOf(world)).toMatchObject({ count: 1, until: 3 });
  });

  it('spawn creates an entity of a type at a subject, with state', () => {
    const { world } = useWith([
      { kind: 'spawn', type: 'lamp', state: { lit: true } },
      { kind: 'spawn', type: 'lamp', near: 'actor' },
    ]);
    expect(world.entities['lamp-1']).toEqual({
      id: 'lamp-1',
      type: 'lamp',
      x: 120,
      state: { lit: true },
    });
    expect(world.entities['lamp-2']).toMatchObject({
      x: 100,
      state: { lit: false },
    });
  });

  it('remove deletes an entity', () => {
    const { world } = useWith([{ kind: 'remove', of: { linked: 'lamp' } }]);
    expect(Object.keys(world.entities)).toEqual(['pip', 'thing', 'tock']);
  });

  it('carry hands the target to the actor', () => {
    expect(useWith([{ kind: 'carry' }]).world.entities.thing?.carriedBy).toBe(
      'pip',
    );
    const held = useWith([{ kind: 'carry' }], player).world.entities.thing;
    expect(held?.heldByPlayer).toBe(true);
    expect(held?.carriedBy).toBeUndefined();
  });

  it('flee sends the actor away from a subject for a while', () => {
    const { world } = useWith([{ kind: 'flee', ms: 8000 }]);
    expect(stateOf(world, 'pip').fleeing).toEqual({
      from: 'thing',
      until: 9000,
    });
  });

  it('teach strengthens a word, or replaces its meaning', () => {
    const teach = (meaning: string): Effect => ({
      kind: 'teach',
      word: 'glow',
      meaning,
      strength: 0.25,
    });
    expect(
      stateOf(useWith([teach('light'), teach('light')]).world, 'pip').lexicon,
    ).toEqual({ glow: { meaning: 'light', strength: 0.5 } });
    expect(
      stateOf(useWith([teach('light'), teach('dark')]).world, 'pip').lexicon,
    ).toEqual({ glow: { meaning: 'dark', strength: 0.25 } });
  });

  it('emit names the actor and the target', () => {
    expect(useWith([{ kind: 'emit', event: 'ate' }]).events).toEqual([
      { type: 'ate', actor: 'pip', target: 'thing' },
    ]);
  });

  it('moment records the actor’s moment and pays the player', () => {
    const { world } = useWith([
      { kind: 'moment', text: 'Pip used it.', coins: 20 },
      { kind: 'moment', text: 'Again.' },
    ]);
    expect(world.moments).toEqual([
      { simTime: 1000, kith: 'pip', text: 'Pip used it.' },
      { simTime: 1000, kith: 'pip', text: 'Again.' },
    ]);
    expect(world.player.coins).toBe(140);
  });

  it('swarm sets the target on the actor for a while', () => {
    expect(thingOf(useWith([{ kind: 'swarm', ms: 6000 }]).world).swarm).toEqual(
      { victim: 'pip', until: 7000 },
    );
  });

  it('sick makes the actor sick, never shortening a sickness', () => {
    const { world } = useWith([
      { kind: 'sick', ms: 5000 },
      { kind: 'sick', ms: 100 },
    ]);
    expect(stateOf(world, 'pip').sickUntil).toBe(6000);
  });

  it('bias adds a timed bias and drops expired ones', () => {
    const { world } = useWith([
      { kind: 'bias', verb: 'eat', ms: 0, strength: 1 },
      { kind: 'bias', verb: 'use', ms: 500, strength: 0.5 },
    ]);
    expect(stateOf(world, 'pip').biases).toEqual([
      { verb: 'use', until: 1500, strength: 0.5 },
    ]);
  });

  it('custom calls a registered function', () => {
    const paint: CustomEffect = (world, ctx) => ({
      ...world,
      player: { ...world.player, name: `${ctx.target} by ${ctx.actor.kind}` },
    });
    const { world } = useWith([{ kind: 'custom', fn: 'paint' }], pip, {
      paint,
    });
    expect(world.player.name).toBe('thing by entity');
  });

  it('skips effects on the actor when the actor is the player', () => {
    const { world, events } = useWith(
      [
        { kind: 'need', need: 'hunger', delta: -1 },
        { kind: 'health', delta: -1 },
        { kind: 'flee', ms: 1 },
        { kind: 'teach', word: 'glow', meaning: 'light', strength: 1 },
        { kind: 'emit', event: 'ate' },
        { kind: 'moment', text: 'no', coins: 5 },
        { kind: 'swarm', ms: 1 },
        { kind: 'sick', ms: 1 },
        { kind: 'bias', verb: 'eat', ms: 1, strength: 1 },
        { kind: 'incState', field: 'count', by: 1 },
      ],
      player,
    );
    const { world: before } = setup({});
    expect(events).toEqual([]);
    expect(world.entities.pip).toEqual(before.entities.pip);
    expect(world.player).toEqual(before.player);
    expect(thingOf(world)).toMatchObject({ count: 3, swarm: null });
  });

  it('refuses to leave an entity invalid', () => {
    expect(() =>
      useWith([
        { kind: 'setState', field: 'health', of: 'actor', value: true },
      ]),
    ).toThrow('Effect left kith pip invalid');
  });
});

describe('interact', () => {
  const use: Interaction = { actor: pip, target: 'thing', verb: 'use' };

  it('refuses what the target does not afford to this actor now', () => {
    const { registry, world } = setup({
      actors: ['kith'],
      available: { lt: [{ state: 'count' }, 1] },
    });
    const reason = (interaction: Interaction) => {
      const result = interact(world, registry, interaction);
      return result.ok ? null : result.reason;
    };
    expect(reason({ ...use, target: 'gone' })).toBe('no entity "gone"');
    expect(reason({ ...use, verb: 'eat' })).toBe('thing does not afford eat');
    expect(reason({ ...use, actor: player })).toBe('player cannot use thing');
    expect(reason({ ...use, actor: { kind: 'entity', id: 'lamp' } })).toBe(
      'that actor cannot use thing',
    );
    expect(reason(use)).toBe('thing cannot be used for use now');
  });

  it('applies outcomes in order and sums their valence', () => {
    const { registry, world } = setup({
      outcomes: [
        {
          effects: [{ kind: 'incState', field: 'count', by: 1 }],
          valence: 0.5,
        },
        {
          chance: 0,
          effects: [{ kind: 'incState', field: 'count', by: 10 }],
          valence: 9,
          otherwise: {
            effects: [{ kind: 'incState', field: 'count', by: -5 }],
            valence: -0.2,
          },
        },
        { chance: 0, effects: [], valence: 4 },
      ],
    });
    const result = interact(world, registry, use);
    if (!result.ok) throw new Error(result.reason);
    expect(thingOf(result.world).count).toBe(-2);
    expect(result.outcomes).toEqual([
      { chance: 1, fired: true, valence: 0.5 },
      { chance: 0, fired: false, valence: -0.2 },
      { chance: 0, fired: false, valence: 0 },
    ]);
    expect(result.valence).toBeCloseTo(0.3);
    expect(result.world.rng).toEqual(world.rng);
  });

  it('rolls uncertain chances on the behaviour stream', () => {
    const outcome: OutcomeDef = {
      chance: { product: [{ state: 'count' }, 0.25] },
      effects: [{ kind: 'emit', event: 'ate' }],
      valence: 1,
    };
    const { registry, world } = setup({ outcomes: [outcome, outcome] });
    const first = nextFloat(world.rng.behaviour);
    const second = nextFloat(first.state);
    const result = interact(world, registry, use);
    if (!result.ok) throw new Error(result.reason);
    expect(result.outcomes.map((o) => o.fired)).toEqual([
      first.value < 0.5,
      second.value < 0.5,
    ]);
    expect(result.world.rng).toEqual({
      ...world.rng,
      behaviour: second.state,
    });
  });

  it('evaluates every chance before any outcome applies', () => {
    const { registry, world } = setup({
      outcomes: [
        { effects: [{ kind: 'incState', field: 'count', by: -2 }], valence: 0 },
        {
          chance: { if: { gt: [{ state: 'count' }, 0] }, then: 1, else: 0 },
          effects: [{ kind: 'setState', field: 'open', value: true }],
          valence: 0,
        },
      ],
    });
    const result = interact(world, registry, use);
    expect(result.ok && thingOf(result.world)).toMatchObject({
      count: 0,
      open: true,
    });
  });

  it('is a pure dry run that never touches the world it is given', () => {
    const { registry, world } = setup({
      outcomes: [
        {
          chance: 0.5,
          effects: [{ kind: 'need', need: 'hunger', delta: -0.1 }],
          valence: 1,
        },
      ],
    });
    const before = serialiseWorld(world);
    const a = interact(world, registry, use);
    const b = interact(world, registry, use);
    expect(serialiseWorld(world)).toBe(before);
    expect(a).toEqual(b);
  });

  it('refuses the verb on the target until its cooldown ends', () => {
    const { registry, world } = setup({ cooldownMs: 500 });
    const first = interact(world, registry, use);
    if (!first.ok) throw new Error(first.reason);
    expect(first.world.entities.thing?.cooldowns).toEqual({ use: 1500 });
    const at = (simTime: number) => ({
      ...first.world,
      clock: { ...first.world.clock, simTime },
    });
    expect(interact(at(1499), registry, use)).toEqual({
      ok: false,
      reason: 'thing is cooling down from use',
    });
    expect(interact(at(1500), registry, use).ok).toBe(true);
  });
});

describe('engage', () => {
  it('applies continuous effects per second engaged', () => {
    const continuous: Effect[] = [
      { kind: 'need', need: 'hunger', delta: -0.1 },
      { kind: 'incState', field: 'count', by: 2 },
      { kind: 'swarm', ms: 1000 },
      { kind: 'emit', event: 'ate' },
    ];
    const { registry, world } = setup({ continuous });
    const result = engage(
      world,
      registry,
      { actor: pip, target: 'thing', verb: 'use' },
      2500,
    );
    if (!result.ok) throw new Error(result.reason);
    expect(stateOf(result.world, 'pip').needs).toMatchObject({ hunger: 0.25 });
    expect(thingOf(result.world).count).toBe(7);
    expect(thingOf(result.world).swarm).toEqual({ victim: 'pip', until: 2000 });
    expect(result.events).toEqual([
      { type: 'ate', actor: 'pip', target: 'thing' },
    ]);
  });
});

describe('step', () => {
  it('resolves the player’s use commands through affordances', () => {
    const { registry, world } = setup({
      available: { is: 'open' },
      outcomes: [
        { effects: [{ kind: 'incState', field: 'count', by: 1 }], valence: 0 },
      ],
    });
    const ctx = {
      registry,
      presence: { watching: false },
      live: true,
    } as const;
    const use = { type: 'use', entity: 'thing', verb: 'use' } as const;
    expect(step(world, 0, [use], ctx)).toEqual({
      world: step(world, 0, [], ctx).world,
      events: [],
    });
    const thing = world.entities.thing!;
    const open: World = {
      ...world,
      entities: {
        ...world.entities,
        thing: { ...thing, state: { ...thingOf(world), open: true } },
      },
    };
    expect(thingOf(step(open, 0, [use, use], ctx).world).count).toBe(4);
  });
});
