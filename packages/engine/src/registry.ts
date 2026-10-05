import {
  formatIssues,
  type EntityType,
  type MeaningId,
  type TypeId,
  type VerbId,
} from './entity.js';

export interface ContentDefinitions {
  readonly types: readonly EntityType[];
  readonly meanings: readonly MeaningId[];
  readonly verbs: readonly VerbId[];
}

export interface Registry {
  readonly types: ReadonlyMap<TypeId, EntityType>;
  readonly meanings: ReadonlySet<MeaningId>;
  readonly verbs: ReadonlySet<VerbId>;
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

function typeProblems(
  type: EntityType,
  meanings: ReadonlySet<MeaningId>,
  verbs: ReadonlySet<VerbId>,
): string[] {
  const problems: string[] = [];
  if (type.meaning !== undefined && !meanings.has(type.meaning)) {
    problems.push(`type "${type.id}" has unknown meaning "${type.meaning}"`);
  }
  for (const { verb } of type.affordances) {
    if (!verbs.has(verb)) {
      problems.push(`type "${type.id}" affords unknown verb "${verb}"`);
    }
  }
  const defaults = type.state.safeParse({});
  if (!defaults.success) {
    for (const issue of formatIssues(defaults.error)) {
      problems.push(`type "${type.id}" state needs defaults: ${issue}`);
    }
    return problems;
  }
  const field = type.zone?.passableWhen;
  if (field !== undefined) {
    const data = defaults.data;
    const value = isRecord(data) ? data[field] : undefined;
    if (typeof value !== 'boolean') {
      problems.push(
        `type "${type.id}" zone is passable when "${field}", which is not a boolean state field`,
      );
    }
  }
  return problems;
}

/** Validates content definitions, throwing one error that lists every problem. */
export function createRegistry(defs: ContentDefinitions): Registry {
  const problems: string[] = [];
  const meanings = uniqueSet(defs.meanings, 'meaning', problems);
  const verbs = uniqueSet(defs.verbs, 'verb', problems);
  uniqueSet(
    defs.types.map((type) => type.id),
    'type id',
    problems,
  );
  for (const type of defs.types) {
    problems.push(...typeProblems(type, meanings, verbs));
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
  };
}
