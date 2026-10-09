import type { Command } from './command.js';
import type { GameEvent } from './event.js';
import { interact } from './interact.js';
import type { Registry } from './registry.js';
import type { World } from './world.js';

export type Presence =
  | { readonly watching: false }
  | {
      readonly watching: true;
      readonly cameraX: number;
      readonly handX: number | null;
    };

export interface StepContext {
  readonly registry: Registry;
  readonly presence: Presence;
  /** False while catching up: systems may step coarsely. */
  readonly live: boolean;
}

export interface StepResult {
  readonly world: World;
  readonly events: readonly GameEvent[];
}

export const CATCH_UP_STEP_MS = 60_000;

/**
 * Advances the world by `dtMs` game milliseconds, applying `commands` in
 * order. Pure: returns a new world and never mutates its input.
 *
 * `use` is the player's interaction through the target's affordances and
 * does nothing when refused. Other commands that act on entities have no
 * effect yet.
 */
export function step(
  world: World,
  dtMs: number,
  commands: readonly Command[],
  ctx: StepContext,
): StepResult {
  if (!Number.isFinite(dtMs) || dtMs < 0) {
    throw new RangeError(`dtMs must be finite and non-negative, got ${dtMs}`);
  }
  let next: World = {
    ...world,
    clock: { ...world.clock, simTime: world.clock.simTime + dtMs },
  };
  const events: GameEvent[] = [];
  for (const command of commands) {
    if (command.type === 'select') {
      next = { ...next, selectedKith: command.kith };
    } else if (command.type === 'use') {
      const result = interact(next, ctx.registry, {
        actor: { kind: 'player' },
        target: command.entity,
        verb: command.verb,
      });
      if (result.ok) {
        next = result.world;
        events.push(...result.events);
      }
    }
  }
  return { world: next, events };
}

/** Steps unattended in coarse one-minute steps up to `toSimTime`. */
export function catchUp(
  world: World,
  registry: Registry,
  toSimTime: number,
): StepResult {
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
    const result = step(current, dtMs, [], {
      registry,
      presence: { watching: false },
      live: false,
    });
    current = result.world;
    events.push(...result.events);
    remaining -= dtMs;
  }
  return { world: current, events };
}
