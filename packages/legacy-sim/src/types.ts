import type {
  Action,
  Drive,
  FoodType,
  SpotName,
  Subject,
  WantKind,
} from './constants.js';

export type Drives = Record<Drive, number>;

export interface Genome {
  hue: number;
  size: number;
  curiosity: number;
  agreeable: number;
  sociability: number;
  hardiness: number;
  learnRate: number;
  lifespan: number;
  syll: string[];
}

export interface Relationship {
  familiarity: number;
  affection: number;
  trust: number;
}

/** A word a Kith has heard: what it means to it, and how strongly it knows it. */
export interface LexEntry {
  m: string;
  s: number;
  at: number;
}

export type Stage = 'egg' | 'baby' | 'child' | 'adult' | 'elder' | 'dead';

export interface Want {
  what: WantKind;
  where?: SpotName | null;
  why: string;
  at: number;
}

/** A want as Claude (or the rules) proposes it, before validation. */
export interface WantInput {
  what?: unknown;
  where?: unknown;
  why?: unknown;
}

/**
 * What a Kith is doing. `target` is a string reference: `item:<id>`,
 * `patch:<i>`, `bush:<i>`, `obj:<fauna>` or `kin:<id>`.
 */
export interface Act {
  kind: Action;
  dom: Drive;
  before: Drives;
  start: number;
  feedback: number;
  tx: number;
  until: number;
  target?: string | null;
  done?: boolean;
  want?: Want;
  what?: WantKind;
  dollId?: string;
  started?: boolean;
  pressed?: boolean;
  pressed2?: boolean;
  carry?: boolean;
  nextSay?: number;
  logged?: boolean;
}

export interface LastAct {
  kind: Action;
  dom: Drive;
  before: Drives;
  end: number;
}

export interface Bias {
  kind: Action;
  until: number;
  s: number;
}

export interface News {
  kind: 'word' | 'learned' | 'unlearned';
  text: string;
}

export interface Belief {
  about: Subject;
  feel: number;
  text: string;
  s: number;
}

/** Feelings about the garden's objects and creatures, by fauna or mushroom. */
export interface ObjVal {
  hive: number;
  cactus: number;
  squirrel: number;
  butterfly: number;
  red: number;
  brown: number;
  [obj: string]: number;
}

type BoolFlag =
  | 'knowsYou'
  | 'comforted'
  | 'learnedFromKin'
  | 'ballWithYou'
  | 'music'
  | 'fetched'
  | 'sheltered'
  | 'nightIn'
  | 'fearNews'
  | 'avoidedOnce'
  | 'fellIn'
  | 'firstMeal'
  | 'hugged'
  | 'vended'
  | 'honey'
  | 'stung'
  | 'pricked'
  | 'sick'
  | 'warnedOnce'
  | ConditionFlag
  | `chased_${string}`;
export type ConditionFlag = 'starving' | 'freezing' | 'weak';
export type Flags = { [K in BoolFlag]?: boolean } & { justAvoided?: number };

export interface Creature {
  id: string;
  name: string;
  genome: Genome;
  stage: Stage;
  hatchAt: number;
  born: number | null;
  dies: number | null;
  alive: boolean;
  parents: string[];
  gen: number;
  objVal: ObjVal;
  kin: Record<string, Relationship>;
  robotRel: Relationship;
  skill: Record<string, number>;
  news: News[];
  lastScores: [Action, number][];
  x: number;
  dir: number;
  asleep: boolean;
  health: number;
  d: Drives;
  aff: Record<Drive, Record<Action, number>>;
  lex: Record<string, LexEntry>;
  rel: Relationship;
  act: Act | null;
  last: LastAct | null;
  bias: Bias | null;
  say: string | null;
  sayUntil: number;
  nextChatter: number;
  flags: Flags;
  cause: string | null;
  beliefs: Belief[];
  think: string[] | null;
  thinkUntil: number;
  lastConsol: number;
  sleptNight: boolean;
  wants: Want[];
  riverFear: number;
  inWater: { from: number; until: number } | null;
  diedAt?: number;
  look?: { x: number; until: number; meaning: unknown };
  moving?: boolean;
  dancing?: boolean;
  gazing?: boolean;
  hugging?: boolean;
  caughtKick?: boolean;
  sickUntil?: number;
  ledAt?: number;
  lastEgg?: number;
  chaseLog?: number;
  warnAt?: number;
}

export type ItemType = FoodType | 'ball' | 'doll' | 'top';

export interface Item {
  id: string;
  type: ItemType;
  x: number;
  born: number;
  held?: boolean;
  carried?: boolean;
  rotten?: boolean;
  floating?: boolean;
  sunk?: boolean;
  h?: number;
  vh?: number;
  vx?: number;
  spin?: number;
  /** When the player dropped it, for "ate food you brought". */
  byHand?: number;
  bySitter?: boolean;
}

export type RobotTaskKind =
  'lever' | 'lead' | 'vend' | 'buy' | 'feed' | 'guide' | 'escort';

export interface RobotTask {
  kind: RobotTaskKind;
  id?: string;
  src?: 'vend' | 'buy';
  until?: number;
}

