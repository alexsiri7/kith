import {
  catchUp,
  createEntity,
  createRegistry,
  createWorld,
  deserialiseWorld,
  GAME_DAY_MS,
  serialiseWorld,
  type EntityType,
} from '@kith/engine';
import { beforeAll, expect, it } from 'vitest';
import { ENTITY_TYPES, NEEDS, TREE_X } from './entity-types.js';
import { MEANINGS } from './meanings.js';
import { KITH_MIND } from './tunables.js';
import { VERBS } from './verbs.js';

// Nothing in the garden is edible until #14, and dead Kith cost nothing, so
// the budget is measured on Kith that never go hungry. Nor does the garden
// have a food machine: until Kith can eat, its cakes only pile up.
const fed: EntityType['mind'] = {
  ...KITH_MIND,
  needs: { ...KITH_MIND.needs, hunger: { awake: 0, asleep: 0 } },
};
const registry = createRegistry({
  types: ENTITY_TYPES.map((t) => (t.id === 'kith' ? { ...t, mind: fed } : t)),
  needs: NEEDS,
  meanings: MEANINGS,
  verbs: VERBS,
});

function garden() {
  const inits = [
    ...['Pip', 'Mo', 'Bo', 'Lu'].map((name, i) => ({
      id: `kith-${i + 1}`,
      type: 'kith',
      x: 300 + i * 40,
      state: { name, stage: 'adult', born: 0 },
    })),
    { id: 'river', type: 'river', x: 1240, state: { bridge: true } },
    { id: 'lever', type: 'lever', x: 1100 },
    { id: 'beehive', type: 'beehive', x: 1060 },
    { id: 'cactus', type: 'cactus', x: 2090 },
    { id: 'top', type: 'top', x: 500 },
    { id: 'ball', type: 'ball', x: 700 },
    { id: 'cake', type: 'cake', x: 600 },
    { id: 'carrot', type: 'carrot', x: 160 },
    { id: 'berry-bush', type: 'berry-bush', x: 1600 },
    { id: 'shelter', type: 'shelter', x: 900 },
    { id: 'shade', type: 'shade', x: TREE_X },
  ];
  const entities = inits.map((init) => createEntity(registry, init));
  return {
    ...createWorld(600),
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  };
}

// The server catches up in a process that has been running, so the engine's
// code is warmed first, as the legacy budget's earlier scenarios warm its.
beforeAll(() => {
  catchUp(garden(), registry, 2 * GAME_DAY_MS);
});

// The prototype's budget: a week away, 42 garden days, within 2 s.
it(
  'catching up 7 days (42 game days) with 4 Kith is quick',
  { timeout: 2000 },
  () => {
    const { world } = catchUp(garden(), registry, 42 * GAME_DAY_MS);
    const alive = Object.values(world.entities).filter(
      (e) => e.type === 'kith' && (e.state as { alive: boolean }).alive,
    );
    expect(alive).toHaveLength(6);
    const saved = serialiseWorld(world);
    expect(serialiseWorld(deserialiseWorld(saved, registry))).toBe(saved);
  },
);
