import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEntity, type EntityType } from './entity.js';
import { createRegistry } from './registry.js';
import {
  deserialiseWorld,
  migrate,
  saveVersion,
  validateWorld,
  type Migration,
} from './save.js';
import {
  createWorld,
  SCHEMA_VERSION,
  serialiseWorld,
  type World,
} from './world.js';

const types: EntityType[] = [
  {
    id: 'kith',
    category: 'kith',
    state: z.object({
      name: z.string().default(''),
      health: z.number().default(1),
    }),
    body: { w: 24, h: 28 },
    perception: { salience: 1, moving: true },
    affordances: [],
    sprite: 'kith',
  },
  {
    id: 'ball',
    category: 'toy',
    state: z.object({}),
    body: { w: 16, h: 16, carryable: true },
    perception: { salience: 0.7 },
    affordances: [],
    sprite: 'ball',
  },
];
const registry = createRegistry({ types, meanings: [], verbs: [] });

function sampleWorld(): World {
  const world = createWorld(7);
  const pip = createEntity(registry, {
    id: 'pip',
    type: 'kith',
    x: 280,
    state: { name: 'Pip' },
  });
  const ball = createEntity(registry, {
    id: 'ball-1',
    type: 'ball',
    x: 300,
    y: 12,
    carriedBy: 'pip',
  });
  const held = createEntity(registry, {
    id: 'ball-2',
    type: 'ball',
    x: 0,
    heldByPlayer: true,
  });
  return {
    ...world,
    entities: { pip, 'ball-1': ball, 'ball-2': held },
    player: { ...world.player, name: 'Alex' },
    log: [{ simTime: 10, type: 'hatch', text: 'Pip hatched', who: 'pip' }],
    moments: [{ simTime: 10, kith: 'pip', text: 'Pip hatched.' }],
    dreams: [{ simTime: 20, kith: null, text: 'ball fly sky' }],
    pendingNights: [{ kith: 'pip', since: 0, until: 20, temperature: 7.5 }],
    selectedKith: 'pip',
  };
}

describe('createEntity', () => {
  it('fills state defaults', () => {
    const pip = createEntity(registry, { id: 'pip', type: 'kith', x: 1 });
    expect(pip).toEqual({
      id: 'pip',
      type: 'kith',
      x: 1,
      state: { name: '', health: 1 },
    });
    expect('y' in pip).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(() =>
      createEntity(registry, { id: 'k', type: 'kite', x: 0 }),
    ).toThrow('Unknown entity type "kite" for entity k');
  });

  it('rejects a position that is not a number', () => {
    expect(() =>
      createEntity(registry, { id: 'b', type: 'ball', x: Number.NaN }),
    ).toThrow(/Invalid entity b:\n {2}- x: /);
  });

  it('rejects invalid state', () => {
    expect(() =>
      createEntity(registry, {
        id: 'pip',
        type: 'kith',
        x: 0,
        state: { health: 'full' },
      }),
    ).toThrow(/Invalid state for kith pip:\n {2}- health: /);
  });
});

describe('deserialiseWorld', () => {
  it('round-trips a world exactly', () => {
    const world = sampleWorld();
    const json = serialiseWorld(world);
    const loaded = deserialiseWorld(json, registry);
    expect(loaded).toEqual(world);
    expect(serialiseWorld(loaded)).toBe(json);
  });

  it('round-trips a fresh world', () => {
    const world = createWorld(1);
    expect(deserialiseWorld(serialiseWorld(world), registry)).toEqual(world);
  });

  it('fills defaults for state fields missing from a save', () => {
    const world = sampleWorld();
    const raw = JSON.parse(serialiseWorld(world)) as World;
    const loaded = validateWorld(
      {
        ...raw,
        entities: { ...raw.entities, pip: { ...raw.entities.pip, state: {} } },
      },
      registry,
    );
    expect(loaded.entities.pip?.state).toEqual({ name: '', health: 1 });
  });
});

describe('validateWorld', () => {
  const raw = () => JSON.parse(serialiseWorld(sampleWorld())) as World;
  const invalid = (world: unknown, problem: string | RegExp) =>
    expect(() => validateWorld(world, registry)).toThrow(problem);

  it('rejects an entity of an unknown type', () => {
    const world = raw();
    invalid(
      { ...world, entities: { k: { id: 'k', type: 'kite', x: 0, state: {} } } },
      'Unknown entity type "kite" for entity k',
    );
  });

  it('rejects invalid entity state', () => {
    const world = raw();
    invalid(
      {
        ...world,
        entities: {
          pip: { id: 'pip', type: 'kith', x: 0, state: { name: 3 } },
        },
      },
      /^Invalid world:\n- Invalid state for kith pip:\n {2}- name: /,
    );
  });

  it('rejects an entity stored under another id', () => {
    const world = raw();
    invalid(
      { ...world, entities: { other: world.entities.pip } },
      'entity stored under "other" has id "pip"',
    );
  });

  it('rejects the wrong schemaVersion', () => {
    invalid({ ...raw(), schemaVersion: 2 }, 'schemaVersion');
  });

  it('rejects an rng word that is not a uint32', () => {
    const world = raw();
    invalid(
      { ...world, rng: { ...world.rng, weather: [1, 2, 3, 2 ** 32] } },
      'rng.weather.3',
    );
  });

  it('lists every problem', () => {
    const world = raw();
    expect(() =>
      validateWorld(
        {
          ...world,
          entities: {
            a: { id: 'a', type: 'kite', x: 0, state: {} },
            b: { id: 'c', type: 'ball', x: 0, state: {} },
          },
        },
        registry,
      ),
    ).toThrow(/kite[\s\S]*stored under "b"/);
  });
});

describe('migrate', () => {
  const current = () => JSON.parse(serialiseWorld(createWorld(3))) as unknown;
  const fromZero = (): Migration & { calls: number } => ({
    from: 0,
    calls: 0,
    migrate() {
      this.calls++;
      return current();
    },
  });

  it('treats a save without schemaVersion as version 0', () => {
    expect(saveVersion({ v: 1 })).toBe(0);
    expect(saveVersion({ schemaVersion: 1 })).toBe(1);
    expect(() => saveVersion([])).toThrow('Save must be a JSON object');
    expect(() => saveVersion({ schemaVersion: '1' })).toThrow(
      'non-negative integer',
    );
  });

  it('runs each migration once, in order', () => {
    const migration = fromZero();
    expect(migrate({ v: 1 }, [migration])).toEqual(current());
    expect(migration.calls).toBe(1);
  });

  it('returns a current save untouched', () => {
    const migration = fromZero();
    const save = current();
    expect(migrate(save, [migration])).toBe(save);
    expect(migration.calls).toBe(0);
  });

  it('fails without a migration for the save version', () => {
    expect(() => migrate({ v: 1 }, [])).toThrow(
      'No migration from schemaVersion 0',
    );
  });

  it('refuses saves from a newer build', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 }, [])).toThrow(
      `Save schemaVersion ${SCHEMA_VERSION + 1} is newer than this build (${SCHEMA_VERSION})`,
    );
  });

  it('fails when a migration does not advance the version by one', () => {
    const stuck: Migration = { from: 0, migrate: (save) => save };
    expect(() => migrate({ v: 1 }, [stuck])).toThrow(
      'Migration from schemaVersion 0 produced version 0, expected 1',
    );
  });
});
