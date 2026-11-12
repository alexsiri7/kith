import {
  conditionProblems,
  effectListProblems,
  type EffectContext,
  type EffectList,
  type Expr,
  type KnownContent,
  type Predicate,
} from './affordance.js';
import type { GameEvent } from './event.js';
import { affect, evaluate, test } from './interact.js';
import type { Registry } from './registry.js';
import { nextFloat } from './rng.js';
import type { World } from './world.js';

const HOUR_MS = 3_600_000;

/**
 * One thing an entity does by itself as time passes. It acts on the entity
 * as both actor and target, so the events it emits name the entity.
 */
export interface LifecycleRule {
  /** Applies only while this holds, tested each time the rule would apply. */
  readonly when?: Predicate;
  /** Applies once each time sim time passes a multiple of this, instead of every step. */
  readonly everyMs?: number;
  /** Makes `need`, `health` and `incState` amounts per game hour. Not with `everyMs`. */
  readonly perHour?: boolean;
  /** Probability in [0, 1], rolled on the `spawning` stream. Defaults to 1. */
  readonly chance?: Expr;
  readonly effects: EffectList;
  /** Applies instead when the chance roll fails. */
  readonly otherwise?: EffectList;
}

/** Rules apply in order, each step. */
export type LifecycleDef = readonly LifecycleRule[];

/** Checks a type's lifecycle, returning problems phrased to follow `type "<id>" `. */
export function lifecycleProblems(
  def: LifecycleDef,
  defaults: Readonly<Record<string, unknown>>,
  known: KnownContent,
): string[] {
  return def.flatMap((rule, i) => {
    const problems: string[] = [];
    const { everyMs, chance } = rule;
    if (everyMs !== undefined && !(everyMs > 0)) {
      problems.push(`applies every invalid ${everyMs} ms`);
    }
    if (everyMs !== undefined && rule.perHour === true) {
      problems.push('is both periodic and per hour');
    }
    if (typeof chance === 'number' && !(chance >= 0 && chance <= 1)) {
      problems.push(`has chance ${chance} outside [0, 1]`);
    }
    problems.push(
      ...conditionProblems(
        rule.when === undefined ? [] : [rule.when],
        chance === undefined ? [] : [chance],
        defaults,
        known,
      ),
      ...effectListProblems(
        [...rule.effects, ...(rule.otherwise ?? [])],
        defaults,
        known,
      ),
    );
    return problems.map((problem) => `lifecycle rule ${i + 1} ${problem}`);
  });
}

function firings(rule: LifecycleRule, from: number, to: number): number {
  if (rule.everyMs === undefined) return 1;
  return Math.floor(to / rule.everyMs) - Math.floor(from / rule.everyMs);
}

/**
 * Applies every entity's lifecycle for the time from `fromSimTime` to the
 * world's clock. An entity a rule removes skips its remaining rules.
 */
export function runLifecycles(
  world: World,
  registry: Registry,
  fromSimTime: number,
): { readonly world: World; readonly events: readonly GameEvent[] } {
  const to = world.clock.simTime;
  const hours = (to - fromSimTime) / HOUR_MS;
  const events: GameEvent[] = [];
  let next = world;
  for (const id of Object.keys(world.entities)) {
    const rules = registry.types.get(world.entities[id]!.type)?.lifecycle;
    if (rules === undefined) continue;
    const ctx: EffectContext = { actor: { kind: 'entity', id }, target: id };
    for (const rule of rules) {
      for (let n = firings(rule, fromSimTime, to); n > 0; n--) {
        if (!(id in next.entities)) break;
        if (rule.when !== undefined && !test(next, ctx, rule.when)) continue;
        let effects = rule.effects;
        if (rule.chance !== undefined) {
          const chance = evaluate(next, ctx, rule.chance);
          if (Number.isNaN(chance)) throw new Error(`${id} chance is NaN`);
          let fired = chance >= 1;
          if (chance > 0 && chance < 1) {
            const draw = nextFloat(next.rng.spawning);
            next = { ...next, rng: { ...next.rng, spawning: draw.state } };
            fired = draw.value < chance;
          }
          if (!fired) effects = rule.otherwise ?? [];
        }
        const result = affect(
          next,
          registry,
          ctx,
          effects,
          rule.perHour === true ? hours : undefined,
        );
        next = result.world;
        events.push(...result.events);
      }
    }
  }
  return { world: next, events };
}
