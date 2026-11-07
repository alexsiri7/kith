import {
  attend,
  createEntity,
  createWorld,
  mindOf,
  step,
  type EntityInit,
  type GameEvent,
  type StepContext,
  type World,
} from '@kith/engine';
import { describe, expect, it } from 'vitest';
import { registry } from './registry.js';
import { KITH_MIND } from './tunables.js';

const MINUTE = 60_000;
const away: StepContext = {
  registry,
  presence: { watching: false },
  live: true,
};

function garden(
  seed: number,
  pip: EntityInit['state'],
  ...inits: EntityInit[]
) {
  const world = createWorld(seed);
  const entities = [
    {
      id: 'pip',
      type: 'kith',
      x: 900,
      state: { stage: 'adult', born: 0, ...(pip as object) },
    },
    ...inits,
  ].map((init) => createEntity(registry, init));
  return {
    ...world,
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  };
}

/** Steps a second at a time until `until` holds, or `limitMs` passes. */
function runUntil(
  world: World,
  until: (events: readonly GameEvent[], world: World) => boolean,
  limitMs: number,
) {
  const events: GameEvent[] = [];
  for (let t = 0; t < limitMs && !until(events, world); t += 1000) {
    const result = step(world, 1000, [], away);
    world = result.world;
    events.push(...result.events);
  }
  return { world, events };
}

const count = (events: readonly GameEvent[], type: GameEvent['type']) =>
  events.filter((e) => e.type === type).length;

const goingFor = (world: World, id: string) => {
  const { act } = mindOf(world, 'pip');
  return (
    act !== null &&
    !act.done &&
    act.target?.kind === 'entity' &&
    act.target.id === id
  );
};

const bored = {
  hunger: 0.2,
  cold: 0,
  tired: 0.1,
  bored: 1,
  lonely: 0.2,
  fear: 0,
};

describe('a Kith’s brain on the garden’s content', () => {
  it('avoids the hive once it has been stung twice', () => {
    // A slow learner: one sting is not enough to put it off.
    const genome = {
      curiosity: 0.5,
      hardiness: 0.5,
      sociability: 0.5,
      learnRate: 0.7,
    };
    const start = garden(
      600,
      { needs: bored, genome },
      { id: 'hive', type: 'beehive', x: 1000 },
    );
    const stung = runUntil(
      start,
      (e) => count(e, 'stung') === 2,
      12 * 60 * MINUTE,
    );
    expect(count(stung.events, 'stung')).toBe(2);
    const opinion = mindOf(stung.world, 'pip').opinions.beehive!;
    expect(opinion).toBeLessThan(KITH_MIND.attention.avoidBelow);
    expect(attend(stung.world, registry, 'pip')).toEqual([]);

    const after = runUntil(
      stung.world,
      (events, world) => goingFor(world, 'hive') || count(events, 'stung') > 0,
      6 * 60 * MINUTE,
    );
    expect(goingFor(after.world, 'hive')).toBe(false);
    expect(count(after.events, 'stung')).toBe(0);
  });

  it('stops at the river bank once it has fallen in twice', () => {
    const start = garden(
      600,
      { needs: bored },
      { id: 'river', type: 'river', x: 1240 },
      { id: 'cactus', type: 'cactus', x: 1500 },
    );
    const fell = runUntil(
      start,
      (e) => count(e, 'fellIn') === 2,
      2 * 60 * MINUTE,
    );
    expect(count(fell.events, 'fellIn')).toBe(2);
    const climbedOut = runUntil(
      fell.world,
      (_, world) => mindOf(world, 'pip').inZone === null,
      5 * MINUTE,
    ).world;
    expect(climbedOut.entities.pip!.x).toBeLessThan(1180);

    const pip = mindOf(climbedOut, 'pip');
    const wandering = {
      ...climbedOut,
      entities: {
        ...climbedOut.entities,
        pip: {
          ...climbedOut.entities.pip!,
          state: {
            ...(climbedOut.entities.pip!.state as object),
            act: {
              verb: 'wander',
              target: null,
              type: null,
              category: 'self',
              need: 'bored',
              before: pip.needs,
              until: climbedOut.clock.simTime + 10 * MINUTE,
              tx: 1600,
              engagedUntil: null,
              done: false,
            },
          },
        },
      },
    };
    const stopped = runUntil(
      wandering,
      (events) => count(events, 'avoided') > 0 || count(events, 'fellIn') > 0,
      10 * MINUTE,
    );
    expect(count(stopped.events, 'fellIn')).toBe(0);
    expect(stopped.events).toContainEqual({
      type: 'avoided',
      actor: 'pip',
      target: 'river',
    });
    expect(stopped.world.entities.pip!.x).toBe(1180 - 8);
  });
});
