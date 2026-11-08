import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createEntity, type EntityType } from './entity.js';
import type { LifecycleDef } from './lifecycle.js';
import { runLifecycles } from './lifecycle.js';
import { createRegistry } from './registry.js';
import { createWorld, type World } from './world.js';

const HOUR_MS = 3_600_000;

function plant(lifecycle: LifecycleDef): EntityType {
  return {
    id: 'plant',
    category: 'plant',
    state: z.object({
      ticks: z.number().default(0),
      growth: z.number().default(0),
      ripe: z.boolean().default(false),
    }),
    body: { w: 10, h: 10 },
    perception: { salience: 0.5 },
    affordances: [],
    lifecycle,
    sprite: 'plant',
  };
}

const seed: EntityType = {
  id: 'seed',
  category: 'plant',
  state: z.object({}),
  body: { w: 4, h: 4 },
  perception: { salience: 0.1 },
  affordances: [],
  sprite: 'seed',
};

/** Runs `lifecycle` on one plant, from `from` to `to` sim ms. */
function run(lifecycle: LifecycleDef, from: number, to: number, ripe = false) {
  const registry = createRegistry({
    types: [plant(lifecycle), seed],
    needs: [],
    meanings: [],
    verbs: [],
  });
  const base = createWorld(9);
  const world: World = {
    ...base,
    clock: { ...base.clock, simTime: to },
    entities: {
      p: createEntity(registry, {
        id: 'p',
        type: 'plant',
        x: 50,
        state: { ripe },
      }),
    },
  };
  const result = runLifecycles(world, registry, from);
  return { ...result, before: world, plant: result.world.entities.p };
}

const tick = { kind: 'incState', field: 'ticks', by: 1 } as const;

describe('runLifecycles', () => {
  it('applies a periodic rule once per boundary crossed', () => {
    const every = [{ everyMs: HOUR_MS, effects: [tick] }];
    expect(run(every, 0, HOUR_MS - 1).plant?.state).toMatchObject({ ticks: 0 });
    expect(run(every, HOUR_MS - 1, HOUR_MS).plant?.state).toMatchObject({
      ticks: 1,
    });
    expect(run(every, 30 * 60_000, 5 * HOUR_MS).plant?.state).toMatchObject({
      ticks: 5,
    });
  });

  it('applies a rule only while its condition holds', () => {
    const gated = [{ when: { is: 'ripe' }, effects: [tick] }];
    expect(run(gated, 0, 1000).plant?.state).toMatchObject({ ticks: 0 });
    expect(run(gated, 0, 1000, true).plant?.state).toMatchObject({ ticks: 1 });
  });

  it('scales per-hour amounts by the time passed', () => {
    const grow = [
      {
        perHour: true,
        effects: [{ kind: 'incState', field: 'growth', by: 0.5 }] as const,
      },
    ];
    expect(run(grow, 0, HOUR_MS / 2).plant?.state).toMatchObject({
      growth: 0.25,
    });
  });

  it('rolls chances on the spawning stream alone', () => {
    const coin = [
      {
        chance: 0.5,
        everyMs: 1000,
        effects: [tick],
        otherwise: [{ kind: 'setState', field: 'ripe', value: true }] as const,
      },
    ];
    const { world, before, plant } = run(coin, 0, 40_000);
    expect(world.rng.spawning).not.toEqual(before.rng.spawning);
    expect(world.rng.behaviour).toEqual(before.rng.behaviour);
    const { ticks, ripe } = plant?.state as { ticks: number; ripe: boolean };
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThan(40);
    expect(ripe).toBe(true);
  });

  it('skips the later rules of an entity an earlier rule removed', () => {
    const { world } = run(
      [{ effects: [{ kind: 'remove' }] }, { effects: [tick] }],
      0,
      1000,
    );
    expect(world.entities).toEqual({});
  });

  it('acts as the entity, so what it emits and spawns names it', () => {
    const { world, events } = run(
      [
        {
          effects: [
            { kind: 'emit', event: 'shelterDamaged' },
            { kind: 'spawn', type: 'seed' },
          ],
        },
      ],
      0,
      1000,
    );
    expect(events).toEqual([
      { type: 'shelterDamaged', actor: 'p', target: 'p' },
    ]);
    expect(world.entities['seed-1']?.x).toBe(50);
  });
});
