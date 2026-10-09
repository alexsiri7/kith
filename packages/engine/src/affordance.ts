import type { MeaningId, NeedId, TypeId, VerbId } from './entity.js';
import type { GameEvent } from './event.js';
import type { Target } from './target.js';
import type { EntityId, World } from './world.js';

export type ActorKind = 'kith' | 'player' | 'robot' | 'critter';

/** Who performs an interaction: the player, or a Kith, robot or critter. */
export type Actor = Extract<Target, { kind: 'player' | 'entity' }>;

/** How close the mover must bring the actor; `follow` chases moving targets. */
export type Approach = 'touch' | 'near' | 'inside' | 'follow';

/**
 * Whose state an expression reads or an effect changes. `linked` follows an
 * entity id held in the target's state field, such as a lever's river.
 */
export type Subject = 'actor' | 'target' | { readonly linked: string };

/** A number computed from the world. `'now'` is the current sim time. */
export type Expr =
  | number
  | 'now'
  | { readonly state: string; readonly of?: Subject }
  | { readonly sum: readonly Expr[] }
  | { readonly product: readonly Expr[] }
  | { readonly if: Predicate; readonly then: Expr; readonly else: Expr };

export type Predicate =
  | { readonly is: string; readonly of?: Subject }
  | { readonly gt: readonly [Expr, Expr] }
  | { readonly lt: readonly [Expr, Expr] }
  | { readonly not: Predicate }
  | { readonly all: readonly Predicate[] }
  | { readonly any: readonly Predicate[] };

/** Events an effect can emit: they name the actor and the target. */
export type InteractionEventType = Extract<
  GameEvent,
  { readonly target: EntityId }
>['type'];

/**
 * Effects that act on or name the actor (`need`, `health`, `flee`, `teach`,
 * `emit`, `moment`, `swarm`, `sick`, `bias`) do nothing when the actor is the
 * player, who has no entity. Times are in sim milliseconds.
 *
 * They write the actor's state fields `needs`, `health`, `fleeing`,
 * `lexicon`, `sickUntil` and `biases`, and the target's `swarm`, so a type
 * must declare a field before an effect can touch it.
 */
export type Effect =
  | { readonly kind: 'need'; readonly need: NeedId; readonly delta: number }
  | { readonly kind: 'health'; readonly delta: number }
  | {
      readonly kind: 'setState';
      readonly field: string;
      readonly value: boolean | Expr | { readonly test: Predicate };
      readonly of?: Subject;
    }
  | {
      readonly kind: 'incState';
      readonly field: string;
      readonly by: number;
      readonly of?: Subject;
      readonly range?: readonly [number, number];
    }
  | {
      readonly kind: 'spawn';
      readonly type: TypeId;
      readonly near?: Subject;
      readonly state?: Readonly<Record<string, unknown>>;
    }
  | { readonly kind: 'remove'; readonly of?: Subject }
  | { readonly kind: 'carry'; readonly of?: Subject }
  | { readonly kind: 'flee'; readonly from?: Subject; readonly ms: number }
  | {
      readonly kind: 'teach';
      readonly word: string;
      readonly meaning: MeaningId;
      readonly strength: number;
    }
  | { readonly kind: 'emit'; readonly event: InteractionEventType }
  | { readonly kind: 'moment'; readonly text: string; readonly coins?: number }
  | { readonly kind: 'swarm'; readonly ms: number }
  | { readonly kind: 'sick'; readonly ms: number }
  | {
      readonly kind: 'bias';
      readonly verb: VerbId;
      readonly ms: number;
      readonly strength: number;
    }
  /** For the rare case the vocabulary cannot say; justify each in review. */
  | { readonly kind: 'custom'; readonly fn: string };

export type EffectList = readonly Effect[];

export interface OutcomeResult {
  readonly effects: EffectList;
  /** How the actor felt about it; feeds opinions. */
  readonly valence: number;
}

export interface OutcomeDef extends OutcomeResult {
  /** Probability in [0, 1], evaluated before any outcome applies. Defaults to 1. */
  readonly chance?: Expr;
  /** Applies instead when the chance roll fails. */
  readonly otherwise?: OutcomeResult;
}

