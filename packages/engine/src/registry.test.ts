import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AffordanceDef } from './affordance.js';
import type { EntityType } from './entity.js';
import { createRegistry } from './registry.js';

const kick: AffordanceDef = {
  verb: 'kick',
  actors: ['kith'],
  approach: 'touch',
  outcomes: [],
};

const ball: EntityType = {
  id: 'ball',
  category: 'toy',
  meaning: 'ball',
  state: z.object({}),
  body: { w: 16, h: 16, carryable: true },
  perception: { salience: 0.7 },
  affordances: [kick],
  sprite: 'ball',
};

const river: EntityType = {
  id: 'river',
  category: 'terrain',
  state: z.object({ bridge: z.boolean().default(false) }),
  body: { w: 120, h: 40 },
  perception: { salience: 0.8 },
  affordances: [],
  zone: { kind: 'hazard', passableWhen: 'bridge' },
  sprite: 'river',
};

describe('createRegistry', () => {
  it('indexes valid definitions', () => {
    const registry = createRegistry({
      types: [ball, river],
      meanings: ['ball', 'water'],
      verbs: ['kick'],
    });
    expect([...registry.types.keys()]).toEqual(['ball', 'river']);
    expect(registry.types.get('river')).toBe(river);
    expect(registry.meanings.has('water')).toBe(true);
    expect(registry.verbs.has('kick')).toBe(true);
  });

  it('reports every problem in one error', () => {
    const create = () =>
      createRegistry({
        types: [
          ball,
          { ...ball, meaning: 'kite', affordances: [{ ...kick, verb: 'fly' }] },
          {
            ...river,
            id: 'pond',
            state: z.object({ depth: z.number(), bridge: z.string() }),
          },
          {
            ...river,
            id: 'lake',
            state: z.object({ bridge: z.number().default(1) }),
          },
        ],
        meanings: ['ball'],
        verbs: ['kick'],
      });
    expect(create).toThrow(/^Invalid content:\n/);
    for (const problem of [
      'duplicate type id "ball"',
      'type "ball" has unknown meaning "kite"',
      'type "ball" affords unknown verb "fly"',
      'type "pond" state needs defaults: depth',
      'type "lake" zone is passable when "bridge", which is not a boolean state field',
    ]) {
      expect(create).toThrow(problem);
    }
  });

  it('reports affordance problems', () => {
    const hive: EntityType = {
      ...ball,
      id: 'hive',
      state: z.object({
        honey: z.number().default(2),
        open: z.boolean().default(false),
      }),
      affordances: [
        { ...kick, actors: [], duration: [5, 1], cooldownMs: -1 },
        { ...kick, outcomes: [] },
        {
          ...kick,
          verb: 'poke',
          available: { is: 'honey' },
          outcomes: [
            {
              chance: 1.5,
              valence: 0,
              effects: [
                { kind: 'incState', field: 'bees', by: 1 },
                { kind: 'setState', field: 'open', value: 1 },
                { kind: 'spawn', type: 'wasp' },
                {
                  kind: 'teach',
                  word: 'buzz',
                  meaning: 'bees',
                  strength: 0.2,
                },
                { kind: 'custom', fn: 'explode' },
                { kind: 'sick', ms: -5 },
                { kind: 'swarm', ms: 1000 },
              ],
            },
          ],
        },
        {
          ...kick,
          verb: 'use',
          outcomes: [
            {
              valence: 0,
              effects: [{ kind: 'bias', verb: 'fly', ms: 1, strength: 1 }],
              otherwise: { valence: 0, effects: [] },
            },
          ],
        },
      ],
    };
    const create = () =>
      createRegistry({
        types: [hive],
        meanings: [],
        verbs: ['kick', 'poke'],
      });
    for (const problem of [
      'type "hive" kick has no actors',
      'type "hive" kick has invalid duration [5, 1]',
      'type "hive" kick has a negative cooldown',
      'type "hive" affords "kick" twice',
      'type "hive" affords unknown verb "use"',
      'type "hive" poke has chance 1.5 outside [0, 1]',
      'type "hive" poke uses state field "honey" as a boolean, but it is a number',
      'type "hive" poke reads unknown state field "bees"',
      'type "hive" poke uses state field "open" as a number, but it is a boolean',
      'type "hive" poke spawns unknown type "wasp"',
      'type "hive" poke teaches unknown meaning "bees"',
      'type "hive" poke calls unregistered custom effect "explode"',
      'type "hive" poke sick lasts a negative or invalid -5 ms',
      'type "hive" poke reads unknown state field "swarm"',
      'type "hive" use biases unknown verb "fly"',
    ]) {
      expect(create).toThrow(problem);
    }
  });

  it('rejects duplicate meanings and verbs', () => {
    expect(() =>
      createRegistry({ types: [], meanings: ['a', 'a'], verbs: ['v', 'v'] }),
    ).toThrow(/duplicate meaning "a"[\s\S]*duplicate verb "v"/);
  });
});
