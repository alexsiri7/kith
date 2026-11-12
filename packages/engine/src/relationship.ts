import { z } from 'zod';

const level = z.number().min(0).max(1);

/** What one entity feels for another, each in [0, 1]. */
export const bondSchema = z.object({
  familiarity: level,
  affection: level,
  trust: level,
});
export type Bond = z.infer<typeof bondSchema>;
export const BOND_KEYS = bondSchema.keyof().options;

/**
 * The state fields social life reads and writes. A type with `social` spreads
 * this shape into its state alongside the mind's and language's.
 */
export const socialShape = {
  /** With the player. */
  player: bondSchema.default({ familiarity: 0, affection: 0.1, trust: 0.2 }),
  /** By entity id: Kith, Tock. One it has never met has none yet. */
  bonds: z.record(z.string(), bondSchema).default({}),
  /** What it believes about things, strongest first. */
  beliefs: z
    .array(
      z.object({
        about: z.string(),
        feel: z.number().min(-1).max(1),
        text: z.string(),
        strength: level,
      }),
    )
    .default([]),
  /** When an egg hatches, and when it did. */
  hatchAt: z.number().nullable().default(null),
  born: z.number().nullable().default(null),
  generation: z.int().min(1).default(1),
  lastEgg: z.number().nullable().default(null),
  lastWarned: z.number().nullable().default(null),
  hasWarned: z.boolean().default(false),
};

export const socialState = z.object(socialShape);
export type Social = z.infer<typeof socialState>;
export type Belief = Social['beliefs'][number];