export interface AffordanceDef {
  readonly verb: VerbId;
  readonly actors: readonly ActorKind[];
  readonly available?: Predicate;
  readonly approach: Approach;
  /** Sim time the actor spends engaged once there, in ms. */
  readonly duration?: readonly [number, number];
  /**
   * Applied while engaged. The amounts of `need`, `health` and `incState`
   * are per second; other effects apply whole each time.
   */
  readonly continuous?: EffectList;
  readonly outcomes: readonly OutcomeDef[];
  /** How long the target refuses this verb from anyone after it resolves. */
  readonly cooldownMs?: number;
}

export interface EffectContext {
  readonly actor: Actor;
  readonly target: EntityId;
}

/** Must be pure and deterministic, drawing randomness only from `world.rng`. */
export type CustomEffect = (world: World, ctx: EffectContext) => World;

export interface KnownContent {
  readonly types: ReadonlySet<TypeId>;
  readonly needs: ReadonlySet<NeedId>;
  readonly meanings: ReadonlySet<MeaningId>;
  readonly verbs: ReadonlySet<VerbId>;
  readonly customEffects: ReadonlySet<string>;
}

type FieldKind = 'number' | 'boolean' | 'string' | 'present';

interface FieldRef {
  readonly field: string;
  readonly of: Subject | undefined;
  readonly kind: FieldKind;
}

function subjectRefs(of: Subject | undefined): FieldRef[] {
  return typeof of === 'object'
    ? [{ field: of.linked, of: 'target', kind: 'string' }]
    : [];
}

function exprRefs(expr: Expr): FieldRef[] {
  if (typeof expr !== 'object') return [];
  if ('state' in expr) {
    return [
      { field: expr.state, of: expr.of, kind: 'number' },
      ...subjectRefs(expr.of),
    ];
  }
  if ('sum' in expr) return expr.sum.flatMap(exprRefs);
  if ('product' in expr) return expr.product.flatMap(exprRefs);
  return [
    ...predicateRefs(expr.if),
    ...exprRefs(expr.then),
    ...exprRefs(expr.else),
  ];
}

function predicateRefs(predicate: Predicate): FieldRef[] {
  if ('is' in predicate) {
    return [
      { field: predicate.is, of: predicate.of, kind: 'boolean' },
      ...subjectRefs(predicate.of),
    ];
  }
  if ('gt' in predicate) return predicate.gt.flatMap(exprRefs);
  if ('lt' in predicate) return predicate.lt.flatMap(exprRefs);
  if ('not' in predicate) return predicateRefs(predicate.not);
  if ('all' in predicate) return predicate.all.flatMap(predicateRefs);
  return predicate.any.flatMap(predicateRefs);
}

function effectRefs(effect: Effect): FieldRef[] {
  switch (effect.kind) {
    case 'setState': {
      const { value } = effect;
      const target = { field: effect.field, of: effect.of };
      const refs = subjectRefs(effect.of);
      if (typeof value === 'boolean') {
        return [{ ...target, kind: 'boolean' }, ...refs];
      }
      if (typeof value === 'object' && 'test' in value) {
        return [
          { ...target, kind: 'boolean' },
          ...refs,
          ...predicateRefs(value.test),
        ];
      }
      return [{ ...target, kind: 'number' }, ...refs, ...exprRefs(value)];
    }
    case 'incState':
      return [
        { field: effect.field, of: effect.of, kind: 'number' },
        ...subjectRefs(effect.of),
      ];
    case 'spawn':
      return subjectRefs(effect.near);
    case 'remove':
    case 'carry':
      return subjectRefs(effect.of);
    case 'flee':
      return subjectRefs(effect.from);
    case 'swarm':
      return [{ field: 'swarm', of: 'target', kind: 'present' }];
    default:
      return [];
  }
}

/** Subjects an effect resolves even when the player, who has no entity, acts. */
function subjects(effect: Effect): readonly (Subject | undefined)[] {
  switch (effect.kind) {
    case 'setState':
    case 'incState':
    case 'remove':
    case 'carry':
      return [effect.of];
    case 'spawn':
      return [effect.near];
    default:
      return [];
  }
}

