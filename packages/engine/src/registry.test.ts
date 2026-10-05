import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { EntityType } from './entity.js';
import { createRegistry } from './registry.js';

const ball: EntityType = {
  id: 'ball',
  category: 'toy',
  meaning: 'ball',
  state: z.object({}),
  body: { w: 16, h: 16, carryable: true },
  perception: { salience: 0.7 },
  affordances: [{ verb: 'kick' }],
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
          { ...ball, meaning: 'kite', affordances: [{ verb: 'fly' }] },
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

  it('rejects duplicate meanings and verbs', () => {
    expect(() =>
      createRegistry({ types: [], meanings: ['a', 'a'], verbs: ['v', 'v'] }),
    ).toThrow(/duplicate meaning "a"[\s\S]*duplicate verb "v"/);
  });
});
