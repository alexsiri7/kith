import { z } from 'zod';
import {
  CATEGORIES,
  formatIssues,
  type NeedId,
  type VerbId,
} from './entity.js';

/**
 * What a mind can do without a target entity. `approach` goes to the
 * player's hand; the others stay with the mind itself.
 */
export const ACTIVITIES = ['idle', 'wander', 'sleep', 'approach'] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** `self` keys what a mind does alone, `player` what it does at the hand. */
export const VALUE_CATEGORIES = [...CATEGORIES, 'self', 'player'] as const;
export type ValueCategory = (typeof VALUE_CATEGORIES)[number];

export type Levels = Readonly<Record<NeedId, number>>;

/** `[need][verb][category]`: how much doing it is worth to that need. */
export type ValueTable = Readonly<
  Record<
    NeedId,
    Readonly<Record<VerbId, Readonly<Partial<Record<ValueCategory, number>>>>>
  >
>;

/** Rates are per game hour. */
export interface NeedDrift {
  readonly awake: number;
  readonly asleep: number;
  /** Replace `awake` and `asleep` while the player watches. */
  readonly watched?: {
    readonly far: number;
    readonly nearHand: number;
    /** How close the hand must be, in px, to count as near. */
    readonly within: number;
  };
  /** Scales `awake` and `asleep` by `base + per × genome[trait]`. */
  readonly genome?: {
    readonly trait: Trait;
    readonly base: number;
    readonly per: number;
  };
  /** Scales `awake` and `asleep` by stage; stages left out keep 1. */
  readonly stage?: Readonly<Record<string, number>>;
  /** The fraction of the way to 0 the need eases each hour. */
  readonly ease?: number;
}

export interface MindDef {
  readonly needs: Readonly<Record<NeedId, NeedDrift>>;
  readonly health: {
    /** Lost per hour while a need is above a level; the worst names a death. */
    readonly harm: readonly {
      readonly need: NeedId;
      readonly above: number;
      readonly perHour: number;
    }[];
    /** Regained per hour while every listed need is below its level. */
    readonly heal: { readonly perHour: number; readonly below: Levels };
  };
  readonly movement: {
    /** Px per game second, by stage. */
    readonly speed: Readonly<Record<string, number>>;
    readonly defaultSpeed: number;
    /** Slows the mind while a need is above a level. */
    readonly slow: readonly {
      readonly need: NeedId;
      readonly above: number;
      readonly factor: number;
    }[];
    readonly sickFactor: number;
    /** Distance, in px, at which the mind has reached what it was going to. */
    readonly arriveWithin: number;
    readonly bounds: readonly [number, number];
    /** How far, in px, it flees from what frightened it. */
    readonly fleeDistance: number;
    /** Px from a hazard zone's edge where it stops, and where it climbs out. */
    readonly bank: { readonly stop: number; readonly climbOut: number };
  };
  readonly sleep: {
    readonly fallAsleepAbove: Levels;
    /** It wakes when any need is below its `below` or above its `above` level. */
    readonly wake: { readonly below: Levels; readonly above: Levels };
  };
  readonly attention: {
    /** Entities further away, in px, are only known from memory. */
    readonly range: number;
    /** How many targets decision weighs. */
    readonly attend: number;
    /** Weight of the genome's curiosity on a type the mind has no opinion of. */
    readonly curiosity: number;
    /** Score lost per px of distance. */
    readonly distance: number;
    /** Types the mind thinks less of than this are not considered. */
    readonly avoidBelow: number;
  };
  readonly decision: {
    /** Noise amplitude by stage, scaled by `1 + curiosity`. */
    readonly noise: Readonly<Record<string, number>>;
    readonly defaultNoise: number;
    /** How long it goes after a target before giving up. */
    readonly pursueMs: number;
  };
  readonly activities: {
    readonly idle: {
      readonly base: number;
      readonly ms: readonly [number, number];
    };
    readonly wander: {
      readonly base: number;
      readonly curiosity: number;
      readonly range: number;
      readonly ms: readonly [number, number];
    };
    /** Sleep is an option once any listed need is above its level. */
    readonly sleep: { readonly whenAbove: Levels };
    /** Needs relieved per hour while at the player's hand. */
    readonly approach: { readonly ms: number; readonly relief: Levels };
  };
  /** Values the mind starts with before it learns any. */
  readonly instincts: ValueTable;
  readonly learning: {
    /** Scaled by the genome's learn rate. */
    readonly rate: number;
    /** Needs below this when the act began teach nothing. */
    readonly minNeed: number;
    /** Relief is scaled by `gain`, then clamped to `range`. */
    readonly gain: number;
    readonly range: readonly [number, number];
    readonly values: readonly [number, number];
    /** A value crossing `learned` upwards is a skill; below `unlearned` it is lost. */
    readonly skill: { readonly learned: number; readonly unlearned: number };
  };
  /** It fears a hazard zone once its opinion is at or below `-(base + curiosity × genome)`. */
  readonly zoneFear: { readonly base: number; readonly curiosity: number };
  readonly feedback: {
    /** How long after an act ends feedback still reaches it. */
    readonly windowMs: number;
    readonly rate: number;
    readonly tickle: {
      readonly reward: number;
      readonly needs: Levels;
      /** Comforts instead when any need is above its `when` level. */
      readonly comfort: { readonly when: Levels; readonly needs: Levels };
    };
    readonly scold: {
      readonly reward: number;
      readonly needs: Levels;
      /** Change to the opinion of the type the act was aimed at. */
      readonly opinion: number;
      /** Scolded this close to a hazard zone, it thinks worse of the zone. */
      readonly zone: { readonly within: number; readonly opinion: number };
    };
  };
  readonly biases: {
    readonly wish: { readonly ms: number; readonly strength: number };
    readonly cortex: { readonly ms: number; readonly strength: number };
  };
}

