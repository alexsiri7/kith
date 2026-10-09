import { z } from 'zod';
import type { AffordanceDef } from './affordance.js';
import type { Registry } from './registry.js';
import type { EntityId } from './world.js';

export type TypeId = string;
export type MeaningId = string;
export type VerbId = string;
export type NeedId = string;
export type SpriteRef = string;

export type Category =
  | 'food'
  | 'toy'
  | 'structure'
  | 'gadget'
  | 'plant'
  | 'critter'
  | 'hazard'
  | 'terrain'
  | 'sky'
  | 'kith'
  | 'robot';

export interface Body {
  readonly w: number;
  readonly h: number;
  readonly carryable?: boolean;
  readonly draggable?: boolean;
  readonly placeable?: boolean;
  readonly floats?: boolean;
  readonly sinks?: boolean;
}

export interface Perception {
  readonly salience: number;
  readonly moving?: boolean;
  readonly hiddenAtNight?: boolean;
  readonly sky?: boolean;
}

/**
 * A zone spans the declaring entity's body footprint, `[x - w/2, x + w/2]`.
 * `passableWhen` names a boolean state field that makes it safe to cross,
 * such as the river's `bridge`.
 */
export interface ZoneDef {
  readonly kind: 'hazard';
  readonly passableWhen?: string;
}

export interface EntityType<S = unknown> {
  readonly id: TypeId;
  readonly category: Category;
  readonly meaning?: MeaningId;
  /** Every field must have a default, so `state.parse({})` succeeds. */
  readonly state: z.ZodType<S>;
  readonly body: Body;
  readonly perception: Perception;
  readonly affordances: readonly AffordanceDef[];
  readonly zone?: ZoneDef;
  readonly sprite: SpriteRef;
}

export interface Entity<S = unknown> {
  readonly id: EntityId;
  readonly type: TypeId;
  readonly x: number;
  readonly y?: number;
  readonly state: S;
  readonly carriedBy?: EntityId;
  readonly heldByPlayer?: boolean;
  /** Sim time until which each verb is refused on this entity. */
  readonly cooldowns?: Readonly<Record<VerbId, number>>;
}

/** Key order here is the entity's canonical JSON order. */
export const entitySchema: z.ZodType<Entity> = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number().exactOptional(),
  state: z.unknown(),
  carriedBy: z.string().exactOptional(),
  heldByPlayer: z.boolean().exactOptional(),
  cooldowns: z.record(z.string(), z.number()).exactOptional(),
});

export interface EntityInit extends Omit<Entity, 'state'> {
  readonly state?: unknown;
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
  );
}

/**
 * Checks `entity` against its type and returns the problems found, plus the
 * state with defaults filled in when it is valid.
 */
export function checkEntity(
  registry: Registry,
  key: EntityId,
  entity: Entity,
): { readonly problems: string[]; readonly state?: unknown } {
  const problems: string[] = [];
  if (key !== entity.id) {
    problems.push(`entity stored under "${key}" has id "${entity.id}"`);
  }
  const type = registry.types.get(entity.type);
  if (type === undefined) {
    problems.push(`Unknown entity type "${entity.type}" for entity ${key}`);
    return { problems };
  }
  const parsed = type.state.safeParse(entity.state);
  if (!parsed.success) {
    problems.push(
      `Invalid state for ${entity.type} ${key}:\n${formatIssues(parsed.error)
        .map((p) => `  - ${p}`)
        .join('\n')}`,
    );
    return { problems };
  }
  return { problems, state: parsed.data };
}

export function createEntity(registry: Registry, init: EntityInit): Entity {
  const parsed = entitySchema.safeParse({ ...init, state: init.state ?? {} });
  if (!parsed.success) {
    throw new Error(
      `Invalid entity ${init.id}:\n${formatIssues(parsed.error)
        .map((p) => `  - ${p}`)
        .join('\n')}`,
    );
  }
  const { problems, state } = checkEntity(registry, init.id, parsed.data);
  if (problems.length > 0) throw new Error(problems.join('\n'));
  return { ...parsed.data, state };
}
