import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEntity, type EntityInit, type EntityType } from './entity.js';
import type { MindDef } from './mind.js';
import { createRegistry, type Registry } from './registry.js';
import { createWorld, type World } from './world.js';
import { zoneCurrents } from './zone.js';

const river: EntityType = {
  id: 'river',
  category: 'terrain',
  state: z.object({ bridge: z.boolean().default(false) }),
  body: { w: 100, h: 40 },
  perception: { salience: 0.8 },
  affordances: [],
  zone: {
    kind: 'hazard',
    passableWhen: 'bridge',
    fallIn: { effects: [], valence: 0, ms: 0 },
    current: { speed: 10, bank: 14 },
  },
  sprite: 'river',
};

function thing(id: string, body: EntityType['body']): EntityType {
  return {
    id,
    category: 'toy',
    state: z.object({}),
    body,
    perception: { salience: 0.5 },
    affordances: [],
    sprite: id,
  };
}

const validated = createRegistry({
  types: [
    river,
    thing('ball', { w: 10, h: 10, floats: true }),
    thing('cake', { w: 10, h: 10, sinks: true }),
  ],
  needs: [],
  meanings: [],
  verbs: [],
});

// The current only asks whether a type has a mind, so this one goes
// unvalidated and is never asked to think.
const swimmer: EntityType = {
  ...thing('swimmer', { w: 10, h: 10, sinks: true }),
  mind: {} as MindDef,
};
const registry: Registry = {
  ...validated,
  types: new Map([...validated.types, [swimmer.id, swimmer]]),
};

/** A river spanning [100, 200], with `inits` in it. */
function garden(inits: readonly EntityInit[], bridge = false): World {
  const entities = [
    { id: 'river', type: 'river', x: 150, state: { bridge } },
    ...inits,
  ].map((init) => createEntity(registry, init));
  return {
    ...createWorld(3),
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  };
}

describe('zoneCurrents', () => {
  it('floats a body to the nearer bank and stops it beyond the edge', () => {
    const world = garden([
      { id: 'a', type: 'ball', x: 120 },
      { id: 'b', type: 'ball', x: 170 },
    ]);
    const once = zoneCurrents(world, registry, 1000);
    expect(once.entities.a?.x).toBe(110);
    expect(once.entities.b?.x).toBe(180);
    const later = zoneCurrents(once, registry, 60_000);
    expect(later.entities.a?.x).toBe(86);
    expect(later.entities.b?.x).toBe(214);
  });

  it('sinks a body that does not float', () => {
    const world = garden([{ id: 'c', type: 'cake', x: 150 }]);
    expect(zoneCurrents(world, registry, 1000).entities.c).toBeUndefined();
  });

  it('leaves alone what is outside, carried, held, minded or bridged', () => {
    const world = garden([
      { id: 'outside', type: 'cake', x: 90 },
      { id: 'carried', type: 'cake', x: 150, carriedBy: 'someone' },
      { id: 'held', type: 'ball', x: 150, heldByPlayer: true },
      { id: 'minded', type: 'swimmer', x: 150 },
    ]);
    expect(zoneCurrents(world, registry, 1000)).toEqual(world);
    const bridged = garden([{ id: 'c', type: 'cake', x: 150 }], true);
    expect(zoneCurrents(bridged, registry, 1000)).toEqual(bridged);
  });
});
