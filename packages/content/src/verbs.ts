import type { VerbId } from '@kith/engine';

export const VERBS = [
  'eat',
  'poke',
  'chase',
  'play',
  'kick',
  'hug',
  'use',
  'rest-in',
  'climb',
  'fetch',
  'spin',
  'shake',
  'nest',
  'social',
] as const satisfies readonly VerbId[];
