import type { EntityId } from './world.js';

export type Command =
  | { readonly type: 'tickle' }
  | { readonly type: 'scold' }
  | {
      readonly type: 'say';
      readonly text: string;
      readonly pointing?: EntityId;
    }
  | { readonly type: 'point'; readonly target: EntityId }
  | {
      readonly type: 'kick';
      readonly target: EntityId;
      readonly dir: -1 | 1;
      readonly power: number;
    }
  | { readonly type: 'spin' }
  | { readonly type: 'drag'; readonly entity: EntityId; readonly x: number }
  | { readonly type: 'place'; readonly entity: EntityId; readonly x: number }
  | { readonly type: 'buy'; readonly sku: string; readonly x: number }
  | { readonly type: 'use'; readonly entity: EntityId; readonly verb: string }
  | { readonly type: 'select'; readonly kith: EntityId }
  | { readonly type: 'rename'; readonly kith: EntityId; readonly name: string }
  | {
      readonly type: 'cortexIntent';
      readonly kith: EntityId;
      readonly verb: string;
      readonly target: EntityId;
    }
  | {
      readonly type: 'setWants';
      readonly kith: EntityId;
      readonly wants: readonly string[];
    }
  | {
      readonly type: 'applyNight';
      readonly kith: EntityId;
      readonly memory: string;
    }
  | {
      readonly type: 'learnWords';
      readonly kith: EntityId;
      readonly words: readonly string[];
    };
