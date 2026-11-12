import {
  createEntity,
  createWorld,
  lexiconOf,
  step,
  type EntityInit,
  type StepContext,
  type World,
} from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { registry } from './registry.js';

const MINUTE = 60_000;
const HAND_X = 1000;

// The player watches with the hand among them, so the lonely Kith keep
// coming back to it instead of wandering out of earshot.
const watching: StepContext = {
  registry,
  presence: { watching: true, cameraX: HAND_X, handX: HAND_X },
  live: true,
};

const calm = { hunger: 0.2, cold: 0, tired: 0.1, bored: 0, lonely: 0, fear: 0 };
const lonely = { ...calm, lonely: 1 };

function kith(id: string, x: number, state: object): EntityInit {
  return {
    id,
    type: 'kith',
    x,
    state: { stage: 'adult', born: 0, name: id, ...state },
  };
}

function garden(seed: number): World {
  const world = createWorld(seed);
  const entities = [
    kith('mum', HAND_X, {
      needs: { ...lonely, hunger: 0.9 },
      lexicon: { yum: { meaning: 'hungry', strength: 0.9 } },
    }),
    kith('kid', HAND_X + 60, { needs: lonely, parents: ['mum'] }),
    kith('stranger', HAND_X - 60, { needs: lonely }),
    kith('far', 2300, { needs: calm }),
  ].map((init) => createEntity(registry, init));
  return {
    ...world,
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  };
}

const strength = (world: World, id: string) =>
  lexiconOf(world, registry, id).yum?.strength ?? 0;

describe('word spread', () => {
  it('passes a word from Kith to Kith in earshot, to a child fastest', () => {
    let world = garden(3);
    let nearest = Infinity;
    for (
      let t = 0;
      t < 30 * MINUTE && strength(world, 'kid') < 0.3;
      t += 1000
    ) {
      world = step(world, 1000, [], watching).world;
      const mum = world.entities.mum!.x;
      nearest = Math.min(nearest, Math.abs(world.entities.far!.x - mum));
    }
    expect(strength(world, 'kid')).toBeGreaterThanOrEqual(0.3);
    expect(lexiconOf(world, registry, 'kid').yum?.meaning).toBe('hungry');
    expect(strength(world, 'kid')).toBeGreaterThan(strength(world, 'stranger'));
    expect(strength(world, 'stranger')).toBeGreaterThan(0);
    // Out of earshot all along, it never heard the word.
    expect(nearest).toBeGreaterThan(180);
    expect(strength(world, 'far')).toBe(0);
  });
});
