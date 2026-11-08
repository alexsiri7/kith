import {
  catchUp,
  createEntity,
  createWorld,
  GAME_DAY_MS,
  step,
  weatherAt,
  type EntityInit,
  type GameEvent,
  type StepContext,
  type World,
} from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { SHADY_SPOTS, TREE_X } from './entity-types.js';
import { registry } from './registry.js';

const HOUR_MS = 3_600_000;
const SEED = 600;
const away: StepContext = {
  registry,
  presence: { watching: false },
  live: false,
};

function garden(simTime: number, ...inits: EntityInit[]): World {
  const world = createWorld(SEED);
  const entities = inits.map((init) => createEntity(registry, init));
  return {
    ...world,
    clock: { ...world.clock, simTime },
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  };
}

function stateOf(world: World, id: string) {
  return world.entities[id]?.state as Record<string, unknown> | undefined;
}

/** The first whole hour from `from` at which `holds` is true of the weather. */
function firstHour(holds: (hour: number) => boolean, from = 0): number {
  for (let t = from; t < from + 400 * GAME_DAY_MS; t += HOUR_MS) {
    if (holds(t)) return t;
  }
  throw new Error('no such hour');
}

const temp = (t: number) => weatherAt(SEED, t).temp;
const storm = (t: number) => weatherAt(SEED, t).storm;
const count = (events: readonly GameEvent[], type: GameEvent['type']) =>
  events.filter((e) => e.type === type).length;

