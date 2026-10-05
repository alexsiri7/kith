import type { EntityType } from '@kith/engine';
import { z } from 'zod';

// Body sizes and salience are placeholders until the brain (#8) and art (#17)
// tune them.

const foodState = z.object({
  born: z.number().default(0),
  rotten: z.boolean().default(false),
});

const toyState = z.object({});

const handheld = { carryable: true, draggable: true } as const;

function item(
  category: 'food' | 'toy',
  id: string,
  meaning: string,
  body: EntityType['body'],
  salience: number,
): EntityType {
  return {
    id,
    category,
    meaning,
    state: category === 'food' ? foodState : toyState,
    body,
    perception: { salience },
    affordances: [],
    sprite: id,
  };
}

export const KITH_STAGES = [
  'egg',
  'baby',
  'child',
  'adult',
  'elder',
  'dead',
] as const;

export const ENTITY_TYPES: readonly EntityType[] = [
  {
    id: 'kith',
    category: 'kith',
    meaning: 'friend',
    state: z.object({
      name: z.string().default(''),
      stage: z.enum(KITH_STAGES).default('egg'),
      alive: z.boolean().default(true),
      health: z.number().default(1),
      hatchAt: z.number().nullable().default(null),
      born: z.number().nullable().default(null),
      dies: z.number().nullable().default(null),
      parents: z.array(z.string()).default([]),
      generation: z.int().default(1),
    }),
    body: { w: 24, h: 28 },
    perception: { salience: 1, moving: true },
    affordances: [],
    sprite: 'kith',
  },
  {
    id: 'tock',
    category: 'robot',
    meaning: 'robot',
    state: z.object({ name: z.string().default('Tock') }),
    body: { w: 26, h: 36 },
    perception: { salience: 0.6, moving: true },
    affordances: [],
    sprite: 'tock',
  },
  item('toy', 'ball', 'ball', { w: 16, h: 16, ...handheld }, 0.7),
  item('toy', 'doll', 'doll', { w: 18, h: 24, ...handheld }, 0.5),
  item('toy', 'top', 'toy', { w: 18, h: 18, ...handheld }, 0.5),
  item('food', 'cake', 'food', { w: 18, h: 14, ...handheld }, 0.6),
  item('food', 'berry', 'food', { w: 10, h: 10, ...handheld }, 0.5),
  item('food', 'honey', 'honey', { w: 14, h: 14, ...handheld }, 0.6),
  item('food', 'mushroom-brown', 'mushroom', { w: 12, h: 12 }, 0.4),
  item('food', 'mushroom-red', 'mushroom', { w: 12, h: 12 }, 0.5),
  {
    id: 'river',
    category: 'terrain',
    meaning: 'water',
    state: z.object({ bridge: z.boolean().default(false) }),
    body: { w: 120, h: 40 },
    perception: { salience: 0.8 },
    affordances: [],
    zone: { kind: 'hazard', passableWhen: 'bridge' },
    sprite: 'river',
  },
];
