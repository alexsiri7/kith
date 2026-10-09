import {
  createEntity,
  createWorld,
  interact,
  serialiseWorld,
  step,
  type Actor,
  type EntityInit,
  type Interaction,
  type World,
} from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { registry } from './registry.js';

const NOW = 50_000;
const pip: Actor = { kind: 'entity', id: 'pip' };
const player: Actor = { kind: 'player' };

function garden(seed: number, ...inits: EntityInit[]): World {
  const world = createWorld(seed);
  const entities = [{ id: 'pip', type: 'kith', x: 0 }, ...inits].map((init) =>
    createEntity(registry, init),
  );
  return {
    ...world,
    clock: { ...world.clock, simTime: NOW },
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  };
}

function resolved(world: World, interaction: Interaction) {
  const result = interact(world, registry, interaction);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const stateOf = (world: World, id: string) =>
  world.entities[id]?.state as Record<string, unknown>;
const needsOf = (world: World) =>
  stateOf(world, 'pip').needs as Record<string, number>;

/** How often outcome `i` fires across seeds 0 to `runs - 1`. */
function rate(
  runs: number,
  i: number,
  world: (seed: number) => World,
  interaction: Interaction,
): number {
  let fired = 0;
  for (let seed = 0; seed < runs; seed++) {
    if (resolved(world(seed), interaction).outcomes[i]!.fired) fired++;
  }
  return fired / runs;
}

/** The first seed whose outcome `i` fires (or not), and its result. */
function firstWhere(
  fired: boolean,
  i: number,
  world: (seed: number) => World,
  interaction: Interaction,
) {
  for (let seed = 0; ; seed++) {
    const result = resolved(world(seed), interaction);
    if (result.outcomes[i]!.fired === fired) return result;
  }
}

describe('beehive poke', () => {
  const hive =
    (honey: number, anger = 0) =>
    (seed: number) =>
      garden(seed, {
        id: 'hive',
        type: 'beehive',
        x: 20,
        state: { honey, anger },
      });
  const poke: Interaction = { actor: pip, target: 'hive', verb: 'poke' };

  it('gives honey while there is any, and angers the bees', () => {
    const { world, events, outcomes } = firstWhere(false, 2, hive(2), poke);
    expect(stateOf(world, 'hive')).toMatchObject({ honey: 1, anger: 0.45 });
    expect(needsOf(world)).toMatchObject({ hunger: 0, bored: 0 });
    expect(events).toEqual([
      { type: 'gotHoney', actor: 'pip', target: 'hive' },
    ]);
    expect(outcomes[0]).toEqual({ chance: 1, fired: true, valence: 0.3 });

    const empty = firstWhere(false, 2, hive(0), poke);
    expect(stateOf(empty.world, 'hive')).toMatchObject({ honey: 0 });
    expect(needsOf(empty.world).hunger).toBe(0.3);
    expect(empty.outcomes[0]?.fired).toBe(false);
  });

  it('stings with a seeded chance that rises with anger', () => {
    const chance = (world: (seed: number) => World) =>
      resolved(world(0), poke).outcomes[2]?.chance;
    expect(chance(hive(2))).toBe(0.3);
    expect(chance(hive(0))).toBe(0.55);
    expect(chance(hive(2, 0.6))).toBeCloseTo(0.6);
    expect(chance(hive(0, 1))).toBe(1);
    expect(rate(2000, 2, hive(2), poke)).toBeCloseTo(0.3, 1);
    expect(rate(2000, 2, hive(0), poke)).toBeCloseTo(0.55, 1);
  });

  it('a sting hurts, scares, swarms and sends the Kith fleeing', () => {
    const { world, events, valence } = firstWhere(true, 2, hive(0), poke);
    const until = (ms: number) => NOW + ms;
    expect(stateOf(world, 'pip')).toMatchObject({
      health: 0.95,
      fleeing: { from: 'hive', until: until(8000) },
    });
    expect(needsOf(world).fear).toBe(0.5);
    expect(stateOf(world, 'hive').swarm).toEqual({
      victim: 'pip',
      until: until(6000),
    });
    expect(events).toEqual([{ type: 'stung', actor: 'pip', target: 'hive' }]);
    expect(valence).toBe(-0.7);
  });

  it('can be dry-run without changing the world', () => {
    const world = hive(2)(7);
    const before = serialiseWorld(world);
    const preview = resolved(world, poke);
    expect(serialiseWorld(world)).toBe(before);
    expect(preview.outcomes.map((o) => o.chance)).toEqual([1, 1, 0.3]);
    expect(resolved(world, poke)).toEqual(preview);
  });
});

describe('cactus poke', () => {
  const cactus = (seed: number) =>
    garden(seed, { id: 'cactus', type: 'cactus', x: 20 });
  const poke: Interaction = { actor: pip, target: 'cactus', verb: 'poke' };

  it('pricks 85% of the time', () => {
    expect(rate(2000, 0, cactus, poke)).toBeCloseTo(0.85, 1);
  });

  it('a prick hurts and scares', () => {
    const { world, events, valence } = firstWhere(true, 0, cactus, poke);
    expect(stateOf(world, 'pip').health).toBe(0.98);
    expect(needsOf(world).fear).toBe(0.3);
    expect(events).toEqual([
      { type: 'pricked', actor: 'pip', target: 'cactus' },
    ]);
    expect(valence).toBe(-0.55);
  });

  it('otherwise is mildly interesting', () => {
    const { world, events, valence } = firstWhere(false, 0, cactus, poke);
    expect(stateOf(world, 'pip').health).toBe(1);
    expect(needsOf(world).bored).toBe(0);
    expect(events).toEqual([]);
    expect(valence).toBe(0.05);
  });
});

describe('red mushroom eat', () => {
  it('is eaten and makes the Kith sick', () => {
    const world = garden(1, { id: 'm', type: 'mushroom-red', x: 5 });
    const result = resolved(world, { actor: pip, target: 'm', verb: 'eat' });
    expect(result.world.entities.m).toBeUndefined();
    expect(stateOf(result.world, 'pip')).toMatchObject({
      health: 0.92,
      sickUntil: NOW + 2 * 3_600_000,
    });
    expect(needsOf(result.world)).toMatchObject({ hunger: 0.35, fear: 0.3 });
    expect(result.events).toEqual([
      { type: 'ate', actor: 'pip', target: 'm' },
      { type: 'sick', actor: 'pip', target: 'm' },
    ]);
    expect(result.valence).toBe(-0.6);
  });
});

describe('top spin', () => {
  it('spins for eight seconds, for the player or a Kith', () => {
    const world = garden(1, { id: 'top', type: 'top', x: 5 });
    for (const actor of [player, pip]) {
      const spun = resolved(world, { actor, target: 'top', verb: 'spin' });
      expect(stateOf(spun.world, 'top').spinUntil).toBe(NOW + 8000);
    }
  });
});

describe('lever use', () => {
  const world = garden(
    1,
    { id: 'river', type: 'river', x: 1240 },
    { id: 'lever', type: 'lever', x: 1135 },
  );
  const use = { type: 'use', entity: 'lever', verb: 'use' } as const;
  const ctx = { registry, presence: { watching: false }, live: true } as const;
  const bridge = (w: World) => stateOf(w, 'river').bridge;

  it('toggles the bridge zone when the player pulls it', () => {
    const down = step(world, 0, [use], ctx).world;
    expect(bridge(down)).toBe(true);
    expect(bridge(step(down, 0, [use], ctx).world)).toBe(false);
  });

  it('is not for Kith', () => {
    expect(
      interact(world, registry, { actor: pip, target: 'lever', verb: 'use' }),
    ).toEqual({ ok: false, reason: 'kith cannot use lever' });
  });
});

describe('food machine use', () => {
  it('drops a cake while it has stock', () => {
    let world = garden(1, { id: 'machine', type: 'food-machine', x: 1760 });
    const use: Interaction = { actor: player, target: 'machine', verb: 'use' };
    for (let i = 1; i <= 3; i++) {
      world = resolved(world, i === 2 ? { ...use, actor: pip } : use).world;
      expect(world.entities[`cake-${i}`]).toMatchObject({
        type: 'cake',
        x: 1760,
      });
    }
    expect(stateOf(world, 'machine').stock).toBe(0);
    expect(interact(world, registry, use)).toEqual({
      ok: false,
      reason: 'food-machine cannot be used for use now',
    });
  });
});
