import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEntity, type EntityType } from './entity.js';
import { createRegistry } from './registry.js';
import { indexWorld } from './world-index.js';
import { createWorld, serialiseWorld, type World } from './world.js';

const type = (id: string, category: EntityType['category']): EntityType => ({
  id,
  category,
  state: z.object({}),
  body: { w: 10, h: 10 },
  perception: { salience: 0.5 },
  affordances: [],
  sprite: id,
});

const registry = createRegistry({
  types: [type('ball', 'toy'), type('doll', 'toy'), type('cake', 'food')],
  meanings: [],
  verbs: [],
});

function worldWith(...entities: [string, string, number][]): World {
  const world = createWorld(1);
  return {
    ...world,
    entities: Object.fromEntries(
      entities.map(([id, t, x]) => [
        id,
        createEntity(registry, { id, type: t, x }),
      ]),
    ),
  };
}

describe('indexWorld', () => {
  const world = worldWith(
    ['a', 'ball', 0],
    ['b', 'cake', 99],
    ['c', 'doll', 100],
    ['d', 'ball', 250],
  );

  it('buckets entities by x', () => {
    const { buckets } = indexWorld(world, registry);
    expect([...buckets]).toEqual([
      [0, ['a', 'b']],
      [1, ['c']],
      [2, ['d']],
    ]);
  });

  it('groups ids by type and category in insertion order', () => {
    const { byType, byCategory } = indexWorld(world, registry);
    expect([...byType]).toEqual([
      ['ball', ['a', 'd']],
      ['cake', ['b']],
      ['doll', ['c']],
    ]);
    expect([...byCategory]).toEqual([
      ['toy', ['a', 'c', 'd']],
      ['food', ['b']],
    ]);
  });

  it('leaves the world untouched', () => {
    const before = serialiseWorld(world);
    indexWorld(world, registry);
    expect(serialiseWorld(world)).toBe(before);
  });

  it('rejects an entity of an unknown type', () => {
    const bad = {
      ...world,
      entities: { k: { id: 'k', type: 'kite', x: 0, state: {} } },
    };
    expect(() => indexWorld(bad, registry)).toThrow(
      'Unknown entity type "kite"',
    );
  });
});