function fieldProblem(
  ref: FieldRef,
  defaults: Readonly<Record<string, unknown>>,
): string | undefined {
  if (ref.of !== undefined && ref.of !== 'target') return undefined;
  if (!(ref.field in defaults))
    return `reads unknown state field "${ref.field}"`;
  const actual = typeof defaults[ref.field];
  if (ref.kind !== 'present' && actual !== ref.kind) {
    return `uses state field "${ref.field}" as a ${ref.kind}, but it is a ${actual}`;
  }
  return undefined;
}

function effectProblems(effect: Effect, known: KnownContent): string[] {
  const problems: string[] = [];
  if ('ms' in effect && !(effect.ms >= 0)) {
    problems.push(`${effect.kind} lasts a negative or invalid ${effect.ms} ms`);
  }
  switch (effect.kind) {
    case 'need':
      if (!known.needs.has(effect.need)) {
        problems.push(`changes unknown need "${effect.need}"`);
      }
      break;
    case 'spawn':
      if (!known.types.has(effect.type)) {
        problems.push(`spawns unknown type "${effect.type}"`);
      }
      break;
    case 'teach':
      if (!known.meanings.has(effect.meaning)) {
        problems.push(`teaches unknown meaning "${effect.meaning}"`);
      }
      break;
    case 'bias':
      if (!known.verbs.has(effect.verb)) {
        problems.push(`biases unknown verb "${effect.verb}"`);
      }
      break;
    case 'custom':
      if (!known.customEffects.has(effect.fn)) {
        problems.push(`calls unregistered custom effect "${effect.fn}"`);
      }
      break;
    default:
      break;
  }
  return problems;
}

/**
 * Checks one type's affordances against the known content and the type's
 * default state, returning problems phrased to follow `type "<id>" `.
 */
export function affordanceProblems(
  affordances: readonly AffordanceDef[],
  defaults: Readonly<Record<string, unknown>>,
  known: KnownContent,
): string[] {
  const problems: string[] = [];
  const seen = new Set<VerbId>();
  for (const affordance of affordances) {
    const { verb } = affordance;
    const say = (problem: string) => problems.push(`${verb} ${problem}`);
    if (!known.verbs.has(verb)) problems.push(`affords unknown verb "${verb}"`);
    if (seen.has(verb)) problems.push(`affords "${verb}" twice`);
    seen.add(verb);
    if (affordance.actors.length === 0) say('has no actors');
    const [min, max] = affordance.duration ?? [0, 0];
    if (!(min >= 0 && max >= min)) say(`has invalid duration [${min}, ${max}]`);
    if (!((affordance.cooldownMs ?? 0) >= 0)) say('has a negative cooldown');
    const results = affordance.outcomes.flatMap((outcome) => [
      outcome,
      ...(outcome.otherwise === undefined ? [] : [outcome.otherwise]),
    ]);
    const effects = [
      ...(affordance.continuous ?? []),
      ...results.flatMap((result) => result.effects),
    ];
    const refs = [
      ...(affordance.available === undefined
        ? []
        : predicateRefs(affordance.available)),
      ...affordance.outcomes.flatMap((outcome) =>
        outcome.chance === undefined ? [] : exprRefs(outcome.chance),
      ),
      ...effects.flatMap(effectRefs),
    ];
    if (
      affordance.actors.includes('player') &&
      (refs.some((ref) => ref.of === 'actor') ||
        effects.some((effect) => subjects(effect).includes('actor')))
    ) {
      say('lets the player act but names the actor, who has no entity then');
    }
    for (const outcome of affordance.outcomes) {
      const { chance } = outcome;
      if (typeof chance === 'number' && !(chance >= 0 && chance <= 1)) {
        say(`has chance ${chance} outside [0, 1]`);
      }
    }
    for (const effect of effects) {
      for (const problem of effectProblems(effect, known)) say(problem);
    }
    for (const ref of refs) {
      const problem = fieldProblem(ref, defaults);
      if (problem !== undefined) say(problem);
    }
  }
  return problems;
}