export interface Robot {
  name: string;
  x: number;
  tx: number;
  task: RobotTask | null;
  say: string | null;
  sayUntil: number;
  nextName: number;
  nextWarn: number;
  carry?: 'cake' | null;
  brokeAt?: number;
  idleUntil?: number;
  nextHaz?: number;
  moving?: boolean;
}

export interface Butterfly {
  x: number;
  y: number;
  ph: number;
  drift?: number;
}

export interface Fauna {
  hive: { x: number; honey: number; g: number; anger: number };
  squirrel: { x: number; up: boolean; tx: number; upUntil: number };
  butterflies: Butterfly[];
  swarm: { id: string; until: number } | null;
  shroomT: number;
}

export interface Shelter {
  x: number;
  integ: number;
}

export interface Bush {
  x: number;
  n: number;
  g: number;
}

export interface Board {
  i: number;
  until: number;
  taught: boolean;
  byKith: boolean;
}

export interface Gadgets {
  patchX: number[];
  bushes: Bush[];
  fauna: Fauna;
  pos: { board: number; music: number; vendor: number };
  shelters: Shelter[];
  bridge: boolean;
  bush: { n: number; g: number };
  vendor: { stock: number; day: number };
  musicUntil: number;
  board: Board;
}

/** What the garden's log records; `talk` is logged by the app when the player speaks. */
export type LogType =
  | 'ate'
  | 'avoided'
  | 'board'
  | 'bridge-up'
  | 'chased'
  | 'comfort'
  | 'death'
  | 'egg'
  | 'fell-in'
  | 'fetched'
  | 'forgot'
  | 'frost'
  | 'handfed'
  | 'hatch'
  | 'honey'
  | 'music'
  | 'played'
  | 'played-together'
  | 'river-scold'
  | 'robot-warn'
  | 'scold'
  | 'shelter'
  | 'sitter-bridge'
  | 'sitter-fed'
  | 'sitter-guided'
  | 'slept-out'
  | 'storm'
  | 'talk'
  | 'tickle'
  | 'tock-bought'
  | 'tock-broke'
  | 'tock-led'
  | 'vended'
  | 'want'
  | 'warned'
  | 'word'
  | ConditionFlag
  | HurtEvent;

export interface LogEntry {
  t: number;
  type: LogType;
  text: string;
  who: string | null;
}

export interface Moment {
  t: number;
  text: string;
  who: string;
  id: string;
}

export interface Grave {
  name: string;
  cause: string;
  born: number | null;
  died: number;
  hue: number;
}

export interface Dream {
  t: number;
  who: string;
  text: string;
}

/** A Kith's night, waiting to be consolidated into beliefs and wants. */
export interface Night {
  id?: string;
  name: string;
  since: number;
  until: number;
  wx: number;
}

export interface NightResult {
  beliefs?: { about?: unknown; feel?: unknown; text?: unknown }[];
  wants?: WantInput[];
  dream?: unknown;
}

export interface World extends Gadgets {
  v: 1;
  scale: number;
  seed: number;
  /** The world's random stream (see `random`); seeded from `seed`. */
  rng: number;
  nextId: number;
  simTime: number;
  offset: number;
  coins: number;
  allowanceDay: number;
  presenceMs: number;
  presenceDay: number;
  presenceCoins: number;
  playerName: string;
  shelter: number;
  patch: number[];
  sitterUntil: number;
  items: Item[];
  kith: Creature[];
  /** The Kith the sim is currently acting for; swapped while stepping each one. */
  creature: Creature;
  sel: string;
  robot: Robot;
  log: LogEntry[];
  moments: Moment[];
  chat: unknown[];
  lastSeen: number;
  graves: Grave[];
  dreams: Dream[];
  pending: Night[];
  lastKick?: number;
  tockSpent?: number;
  _musicLog?: number;
  _storm?: boolean;
  _freeze?: boolean;
}

export interface Weather {
  temp: number;
  storm: boolean;
  rain: boolean;
  snow: boolean;
  night: boolean;
  hour: number;
  day: number;
}

export interface ForecastDay {
  day: number;
  start: number;
  lo: number;
  hi: number;
  storm: boolean;
  rain: boolean;
  snow: boolean;
}

export interface StepContext {
  present: boolean;
  hand: { x: number; y?: number } | null;
  live: boolean;
}

export type SimEvent =
  | 'storm'
  | 'bridge'
  | 'thunder'
  | 'climbed'
  | 'board-taught'
  | 'hatch'
  | 'night'
  | 'avoided'
  | 'splash'
  | 'ate'
  | 'spin'
  | 'vend'
  | 'music'
  | 'board'
  | 'caught'
  | 'kick'
  | 'kick-back'
  | 'fetched'
  | 'robot-lever'
  | 'robot-fed'
  | 'robot-warn'
  | 'robot-named'
  | 'tock-broke'
  | 'tock-bought'
  | 'squirrel-up'
  | 'honey'
  | HurtEvent
  | `want:${WantKind}`
  | `poke:${string}`
  | `egg:${string}`
  | `warned:${string}:${string}:${0 | 1}`;
export type HurtEvent = 'stung' | 'pricked' | 'sick';

/** One step's events for the selected Kith; `others` carries everyone else's. */
export type StepEvents = SimEvent[] & {
  others: { id: string; e: SimEvent }[];
};
