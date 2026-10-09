import type {
  ActorKind,
  AffordanceDef,
  ContinuousEffect,
  Effect,
  EffectContext,
  Expr,
  Predicate,
  Subject,
} from './affordance.js';
import {
  createEntity,
  type Category,
  type Entity,
  type VerbId,
} from './entity.js';
import type { GameEvent } from './event.js';
import type { Registry } from './registry.js';
import { nextFloat } from './rng.js';
import type { EntityId, World } from './world.js';

export interface Interaction extends EffectContext {
  readonly verb: VerbId;
}

export interface Refusal {
  readonly ok: false;
  readonly reason: string;
}

export interface OutcomeRoll {
  /** The outcome's chance, evaluated before any outcome applied. */
  readonly chance: number;
  readonly fired: boolean;
  /** Valence of whichever branch applied, or 0 when none did. */
  readonly valence: number;
}

export type InteractionResult =
  | Refusal
  | {
      readonly ok: true;
      readonly world: World;
      readonly events: readonly GameEvent[];
      /** One roll per declared outcome, in order. */
      readonly outcomes: readonly OutcomeRoll[];
      readonly valence: number;
    };

type State = Readonly<Record<string, unknown>>;

const ACTOR_KINDS: Partial<Record<Category, ActorKind>> = {
  kith: 'kith',
  robot: 'robot',
  critter: 'critter',
};

