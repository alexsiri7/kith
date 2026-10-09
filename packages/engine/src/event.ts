import type { EntityId } from './world.js';

/** Every event names the entity it happened to or was done by. */
export type GameEvent =
  | {
      readonly type: 'hatch';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'ate';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'stung';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'gotHoney';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'pricked';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'sick';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'fellIn';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'avoided';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'warned';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | {
      readonly type: 'learnedSkill';
      readonly actor: EntityId;
      readonly skill: string;
    }
  | {
      readonly type: 'learnedWord';
      readonly actor: EntityId;
      readonly word: string;
    }
  | {
      readonly type: 'eggLaid';
      readonly actor: EntityId;
      readonly target: EntityId;
    }
  | { readonly type: 'died'; readonly actor: EntityId; readonly cause: string }
  | {
      readonly type: 'tockBought';
      readonly actor: EntityId;
      readonly sku: string;
    };
