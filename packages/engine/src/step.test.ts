import { describe, expect, it } from 'vitest';
import type { Command } from './command.js';
import type { GameEvent } from './event.js';
import { nextFloat, nextUint32, seedStream, type RngState } from './rng.js';
import { CATCH_UP_STEP_MS, catchUp, step, type StepContext } from './step.js';
import { createWorld, serialiseWorld, type World } from './world.js';

const live: StepContext = {
  presence: { watching: true, cameraX: 0, handX: null },
  live: true,
};

interface Frame {
  readonly dtMs: number;
  readonly commands: readonly Command[];
}

/** A player session in 10 ms real frames (60 game ms) with occasional commands. */
function session(realMs: number, seed: number): Frame[] {
  let state: RngState = seedStream(seed, 'test-session');
  const roll = () => {
    const draw = nextFloat(state);
    state = draw.state;
    return draw.value;
  };
  const pool: Command[] = [
    { type: 'tickle' },
    { type: 'say', text: 'ball', pointing: 'ball-1' },
    { type: 'kick', target: 'ball-1', dir: 1, power: 0.5 },
    { type: 'select', kith: 'kith-1' },
    { type: 'select', kith: 'kith-2' },
    { type: 'buy', sku: 'apple', x: 120 },
  ];
  const frames: Frame[] = [];
  for (let t = 0; t < realMs; t += 10) {
    const commands =
      roll() < 0.01 ? [pool[Math.floor(roll() * pool.length)]!] : [];
    frames.push({ dtMs: 60, commands });
  }
  return frames;
}

function run(world: World, frames: readonly Frame[]) {
  const snapshots: string[] = [];
  const events: GameEvent[] = [];
  for (const frame of frames) {
    const result = step(world, frame.dtMs, frame.commands, live);
    world = result.world;
    events.push(...result.events);
    snapshots.push(serialiseWorld(world));
  }
  return { world, events, snapshots };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('step', () => {
  it('produces byte-identical worlds from the same seed and commands', () => {
    const frames = session(60_000, 1);
    const a = run(createWorld(1234), frames);
    const b = run(createWorld(1234), frames);
    expect(serialiseWorld(a.world)).toBe(serialiseWorld(b.world));
    expect(serialiseWorld(createWorld(1234))).not.toBe(
      serialiseWorld(createWorld(1235)),
    );
  });

  it('replays a recorded 30-minute session exactly', () => {
    const frames = session(30 * 60_000, 2);
    expect(frames.some((f) => f.commands.length > 0)).toBe(true);
    const recorded = run(createWorld(99), frames);
    const log = JSON.stringify({ seed: 99, frames });

    const replayLog = JSON.parse(log) as { seed: number; frames: Frame[] };
    const replayed = run(createWorld(replayLog.seed), replayLog.frames);

    expect(replayed.snapshots).toEqual(recorded.snapshots);
    expect(replayed.events).toEqual(recorded.events);
    expect(recorded.world.clock.simTime).toBe(30 * 60_000 * 6);
  });

  it('does not mutate its input', () => {
    const world = deepFreeze(createWorld(5));
    const before = serialiseWorld(world);
    const result = step(world, 1000, [{ type: 'select', kith: 'k' }], live);
    expect(serialiseWorld(world)).toBe(before);
    expect(result.world.clock.simTime).toBe(1000);
    expect(result.world.selectedKith).toBe('k');
  });

  it('carries the rng state forward unchanged', () => {
    const world = createWorld(5);
    const weather = nextUint32(world.rng.weather).state;
    const advanced = { ...world, rng: { ...world.rng, weather } };
    const { world: next } = step(advanced, 1000, [], live);
    expect(next.rng).toEqual(advanced.rng);
    expect(next.rng).not.toEqual(createWorld(5).rng);
  });

  it('applies commands in order', () => {
    const { world } = step(
      createWorld(5),
      0,
      [
        { type: 'select', kith: 'a' },
        { type: 'select', kith: 'b' },
      ],
      live,
    );
    expect(world.selectedKith).toBe('b');
  });

  it('rejects negative or non-finite time steps', () => {
    for (const dtMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => step(createWorld(5), dtMs, [], live)).toThrow(RangeError);
    }
  });
});

describe('catchUp', () => {
  it('advances to the target time in one-minute steps', () => {
    const target = 10 * CATCH_UP_STEP_MS + 1234;
    const { world } = catchUp(createWorld(5), target);
    expect(world.clock.simTime).toBe(target);
  });

  it('matches stepping the same intervals unattended', () => {
    const target = 3 * CATCH_UP_STEP_MS + 500;
    let world = createWorld(8);
    for (const dtMs of [
      CATCH_UP_STEP_MS,
      CATCH_UP_STEP_MS,
      CATCH_UP_STEP_MS,
      500,
    ]) {
      world = step(world, dtMs, [], {
        presence: { watching: false },
        live: false,
      }).world;
    }
    expect(serialiseWorld(catchUp(createWorld(8), target).world)).toBe(
      serialiseWorld(world),
    );
  });

  it('refuses to go back in time', () => {
    const { world } = step(createWorld(5), 1000, [], live);
    expect(() => catchUp(world, 500)).toThrow(RangeError);
  });
});