function isRecord(value: unknown): value is State {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function entityOf(world: World, id: EntityId): Entity {
  const entity = world.entities[id];
  if (entity === undefined) throw new Error(`No entity "${id}"`);
  return entity;
}

function stateOf(entity: Entity): State {
  if (!isRecord(entity.state)) {
    throw new Error(`${entity.type} ${entity.id} has no state fields`);
  }
  return entity.state;
}

function withEntity(world: World, entity: Entity): World {
  return { ...world, entities: { ...world.entities, [entity.id]: entity } };
}

function actorId(ctx: EffectContext): EntityId | null {
  return ctx.actor.kind === 'entity' ? ctx.actor.id : null;
}

function resolve(
  world: World,
  ctx: EffectContext,
  subject: Subject = 'target',
): EntityId {
  if (subject === 'target') return ctx.target;
  if (subject === 'actor') {
    const id = actorId(ctx);
    if (id === null) throw new Error('The player has no entity');
    return id;
  }
  const id = stateOf(entityOf(world, ctx.target))[subject.linked];
  if (typeof id !== 'string') {
    throw new Error(`${ctx.target}.${subject.linked} does not name an entity`);
  }
  return entityOf(world, id).id;
}

function field(world: World, id: EntityId, name: string): unknown {
  const entity = entityOf(world, id);
  const state = stateOf(entity);
  if (!(name in state)) {
    throw new Error(`${entity.type} ${id} has no state field "${name}"`);
  }
  return state[name];
}

function typed<T>(
  value: unknown,
  check: (value: unknown) => value is T,
  what: string,
): T {
  if (!check(value)) throw new Error(`${what} is ${JSON.stringify(value)}`);
  return value;
}

const isNumber = (value: unknown): value is number => typeof value === 'number';
const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean';

export function evaluate(world: World, ctx: EffectContext, expr: Expr): number {
  if (typeof expr === 'number') return expr;
  if (expr === 'now') return world.clock.simTime;
  if ('state' in expr) {
    const id = resolve(world, ctx, expr.of);
    return typed(field(world, id, expr.state), isNumber, `${id}.${expr.state}`);
  }
  if ('sum' in expr) {
    return expr.sum.reduce<number>(
      (total, e) => total + evaluate(world, ctx, e),
      0,
    );
  }
  if ('product' in expr) {
    return expr.product.reduce<number>(
      (total, e) => total * evaluate(world, ctx, e),
      1,
    );
  }
  return evaluate(
    world,
    ctx,
    test(world, ctx, expr.if) ? expr.then : expr.else,
  );
}

export function test(
  world: World,
  ctx: EffectContext,
  predicate: Predicate,
): boolean {
  if ('is' in predicate) {
    const id = resolve(world, ctx, predicate.of);
    return typed(
      field(world, id, predicate.is),
      isBoolean,
      `${id}.${predicate.is}`,
    );
  }
  if ('gt' in predicate) {
    const [a, b] = predicate.gt;
    return evaluate(world, ctx, a) > evaluate(world, ctx, b);
  }
  if ('lt' in predicate) {
    const [a, b] = predicate.lt;
    return evaluate(world, ctx, a) < evaluate(world, ctx, b);
  }
  if ('not' in predicate) return !test(world, ctx, predicate.not);
  if ('all' in predicate)
    return predicate.all.every((p) => test(world, ctx, p));
  return predicate.any.some((p) => test(world, ctx, p));
}

/**
 * Replaces one state field of an entity, then checks the whole state against
 * its type so an effect can never leave an entity invalid.
 */
function setField(
  world: World,
  registry: Registry,
  id: EntityId,
  name: string,
  update: (current: unknown) => unknown,
): World {
  const entity = entityOf(world, id);
  const state = { ...stateOf(entity), [name]: update(field(world, id, name)) };
  const parsed = registry.types.get(entity.type)?.state.safeParse(state);
  if (parsed === undefined) {
    throw new Error(`Unknown entity type "${entity.type}" for entity ${id}`);
  }
  if (!parsed.success) {
    throw new Error(
      `Effect left ${entity.type} ${id} invalid: ${parsed.error.message}`,
    );
  }
  return withEntity(world, { ...entity, state: parsed.data });
}

function freeId(world: World, type: string): EntityId {
  let n = 1;
  while (`${type}-${n}` in world.entities) n++;
  return `${type}-${n}`;
}

function actorEffect(
  world: World,
  registry: Registry,
  ctx: EffectContext,
  effect: Effect,
  events: GameEvent[],
): World {
  const id = actorId(ctx);
  if (id === null) return world;
  const now = world.clock.simTime;
  const set = (name: string, update: (current: unknown) => unknown) =>
    setField(world, registry, id, name, update);
  switch (effect.kind) {
    case 'need':
      return set('needs', (needs) => {
        const current = isRecord(needs) ? needs[effect.need] : undefined;
        if (!isRecord(needs) || typeof current !== 'number') {
          throw new Error(`${id} has no need "${effect.need}"`);
        }
        return { ...needs, [effect.need]: clamp(current + effect.delta) };
      });
    case 'health':
      return set('health', (health) =>
        clamp(typed(health, isNumber, `${id}.health`) + effect.delta),
      );
    case 'flee':
      return set('fleeing', () => ({
        from: resolve(world, ctx, effect.from),
        until: now + effect.ms,
      }));
    case 'teach':
      return set('lexicon', (lexicon) => {
        const entry = isRecord(lexicon) ? lexicon[effect.word] : undefined;
        const known =
          isRecord(entry) &&
          entry.meaning === effect.meaning &&
          typeof entry.strength === 'number'
            ? entry.strength
            : 0;
        return {
          ...(isRecord(lexicon) ? lexicon : {}),
          [effect.word]: {
            meaning: effect.meaning,
            strength: clamp(known + effect.strength),
          },
        };
      });
    case 'emit':
      events.push({ type: effect.event, actor: id, target: ctx.target });
      return world;
    case 'moment':
      return {
        ...world,
        moments: [
          ...world.moments,
          { simTime: now, kith: id, text: effect.text },
        ],
        player: {
          ...world.player,
          coins: world.player.coins + (effect.coins ?? 0),
        },
      };
    case 'swarm':
      return setField(world, registry, ctx.target, 'swarm', () => ({
        victim: id,
        until: now + effect.ms,
      }));
    case 'sick':
      return set('sickUntil', (until) =>
        Math.max(typed(until, isNumber, `${id}.sickUntil`), now + effect.ms),
      );
    case 'bias':
      return set('biases', (biases) => [
        ...(Array.isArray(biases) ? biases : []).filter(
          (bias: unknown) =>
            isRecord(bias) &&
            typeof bias.until === 'number' &&
            bias.until > now,
        ),
        {
          verb: effect.verb,
          until: now + effect.ms,
          strength: effect.strength,
        },
      ]);
    default:
      throw new Error(`${effect.kind} is not an effect on the actor`);
  }
}

function applyEffect(
  world: World,
  registry: Registry,
  ctx: EffectContext,
  effect: Effect,
  events: GameEvent[],
): World {
  switch (effect.kind) {
    case 'setState': {
      const { value } = effect;
      const next =
        typeof value === 'boolean'
          ? value
          : typeof value === 'object' && 'test' in value
            ? test(world, ctx, value.test)
            : evaluate(world, ctx, value);
      const id = resolve(world, ctx, effect.of);
      return setField(world, registry, id, effect.field, () => next);
    }
    case 'incState': {
      const id = resolve(world, ctx, effect.of);
      const [min, max] = effect.range ?? [-Infinity, Infinity];
      return setField(world, registry, id, effect.field, (current) =>
        clamp(
          typed(current, isNumber, `${id}.${effect.field}`) + effect.by,
          min,
          max,
        ),
      );
    }
    case 'spawn': {
      const id = freeId(world, effect.type);
      const near = entityOf(world, resolve(world, ctx, effect.near));
      const spawned = createEntity(registry, {
        id,
        type: effect.type,
        x: near.x,
        state: effect.state,
      });
      return withEntity(world, spawned);
    }
    case 'remove': {
      const id = resolve(world, ctx, effect.of);
      const entities = Object.entries(world.entities).filter(
        ([key]) => key !== id,
      );
      return { ...world, entities: Object.fromEntries(entities) };
    }
    case 'carry': {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { carriedBy, heldByPlayer, ...entity } = entityOf(
        world,
        resolve(world, ctx, effect.of),
      );
      const holder = actorId(ctx);
      return withEntity(
        world,
        holder === null
          ? { ...entity, heldByPlayer: true }
          : { ...entity, carriedBy: holder },
      );
    }
    case 'custom': {
      const fn = registry.customEffects.get(effect.fn);
      if (fn === undefined) {
        throw new Error(`Unregistered custom effect "${effect.fn}"`);
      }
      return fn(world, ctx);
    }
    default:
      return actorEffect(world, registry, ctx, effect, events);
  }
}

function applyEffects(
  world: World,
  registry: Registry,
  ctx: EffectContext,
  effects: readonly Effect[],
  events: GameEvent[],
): World {
  return effects.reduce(
    (next, effect) => applyEffect(next, registry, ctx, effect, events),
    world,
  );
}

function actorKind(world: World, registry: Registry, ctx: EffectContext) {
  if (ctx.actor.kind === 'player') return 'player';
  const actor = world.entities[ctx.actor.id];
  const type = actor && registry.types.get(actor.type);
  return type && ACTOR_KINDS[type.category];
}

/** Finds the affordance an interaction would use, or why it cannot happen now. */
export function checkInteraction(
  world: World,
  registry: Registry,
  interaction: Interaction,
): Refusal | { readonly ok: true; readonly affordance: AffordanceDef } {
  const refuse = (reason: string): Refusal => ({ ok: false, reason });
  const { verb, target } = interaction;
  const entity = world.entities[target];
  if (entity === undefined) return refuse(`no entity "${target}"`);
  const affordance = registry.types
    .get(entity.type)
    ?.affordances.find((a) => a.verb === verb);
  if (affordance === undefined) {
    return refuse(`${entity.type} does not afford ${verb}`);
  }
  const kind = actorKind(world, registry, interaction);
  if (kind === undefined || !affordance.actors.includes(kind)) {
    return refuse(`${kind ?? 'that actor'} cannot ${verb} ${entity.type}`);
  }
  if ((entity.cooldowns?.[verb] ?? -Infinity) > world.clock.simTime) {
    return refuse(`${entity.type} is cooling down from ${verb}`);
  }
  if (
    affordance.available !== undefined &&
    !test(world, interaction, affordance.available)
  ) {
    return refuse(`${entity.type} cannot be used for ${verb} now`);
  }
  return { ok: true, affordance };
}

/**
 * Resolves an interaction's outcomes: evaluates every chance against the
 * world as it stands, rolls the uncertain ones on the `behaviour` stream in
 * order, then applies each outcome's effects in order. Pure, so calling it
 * and discarding the result is a dry run.
 */
export function interact(
  world: World,
  registry: Registry,
  interaction: Interaction,
): InteractionResult {
  const check = checkInteraction(world, registry, interaction);
  if (!check.ok) return check;
  const { affordance } = check;
  let behaviour = world.rng.behaviour;
  const rolls = affordance.outcomes.map((outcome) => {
    const chance = clamp(
      outcome.chance === undefined
        ? 1
        : evaluate(world, interaction, outcome.chance),
    );
    if (Number.isNaN(chance))
      throw new Error(`${interaction.verb} chance is NaN`);
    if (chance >= 1 || chance <= 0) return { chance, fired: chance >= 1 };
    const draw = nextFloat(behaviour);
    behaviour = draw.state;
    return { chance, fired: draw.value < chance };
  });
  const events: GameEvent[] = [];
  let next: World = { ...world, rng: { ...world.rng, behaviour } };
  const outcomes = affordance.outcomes.map((outcome, i) => {
    const roll = rolls[i]!;
    const applied = roll.fired ? outcome : outcome.otherwise;
    if (applied === undefined) return { ...roll, valence: 0 };
    next = applyEffects(next, registry, interaction, applied.effects, events);
    return { ...roll, valence: applied.valence };
  });
  const target = next.entities[interaction.target];
  if (affordance.cooldownMs !== undefined && target !== undefined) {
    next = withEntity(next, {
      ...target,
      cooldowns: {
        ...target.cooldowns,
        [interaction.verb]: next.clock.simTime + affordance.cooldownMs,
      },
    });
  }
  return {
    ok: true,
    world: next,
    events,
    outcomes,
    valence: outcomes.reduce((total, o) => total + o.valence, 0),
  };
}

function scaled(effect: ContinuousEffect, seconds: number): ContinuousEffect {
  return effect.kind === 'incState'
    ? { ...effect, by: effect.by * seconds }
    : { ...effect, delta: effect.delta * seconds };
}

/** Applies an affordance's `continuous` effects for `dtMs` spent engaged. */
export function engage(
  world: World,
  registry: Registry,
  interaction: Interaction,
  dtMs: number,
): Refusal | { readonly ok: true; readonly world: World } {
  const check = checkInteraction(world, registry, interaction);
  if (!check.ok) return check;
  const effects = (check.affordance.continuous ?? []).map((effect) =>
    scaled(effect, dtMs / 1000),
  );
  return {
    ok: true,
    world: applyEffects(world, registry, interaction, effects, []),
  };
}