describe('ecology', () => {
  it('grows carrots only above 4 °C', () => {
    const grown = (t: number) => {
      const world = garden(t, { id: 'c', type: 'carrot', x: 0 });
      return stateOf(step(world, HOUR_MS, [], away).world, 'c')?.growth;
    };
    expect(grown(firstHour((t) => temp(t + HOUR_MS) > 4))).toBe(0.2 + 1 / 8);
    expect(grown(firstHour((t) => temp(t + HOUR_MS) <= 4))).toBe(0.2);
  });

  it('regrows berries every three warm hours, up to four', () => {
    const world = garden(0, { id: 'b', type: 'berry-bush', x: 0 });
    for (const days of [1, 10]) {
      const to = days * GAME_DAY_MS;
      let warm = 0;
      for (let t = 3 * HOUR_MS; t <= to; t += 3 * HOUR_MS) {
        if (temp(t) > 4) warm++;
      }
      const { world: later } = catchUp(world, registry, to);
      expect(stateOf(later, 'b')?.berries).toBe(Math.min(4, warm));
    }
    expect(
      stateOf(catchUp(world, registry, 10 * GAME_DAY_MS).world, 'b'),
    ).toEqual({ berries: 4 });
  });

  it('refills the beehive every six warm hours, up to two', () => {
    const world = garden(0, {
      id: 'h',
      type: 'beehive',
      x: 0,
      state: { honey: 0 },
    });
    const to = 2 * GAME_DAY_MS;
    let warm = 0;
    for (let t = 6 * HOUR_MS; t <= to; t += 6 * HOUR_MS) {
      if (temp(t) > 6) warm++;
    }
    expect(stateOf(catchUp(world, registry, to).world, 'h')?.honey).toBe(
      Math.min(2, warm),
    );
  });

  it('brings up brown and red mushrooms in the shade, four at most', () => {
    let world = garden(0, { id: 'shade', type: 'shade', x: TREE_X });
    const seen = new Set<string>();
    for (let t = 12 * HOUR_MS; t <= 10 * GAME_DAY_MS; t += 12 * HOUR_MS) {
      world = catchUp(world, registry, t).world;
      const mushrooms = Object.values(world.entities).filter(
        (e) => e.type !== 'shade',
      );
      expect(mushrooms.length).toBeLessThanOrEqual(4);
      for (const m of mushrooms) {
        seen.add(m.type);
        const offset = m.x - TREE_X;
        expect(SHADY_SPOTS.some((s) => Math.abs(offset - s) <= 25)).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(['mushroom-brown', 'mushroom-red']);
  });

  it('rots food after three garden days and clears it after five', () => {
    const world = garden(0, { id: 'cake', type: 'cake', x: 0 });
    const at = (t: number) =>
      stateOf(catchUp(world, registry, t).world, 'cake');
    expect(at(3 * GAME_DAY_MS)).toMatchObject({ rotten: false });
    expect(at(3 * GAME_DAY_MS + HOUR_MS)).toMatchObject({ rotten: true });
    expect(at(5 * GAME_DAY_MS)).toBeDefined();
    expect(at(5 * GAME_DAY_MS + HOUR_MS)).toBeUndefined();
  });

  it('stamps the food machine’s cake with the time it came out', () => {
    const world = garden(4 * GAME_DAY_MS, {
      id: 'fm',
      type: 'food-machine',
      x: 0,
    });
    const { world: fed } = step(
      world,
      1000,
      [{ type: 'use', entity: 'fm', verb: 'use' }],
      away,
    );
    expect(stateOf(fed, 'cake-1')).toEqual({
      born: 4 * GAME_DAY_MS + 1000,
      rotten: false,
    });
  });

  it('restocks the food machine to three each garden day', () => {
    const world = garden(GAME_DAY_MS - 2 * HOUR_MS, {
      id: 'fm',
      type: 'food-machine',
      x: 0,
      state: { stock: 0 },
    });
    const at = (t: number) => stateOf(catchUp(world, registry, t).world, 'fm');
    expect(at(GAME_DAY_MS - 1)).toEqual({ stock: 0 });
    expect(at(GAME_DAY_MS)).toEqual({ stock: 3 });
  });

  it('wears a shelter down in storms, telling of the damage once', () => {
    // A storm of at least four hours: enough to take 0.4 below 0.3.
    const onset = firstHour(
      (t) =>
        !storm(t - HOUR_MS) &&
        [0, 1, 2, 3].every((h) => storm(t + h * HOUR_MS)),
      HOUR_MS,
    );
    const world = garden(onset, {
      id: 's',
      type: 'shelter',
      x: 0,
      state: { integrity: 0.4 },
    });
    const storming = catchUp(world, registry, onset + 4 * HOUR_MS);
    expect(stateOf(storming.world, 's')).toMatchObject({ damaged: true });
    expect(stateOf(storming.world, 's')?.integrity).toBeLessThan(0.3);
    const after = catchUp(world, registry, onset + 2 * GAME_DAY_MS);
    expect(count(after.events, 'shelterDamaged')).toBe(1);
    expect(after.events.find((e) => e.type === 'shelterDamaged')).toEqual({
      type: 'shelterDamaged',
      actor: 's',
      target: 's',
    });
    expect(stateOf(after.world, 's')).toMatchObject({ damaged: false });
  });
});

describe('the river', () => {
  const river = { id: 'river', type: 'river', x: 1240 };

  it('raises a lowered bridge in a storm', () => {
    const onset = firstHour((t) => storm(t) && !storm(t - HOUR_MS), HOUR_MS);
    const world = garden(onset - HOUR_MS, {
      ...river,
      state: { bridge: true },
    });
    const before = catchUp(world, registry, onset - 1);
    expect(stateOf(before.world, 'river')).toEqual({ bridge: true });
    const { world: after, events } = catchUp(world, registry, onset);
    expect(stateOf(after, 'river')).toEqual({ bridge: false });
    expect(events).toEqual([
      { type: 'bridgeRaised', actor: 'river', target: 'river' },
    ]);
  });

  it('floats a ball to the nearer bank and sinks a cake', () => {
    const t = firstHour((t) => ![0, 1].some((h) => storm(t + h * HOUR_MS)));
    const world = garden(
      t,
      river,
      { id: 'ball', type: 'ball', x: 1200 },
      { id: 'cake', type: 'cake', x: 1250, state: { born: t } },
    );
    const { world: after } = catchUp(world, registry, t + HOUR_MS);
    expect(after.entities.ball?.x).toBe(1180 - 14);
    expect(after.entities.cake).toBeUndefined();
  });
});
