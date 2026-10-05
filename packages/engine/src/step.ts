import type { Command } from './command.js';
import type { GameEvent } from './event.js';
import type { World } from './world.js';

export type Presence =
  | { readonly watching: false }
  | {
      readonly watching: true;
      readonly cameraX: number;
      readonly handX: number | null;
    };

export interface StepContext {
  readonly presence: Presence;
  /** False while catching up: systems may step coarsely. */
  readonly live: boolean;
}

export interface StepResult {
  readonly world: World;
  readonly events: readonly GameEvent[];
}

export const CATCH_UP_STEP_MS = 60_000;

const catchUpContext: StepContext = {
  presence: { watching: false },
  live: false,
};

/**
 * Advances the world by `dtMs` game milliseconds, applying `commands` in
 * order. Pure: returns a new world and never mutates its input.
 *
 * Commands that act on entities have no effect until the world holds
 * entities for them to act on.
 */
export function step(
  world: World,
  dtMs: number,
  commands: readonly Command[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ctx: StepContext,
): StepResult {
  if (!Number.isFinite(dtMs) || dtMs < 0) {
    throw new RangeError(`dtMs must be finite and non-negative, got ${dtMs}`);
  }
  let next: World = {
    ...world,
    clock: { ...world.clock, simTime: world.clock.simTime + dtMs },
  };
  for (const command of commands) {
    if (command.type === 'select') {
      next = { ...next, selectedKith: command.kith };
    }
  }
  return { world: next, events: [] };
}

/** Steps unattended in coarse one-minute steps up to `toSimTime`. */
export function catchUp(world: World, toSimTime: number): StepResult {
  if (!(toSimTime >= world.clock.simTime)) {
    throw new RangeError(
      `cannot catch up from ${world.clock.simTime} to ${toSimTime}`,
    );
  }
  const events: GameEvent[] = [];
  let current = world;
  let remaining = toSimTime - world.clock.simTime;
  while (remaining > 0) {
    const dtMs = Math.min(CATCH_UP_STEP_MS, remaining);
    const result = step(current, dtMs, [], catchUpContext);
    current = result.world;
    events.push(...result.events);
    remaining -= dtMs;
  }
  return { world: current, events };
}
