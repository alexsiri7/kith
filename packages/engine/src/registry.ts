import {
  affordanceProblems,
  type CustomEffect,
  type KnownContent,
} from './affordance.js';
import {
  formatIssues,
  type EntityType,
  type MeaningId,
  type NeedId,
  type TypeId,
  type VerbId,
} from './entity.js';

export interface ContentDefinitions {
  readonly types: readonly EntityType[];
  readonly needs: readonly NeedId[];
  readonly meanings: readonly MeaningId[];
  readonly verbs: readonly VerbId[];
  readonly customEffects?: Readonly<Record<string, CustomEffect>>;
}

export interface Registry {
  readonly types: ReadonlyMap<TypeId, EntityType>;
  readonly meanings: ReadonlySet<MeaningId>;
  readonly verbs: ReadonlySet<VerbId>;
  readonly customEffects: ReadonlyMap<string, CustomEffect>;
}

function uniqueSet<T>(
  values: readonly T[],
  what: string,
  problems: string[],
): Set<T> {
  const set = new Set<T>();
  for (const value of values) {
    if (set.has(value)) problems.push(`duplicate ${what} "${String(value)}"`);
    set.add(value);
  }
  return set;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function typeProblems(type: EntityType, known: KnownContent): string[] {
  const problems: string[] = [];
  if (type.meaning !== undefined && !known.meanings.has(type.meaning)) {
    problems.push(`type "${type.id}" has unknown meaning "${type.meaning}"`);
  }
  const defaults = type.state.safeParse({});
  if (!defaults.success) {
    for (const issue of formatIssues(defaults.error)) {
      problems.push(`type "${type.id}" state needs defaults: ${issue}`);
    }
    return problems;
  }
  const state = isRecord(defaults.data) ? defaults.data : {};
  for (const problem of affordanceProblems(type.affordances, state, known)) {
    problems.push(`type "${type.id}" ${problem}`);
  }
  const field = type.zone?.passableWhen;
  if (field !== undefined && typeof state[field] !== 'boolean') {
    problems.push(
      `type "${type.id}" zone is passable when "${field}", which is not a boolean state field`,
    );
  }
  return problems;
}

/** Validates content definitions, throwing one error that lists every problem. */
export function createRegistry(defs: ContentDefinitions): Registry {
  const problems: string[] = [];
  const needs = uniqueSet(defs.needs, 'need', problems);
  const meanings = uniqueSet(defs.meanings, 'meaning', problems);
  const verbs = uniqueSet(defs.verbs, 'verb', problems);
  const types = uniqueSet(
    defs.types.map((type) => type.id),
    'type id',
    problems,
  );
  const customEffects = new Map(Object.entries(defs.customEffects ?? {}));
  const known: KnownContent = {
    types,
    needs,
    meanings,
    verbs,
    customEffects: new Set(customEffects.keys()),
  };
  for (const type of defs.types) {
    problems.push(...typeProblems(type, known));
  }
  if (problems.length > 0) {
    throw new Error(
      `Invalid content:\n${problems.map((p) => `- ${p}`).join('\n')}`,
    );
  }
  return {
    types: new Map(defs.types.map((type) => [type.id, type])),
    meanings,
    verbs,
    customEffects,
  };
}