const genome = z.object({
  curiosity: z.number().min(0).max(1),
  hardiness: z.number().min(0).max(1),
  sociability: z.number().min(0).max(1),
  learnRate: z.number().min(0),
  agreeable: z.number().min(0).max(1).default(0.5),
});

const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entity'), id: z.string() }),
  z.object({ kind: z.literal('player') }),
]);

const levels = z.record(z.string(), z.number().min(0).max(1));
const valueCategory = z.enum(VALUE_CATEGORIES);

const act = z.object({
  verb: z.string(),
  target: targetSchema.nullable(),
  type: z.string().nullable(),
  category: valueCategory,
  /** The need that was strongest when the act was chosen. */
  need: z.string(),
  before: levels,
  until: z.number(),
  tx: z.number(),
  engagedUntil: z.number().nullable(),
  done: z.boolean(),
});

const bias = z.object({
  verb: z.string(),
  target: z.string().exactOptional(),
  until: z.number(),
  strength: z.number(),
  /** Wishes are spent by doing them. */
  wish: z.literal(true).exactOptional(),
});

/**
 * The state fields a mind reads and writes. A type with a `mind` spreads this
 * shape into its state, and may narrow fields such as `stage` or `needs`.
 */
export const mindShape = {
  stage: z.string().default('adult'),
  alive: z.boolean().default(true),
  health: z.number().min(0).max(1).default(1),
  needs: levels.default({}),
  genome: genome.default({
    curiosity: 0.5,
    hardiness: 0.5,
    sociability: 0.5,
    learnRate: 1,
    agreeable: 0.5,
  }),
  asleep: z.boolean().default(false),
  sickUntil: z.number().default(0),
  fleeing: z
    .object({ from: z.string(), until: z.number() })
    .nullable()
    .default(null),
  /** Held by a hazard zone after falling in, until it climbs out. */
  inZone: z
    .object({
      zone: z.string(),
      from: z.union([z.literal(-1), z.literal(1)]),
      until: z.number(),
    })
    .nullable()
    .default(null),
  values: z
    .record(
      z.string(),
      z.record(z.string(), z.partialRecord(valueCategory, z.number())),
    )
    .default({}),
  /** By type: what it has come to think of that kind of thing, in [-1, 1]. */
  opinions: z.record(z.string(), z.number().min(-1).max(1)).default({}),
  skills: z.array(z.string()).default([]),
  biases: z.array(bias).default([]),
  /** Where it last saw entities it can no longer perceive. */
  memory: z.record(z.string(), z.number()).default({}),
  act: act.nullable().default(null),
  last: z
    .object({
      verb: z.string(),
      type: z.string().nullable(),
      category: valueCategory,
      need: z.string(),
      end: z.number(),
    })
    .nullable()
    .default(null),
  /** The best options of its last decision, best first, for the Brain view. */
  lastScores: z
    .array(
      z.object({
        verb: z.string(),
        target: z.string().nullable(),
        score: z.number(),
      }),
    )
    .default([]),
};

export const mindState = z.object(mindShape);
export type Mind = z.infer<typeof mindState>;
export type Act = NonNullable<Mind['act']>;
export type Bias = Mind['biases'][number];
export type Genome = Mind['genome'];
export type Trait = keyof Genome;

export interface MindContent {
  readonly needs: ReadonlySet<NeedId>;
  readonly verbs: ReadonlySet<VerbId>;
}

/** Checks a mind against the known content, phrased to follow `type "<id>" `. */
export function mindProblems(
  def: MindDef,
  defaults: unknown,
  known: MindContent,
): string[] {
  const problems: string[] = [];
  const state = mindState.safeParse(defaults);
  if (!state.success) {
    for (const issue of formatIssues(state.error)) {
      problems.push(`mind needs state field ${issue}`);
    }
  }
  const needs = [
    ...Object.keys(def.needs),
    ...def.health.harm.map((harm) => harm.need),
    ...def.movement.slow.map((slow) => slow.need),
    ...[
      def.health.heal.below,
      def.sleep.fallAsleepAbove,
      def.sleep.wake.below,
      def.sleep.wake.above,
      def.activities.sleep.whenAbove,
      def.activities.approach.relief,
      def.feedback.tickle.needs,
      def.feedback.tickle.comfort.when,
      def.feedback.tickle.comfort.needs,
      def.feedback.scold.needs,
    ].flatMap(Object.keys),
    ...Object.keys(def.instincts),
  ];
  for (const need of new Set(needs)) {
    if (!known.needs.has(need))
      problems.push(`mind uses unknown need "${need}"`);
  }
  if (state.success) {
    for (const need of Object.keys(def.needs)) {
      if (!(need in state.data.needs)) {
        problems.push(`mind drifts need "${need}", which its state lacks`);
      }
    }
  }
  const activities: ReadonlySet<string> = new Set(ACTIVITIES);
  const categories: ReadonlySet<string> = new Set(VALUE_CATEGORIES);
  for (const verbs of Object.values(def.instincts)) {
    for (const [verb, values] of Object.entries(verbs)) {
      if (!known.verbs.has(verb) && !activities.has(verb)) {
        problems.push(`mind has an instinct for unknown verb "${verb}"`);
      }
      for (const category of Object.keys(values)) {
        if (!categories.has(category)) {
          problems.push(
            `mind has an instinct for unknown category "${category}"`,
          );
        }
      }
    }
  }
  return problems;
}
