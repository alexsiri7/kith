import { z } from 'zod';
import type { EntityType, MeaningId, NeedId, VerbId } from './entity.js';
import { formatIssues } from './entity.js';
import type { GameEvent } from './event.js';
import {
  ACTIVITIES,
  mindState,
  type Levels,
  type Mind,
  type MindContent,
  type Trait,
} from './mind.js';
import type { Registry } from './registry.js';
import { nextFloat } from './rng.js';
import type { Presence, StepResult } from './step.js';
import type { Target } from './target.js';
import { addCoins, addMoment, type EntityId, type World } from './world.js';

const HOUR_MS = 3_600_000;

/** What a word must look like to be learned: lower case, as heard. */
const WORD = /^[a-z']{1,16}$/;

/** Durations are in sim milliseconds and distances in px. */
export interface LanguageDef {
  readonly teaching: {
    /** Strength a word gains per teaching, scaled by learn rate and channel. */
    readonly rate: number;
    /** A word this strong can be said and understood. */
    readonly speakable: number;
    /** Paid to the player each time a word becomes speakable. */
    readonly speakableCoins: number;
  };
  /** Rates are per game hour. */
  readonly memory: {
    /** Lost while awake, or asleep below `consolidateAbove`. */
    readonly decayPerHour: number;
    /** Words this strong no longer fade. */
    readonly keepAbove: number;
    /** Gained while asleep by words at least `consolidateAbove`. */
    readonly consolidatePerHour: number;
    readonly consolidateAbove: number;
  };
  readonly speech: {
    /** Most words said at once, by stage. */
    readonly maxWords: Readonly<Record<string, number>>;
    readonly defaultMaxWords: number;
    /** Said capitalised, like `kin:` names. */
    readonly properNouns: readonly MeaningId[];
    readonly babble: {
      readonly words: readonly [number, number];
      /** Chance each syllable is said twice. */
      readonly repeat: number;
      readonly exclaim: number;
    };
    /** How long after speaking before it chatters again. */
    readonly sayMs: number;
  };
  readonly chatter: {
    readonly every: readonly [number, number];
    /** A need above this is felt enough to say. */
    readonly feelAbove: number;
    /** The word meaning each need's feeling. */
    readonly feelings: Readonly<Record<NeedId, MeaningId>>;
    /** Needs it calls the watching player about by name. */
    readonly callPlayer: readonly NeedId[];
    /** Chance it names what it is busy with or who is near, feeling nothing. */
    readonly mention: number;
    readonly nearby: number;
    /** Chance a Kith past babyhood with nothing to say stays quiet. */
    readonly quiet: number;
    /** Kith this close pick up the words it knows at least `spreadAbove`. */
    readonly hearWithin: number;
    readonly spreadAbove: number;
    /** Teaching strengths for a listener, and for its child. */
    readonly strength: number;
    readonly parentStrength: number;
  };
  /**
   * While unattended, awake Kith this close pick up each other's words a
   * little each hour, faster from a parent.
   */
  readonly overhear: {
    readonly within: number;
    readonly perHour: number;
    readonly parent: number;
  };
  /** Where the player points, Kith look; while they still look, they attend. */
  readonly attention: {
    readonly noticeWithin: number;
    readonly lookMs: number;
    readonly attendMs: number;
    readonly attendWithin: number;
  };
  readonly hearing: {
    /** Words heard past this many are ignored. */
    readonly maxWords: number;
    /** Talk wakes it only while every listed need is below its level. */
    readonly wakeBelow: Levels;
    /** Teaching strengths: plain talk, and naming what is pointed at. */
    readonly plain: number;
    readonly pointed: number;
    readonly attending: number;
    /** Kith this close to the listener learn a pointed name too. */
    readonly bystanders: number;
    readonly bystanderWithin: number;
    /** Words never taken as the name of what is pointed at. */
    readonly ignore: readonly string[];
    /** A lone word names a feeling above this. */
    readonly feelAbove: number;
  };
  /** Meanings that are commands; `direct` ones override nouns said before them. */
  readonly commands: Readonly<
    Record<MeaningId, { readonly verb: VerbId; readonly direct?: true }>
  >;
  /** Obeys with chance `base + trust × trust + perTrait × genome[trait] + Σ needs`. */
  readonly obey: {
    readonly base: number;
    readonly trust: number;
    readonly trait: Trait;
    readonly perTrait: number;
    readonly needs: Levels;
    /** The bias an obeyed command adds. */
    readonly ms: number;
    readonly strength: number;
  };
}

const lexicon = z.record(
  z.string(),
  z.object({ meaning: z.string(), strength: z.number() }),
);

/**
 * The state fields language reads and writes. A type with `language` spreads
 * this shape into its state alongside the mind's.
 */
export const languageShape = {
  lexicon: lexicon.default({}),
  /** Kith whose words it picks up faster. */
  parents: z.array(z.string()).default([]),
  /** Its babbling voice. */
  syllables: z.array(z.string().min(1)).min(1).default(['ba', 'mi', 'nu']),
  /** How much it trusts the player; relationships (#11) move it. */
  trust: z.number().min(0).max(1).default(0.2),
  /** Where it looks because the player pointed there. */
  look: z.object({ x: z.number(), until: z.number() }).nullable().default(null),
  nextChatter: z.number().default(0),
};

export const languageState = z.object(languageShape);
export type Language = z.infer<typeof languageState>;
export type Lexicon = Language['lexicon'];

export interface LanguageContent extends MindContent {
  readonly meanings: ReadonlySet<MeaningId>;
}

/** Checks a language against the known content, phrased to follow `type "<id>" `. */
export function languageProblems(
  def: LanguageDef,
  defaults: unknown,
  known: LanguageContent,
): string[] {
  const problems: string[] = [];
  const state = languageState.safeParse(defaults);
  if (!state.success) {
    for (const issue of formatIssues(state.error)) {
      problems.push(`language needs state field ${issue}`);
    }
  }
  const meanings = [
    ...Object.values(def.chatter.feelings),
    ...Object.keys(def.commands),
    ...def.speech.properNouns,
  ];
  for (const meaning of new Set(meanings)) {
    if (!known.meanings.has(meaning)) {
      problems.push(`language uses unknown meaning "${meaning}"`);
    }
  }
  const activities: ReadonlySet<string> = new Set(ACTIVITIES);
  for (const { verb } of Object.values(def.commands)) {
    if (!known.verbs.has(verb) && !activities.has(verb)) {
      problems.push(`language commands unknown verb "${verb}"`);
    }
  }
  const needs = [
    ...Object.keys(def.chatter.feelings),
    ...def.chatter.callPlayer,
    ...Object.keys(def.hearing.wakeBelow),
    ...Object.keys(def.obey.needs),
  ];
  for (const need of new Set(needs)) {
    if (!known.needs.has(need)) {
      problems.push(`language uses unknown need "${need}"`);
    }
  }
  return problems;
}

/** A living, hatched entity whose type declares language. */
interface Speaker {
  readonly id: EntityId;
  readonly x: number;
  readonly type: EntityType;
  readonly def: LanguageDef;
  readonly mind: Mind;
  readonly lang: Language;
  readonly name: string;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

const KIN = 'kin:';
const kinOf = (id: EntityId): MeaningId => `${KIN}${id}`;
const kinId = (meaning: MeaningId): EntityId | null =>
  meaning.startsWith(KIN) ? meaning.slice(KIN.length) : null;

function nameOf(state: unknown): string {
  return typeof state === 'object' &&
    state !== null &&
    'name' in state &&
    typeof state.name === 'string'
    ? state.name
    : '';
}

function speakerOf(
  world: World,
  registry: Registry,
  id: EntityId,
): Speaker | null {
  const entity = world.entities[id];
  const type = entity && registry.types.get(entity.type);
  if (entity === undefined || type?.language === undefined) return null;
  const mind = mindState.parse(entity.state);
  if (!mind.alive || mind.stage === 'egg') return null;
  return {
    id,
    x: entity.x,
    type,
    def: type.language,
    mind,
    lang: languageState.parse(entity.state),
    name: nameOf(entity.state) || id,
  };
}

/** Awake Kith with language, other than `id`, within `within` px of `x`. */
function listenersNear(
  world: World,
  registry: Registry,
  id: EntityId,
  x: number,
  within: number,
): Speaker[] {
  return Object.keys(world.entities)
    .filter((other) => other !== id)
    .map((other) => speakerOf(world, registry, other))
    .filter(
      (other): other is Speaker =>
        other !== null && !other.mind.asleep && Math.abs(other.x - x) <= within,
    );
}

/** Writes language and mind fields, checking the whole state against the type. */
function withSpeaker(
  world: World,
  speaker: Speaker,
  change: Partial<Language & Mind>,
): World {
  const entity = world.entities[speaker.id]!;
  if (typeof entity.state !== 'object' || entity.state === null) {
    throw new Error(`${entity.type} ${entity.id} has no state fields`);
  }
  const state = speaker.type.state.parse({ ...entity.state, ...change });
  return {
    ...world,
    entities: { ...world.entities, [speaker.id]: { ...entity, state } },
  };
}

function roll(world: World): [number, World] {
  const draw = nextFloat(world.rng.behaviour);
  return [
    draw.value,
    { ...world, rng: { ...world.rng, behaviour: draw.state } },
  ];
}

function dominantAbove(needs: Levels, above: number): NeedId | null {
  let best: NeedId | null = null;
  let level = above;
  for (const [need, value] of Object.entries(needs)) {
    if (value > level) [best, level] = [need, value];
  }
  return best;
}

/** The lexicon of a living, hatched entity with language, else empty. */
export function lexiconOf(
  world: World,
  registry: Registry,
  id: EntityId,
): Lexicon {
  return speakerOf(world, registry, id)?.lang.lexicon ?? {};
}

/** Whether `id` has language and is alive, hatched and awake. */
export function listens(
  world: World,
  registry: Registry,
  id: EntityId,
): boolean {
  const speaker = speakerOf(world, registry, id);
  return speaker !== null && !speaker.mind.asleep;
}

export function knows(lexicon: Lexicon, word: string, def: LanguageDef) {
  return (lexicon[word]?.strength ?? 0) >= def.teaching.speakable;
}

/** The strongest speakable word for `meaning`. */
export function wordFor(
  lexicon: Lexicon,
  meaning: MeaningId,
  def: LanguageDef,
): string | null {
  let best: string | null = null;
  let strength = def.teaching.speakable;
  for (const [word, entry] of Object.entries(lexicon)) {
    if (
      entry.meaning === meaning &&
      entry.strength >= strength &&
      (best === null || entry.strength > strength)
    ) {
      [best, strength] = [word, entry.strength];
    }
  }
  return best;
}

function isMeaning(world: World, registry: Registry, meaning: MeaningId) {
  if (registry.meanings.has(meaning)) return true;
  const kin = kinId(meaning);
  return kin !== null && kin in world.entities;
}

/**
 * The one way a word is learned. Every channel teaches through it: gain is
 * `rate × learnRate × strength`, a word heard with a new meaning starts over,
 * and a word becoming speakable emits `learnedWord` and pays the player.
 * Ignores invalid words, unknown meanings, and entities that cannot learn.
 */
export function teach(
  world: World,
  registry: Registry,
  id: EntityId,
  word: string,
  meaning: MeaningId,
  strength: number,
): StepResult {
  const kith = speakerOf(world, registry, id);
  word = word.toLowerCase();
  if (kith === null || !WORD.test(word) || !isMeaning(world, registry, meaning))
    return { world, events: [] };
  const { teaching } = kith.def;
  const { lexicon } = kith.lang;
  const entry = lexicon[word];
  const was = entry?.meaning === meaning ? entry.strength : 0;
  const is = clamp(was + teaching.rate * kith.mind.genome.learnRate * strength);
  const events: GameEvent[] = [];
  const moments: string[] = [];
  if (entry?.meaning !== meaning) {
    if (Object.keys(lexicon).length === 0) {
      moments.push(`${kith.name} started learning a first word: "${word}".`);
    }
    if (
      meaning === 'you' &&
      !Object.values(lexicon).some((e) => e.meaning === 'you')
    ) {
      moments.push(`${kith.name} began to learn your name.`);
    }
  }
  world = moments.reduce((w, text) => addMoment(w, id, text), world);
  if (was < teaching.speakable && is >= teaching.speakable) {
    events.push({ type: 'learnedWord', actor: id, word });
    world = addCoins(world, teaching.speakableCoins);
  }
  return {
    world: withSpeaker(world, kith, {
      lexicon: { ...lexicon, [word]: { meaning, strength: is } },
    }),
    events,
  };
}

/** Its babble: a few of its syllables, some doubled, maybe exclaimed. */
function babble(world: World, kith: Speaker): [string, World] {
  const { words, repeat, exclaim } = kith.def.speech.babble;
  const { syllables } = kith.lang;
  let r: number;
  [r, world] = roll(world);
  const n = words[0] + Math.floor(r * (words[1] - words[0] + 1));
  const said: string[] = [];
  for (let i = 0; i < n; i++) {
    [r, world] = roll(world);
    const syllable = syllables[Math.floor(r * syllables.length)]!;
    [r, world] = roll(world);
    said.push(syllable.repeat(r < repeat ? 2 : 1));
  }
  [r, world] = roll(world);
  return [said.join(' ') + (r < exclaim ? '!' : ''), world];
}

/**
 * Keeps the words it can say, up to its stage's limit, with their
 * punctuation; with none left, it babbles.
 */
function gate(world: World, kith: Speaker, text: string): [string, World] {
  const { speech } = kith.def;
  const max = speech.maxWords[kith.mind.stage] ?? speech.defaultMaxWords;
  const kept: string[] = [];
  for (const token of text.toLowerCase().match(/[a-z']+|[!?.]+/g) ?? []) {
    const last = kept.at(-1);
    if (/^[!?.]/.test(token)) {
      if (last !== undefined && !/[!?.]$/.test(last)) {
        kept[kept.length - 1] = last + token[0]!;
      }
      continue;
    }
    if (kept.length >= max || !knows(kith.lang.lexicon, token, kith.def)) {
      continue;
    }
    const { meaning } = kith.lang.lexicon[token]!;
    kept.push(
      speech.properNouns.includes(meaning) || kinId(meaning) !== null
        ? token[0]!.toUpperCase() + token.slice(1)
        : token,
    );
  }
  return kept.length > 0 ? [kept.join(' '), world] : babble(world, kith);
}

/** Says `text`, gated to the words it knows, and holds its chatter a while. */
export function speak(
  world: World,
  registry: Registry,
  id: EntityId,
  text: string,
): StepResult {
  const kith = speakerOf(world, registry, id);
  if (kith === null) return { world, events: [] };
  const [said, next] = gate(world, kith, text);
  const nextChatter = Math.max(
    kith.lang.nextChatter,
    next.clock.simTime + kith.def.speech.sayMs,
  );
  return {
    world: withSpeaker(next, kith, { nextChatter }),
    events: [{ type: 'said', actor: id, text: said }],
  };
}

/**
 * Takes the words it knows as a command: the last that names one, or the
 * first direct one. It obeys by chance, from trust, genome and needs; an
 * obeyed command biases what it does next, ends what it is doing and wakes it.
 */
export function obey(
  world: World,
  registry: Registry,
  id: EntityId,
  words: readonly string[],
): StepResult {
  const kith = speakerOf(world, registry, id);
  if (kith === null) return { world, events: [] };
  const { def, mind, lang } = kith;
  let verb: VerbId | null = null;
  for (const word of words) {
    const command = def.commands[lang.lexicon[word]?.meaning ?? ''];
    if (command === undefined || !knows(lang.lexicon, word, def)) continue;
    verb = command.verb;
    if (command.direct) break;
  }
  if (verb === null) return { world, events: [] };
  const { obey: o } = def;
  let p = o.base + o.trust * lang.trust + o.perTrait * mind.genome[o.trait];
  for (const [need, weight] of Object.entries(o.needs)) {
    p += weight * (mind.needs[need] ?? 0);
  }
  p = clamp(p);
  let obeyed = p >= 1;
  if (p > 0 && p < 1) {
    let r: number;
    [r, world] = roll(world);
    obeyed = r < p;
  }
  const events: GameEvent[] = [{ type: 'understood', actor: id, verb, obeyed }];
  if (!obeyed) return { world, events };
  const now = world.clock.simTime;
  return {
    world: withSpeaker(world, kith, {
      biases: [
        ...mind.biases.filter((bias) => bias.until > now),
        { verb, until: now + o.ms, strength: o.strength },
      ],
      act: mind.act && { ...mind.act, done: true, until: now },
      asleep: false,
    }),
    events,
  };
}

/** What `target` means to `listener`: itself, a kin, a type's meaning or a sky body. */
export function meaningFor(
  world: World,
  registry: Registry,
  listener: EntityId,
  target: Target,
): MeaningId | null {
  if (target.kind === 'player') return null;
  if (target.kind === 'sky') {
    return registry.meanings.has(target.body) ? target.body : null;
  }
  if (target.id === listener) return 'self';
  const entity = world.entities[target.id];
  const type = entity && registry.types.get(entity.type);
  if (type === undefined) return null;
  if (type.language !== undefined) return kinOf(target.id);
  return type.meaning ?? null;
}

/**
 * The player points: the selected Kith, and awake Kith near it, look there.
 * Pointing at the selected Kith itself draws no one's eye.
 */
export function notice(
  world: World,
  registry: Registry,
  target: Target,
): World {
  const selected = world.selectedKith;
  const kith = selected === null ? null : speakerOf(world, registry, selected);
  if (kith === null || target.kind === 'player') return world;
  let x: number | null = null;
  if (target.kind !== 'sky') {
    if (target.id === kith.id) return world;
    x = world.entities[target.id]?.x ?? null;
    if (x === null) return world;
  }
  const until = world.clock.simTime + kith.def.attention.lookMs;
  const lookers = [
    ...(kith.mind.asleep ? [] : [kith]),
    ...listenersNear(
      world,
      registry,
      kith.id,
      kith.x,
      kith.def.attention.noticeWithin,
    ),
  ];
  for (const looker of lookers) {
    world = withSpeaker(world, looker, {
      look: { x: x ?? looker.x, until },
    });
  }
  return world;
}

/** Still looking, or just looked, where the player pointed. */
function attending(kith: Speaker, now: number): boolean {
  const { look } = kith.lang;
  const { attendMs, attendWithin } = kith.def.attention;
  return (
    look !== null &&
    !kith.mind.asleep &&
    now < look.until + attendMs &&
    Math.abs(look.x - kith.x) < attendWithin
  );
}

/** Entities named in what was said: the player, the Kith itself, or others. */
function namedIn(
  world: World,
  registry: Registry,
  kith: Speaker,
  word: string,
): MeaningId | null {
  if (word === world.player.name.toLowerCase()) return 'you';
  if (word === kith.name.toLowerCase()) return 'self';
  for (const entity of Object.values(world.entities)) {
    if (entity.id === kith.id || nameOf(entity.state).toLowerCase() !== word) {
      continue;
    }
    const type = registry.types.get(entity.type);
    if (type?.language !== undefined) return kinOf(entity.id);
    if (type?.meaning !== undefined) return type.meaning;
  }
  return null;
}

/** What a lone word most likely names: a strong feeling, its focus, or its act. */
function guess(
  world: World,
  registry: Registry,
  kith: Speaker,
): MeaningId | null {
  const { act } = kith.mind;
  const target =
    act !== null && !act.done && act.target?.kind === 'entity'
      ? world.entities[act.target.id]
      : undefined;
  const focus = target && registry.types.get(target.type)?.meaning;
  const need = dominantAbove(kith.mind.needs, kith.def.hearing.feelAbove);
  const feeling = need === null ? undefined : kith.def.chatter.feelings[need];
  if (feeling !== undefined && focus === undefined) return feeling;
  if (focus !== undefined) return focus;
  if (act !== null && !act.done && registry.meanings.has(act.verb)) {
    return act.verb;
  }
  return null;
}

/**
 * The player speaks to the selected Kith, perhaps pointing. Plain talk teaches
 * the names it recognises, and a lone word it does not know what it most likely
 * means; the word that names what is pointed at is taught to it and to Kith nearby. The other
 * words it knows may be a command. A word taught now is never also a command.
 */
export function hear(
  world: World,
  registry: Registry,
  text: string,
  pointing?: Target,
): StepResult {
  const selected = world.selectedKith;
  const woken = selected === null ? null : speakerOf(world, registry, selected);
  if (woken === null) return { world, events: [] };
  const { hearing } = woken.def;
  if (woken.mind.asleep) {
    const rested = Object.entries(hearing.wakeBelow).every(
      ([need, level]) => (woken.mind.needs[need] ?? 0) < level,
    );
    if (!rested) return { world, events: [] };
    world = withSpeaker(world, woken, { asleep: false });
  }
  const kith = speakerOf(world, registry, woken.id)!;
  const words = (text.toLowerCase().match(/[a-z']+/g) ?? []).slice(
    0,
    hearing.maxWords,
  );
  const events: GameEvent[] = [];
  const taught = new Set<string>();
  const learn = (
    id: EntityId,
    word: string,
    meaning: MeaningId,
    strength: number,
  ) => {
    const result = teach(world, registry, id, word, meaning, strength);
    world = result.world;
    events.push(...result.events);
  };
  const named = words.map((word) => namedIn(world, registry, kith, word));
  if (
    words.length === 1 &&
    named[0] === null &&
    pointing === undefined &&
    !knows(kith.lang.lexicon, words[0]!, kith.def)
  ) {
    named[0] = guess(world, registry, kith);
  }
  words.forEach((word, i) => {
    const meaning = named[i];
    if (meaning === null || meaning === undefined) return;
    learn(kith.id, word, meaning, hearing.plain);
    taught.add(word);
  });
  const pointed =
    pointing === undefined
      ? null
      : meaningFor(world, registry, kith.id, pointing);
  if (pointing !== undefined && pointed !== null) {
    const lexicon = lexiconOf(world, registry, kith.id);
    const player = world.player.name.toLowerCase();
    const candidates = words.filter(
      (word) =>
        !taught.has(word) &&
        !hearing.ignore.includes(word) &&
        word !== player &&
        !(knows(lexicon, word, kith.def) && lexicon[word]!.meaning !== pointed),
    );
    const pick =
      candidates.length === 1
        ? candidates[0]
        : candidates.find((word) => lexicon[word]?.meaning === pointed);
    const kin = kinId(pointed);
    const proper =
      pointed === 'self'
        ? kith.name
        : kin !== null
          ? nameOf(world.entities[kin]?.state)
          : null;
    if (
      pick !== undefined &&
      (proper === null || pick === proper.toLowerCase())
    ) {
      const strength = attending(kith, world.clock.simTime)
        ? hearing.attending
        : hearing.pointed;
      learn(kith.id, pick, pointed, strength);
      taught.add(pick);
      for (const other of listenersNear(
        world,
        registry,
        kith.id,
        kith.x,
        hearing.bystanderWithin,
      )) {
        const meaning = meaningFor(world, registry, other.id, pointing);
        if (meaning !== null && meaning !== 'self') {
          learn(other.id, pick, meaning, hearing.bystanders);
        }
      }
    }
  }
  const obeyed = obey(
    world,
    registry,
    kith.id,
    words.filter((word) => !taught.has(word)),
  );
  return { world: obeyed.world, events: [...events, ...obeyed.events] };
}

/**
 * Tock's channel for naming things: `speaker` says `word`, and an awake
 * `listener` learns it means `meaning`.
 */
export function tell(
  world: World,
  registry: Registry,
  speaker: EntityId,
  listener: EntityId,
  word: string,
  meaning: MeaningId,
  strength: number,
): StepResult {
  const said: GameEvent = { type: 'said', actor: speaker, text: `${word}.` };
  if (!listens(world, registry, listener)) return { world, events: [said] };
  const taught = teach(world, registry, listener, word, meaning, strength);
  return { world: taught.world, events: [said, ...taught.events] };
}

/** Words fade while awake and settle in sleep; a word faded away is forgotten. */
function remember(
  world: World,
  kith: Speaker,
  dtMs: number,
  events: GameEvent[],
): World {
  const { memory } = kith.def;
  const hours = dtMs / HOUR_MS;
  const lexicon: Record<string, Lexicon[string]> = {};
  for (const [word, entry] of Object.entries(kith.lang.lexicon)) {
    let { strength } = entry;
    if (kith.mind.asleep && strength >= memory.consolidateAbove) {
      strength = clamp(strength + memory.consolidatePerHour * hours);
    } else if (strength < memory.keepAbove) {
      strength -= memory.decayPerHour * hours;
    }
    if (strength > 0) lexicon[word] = { ...entry, strength };
    else events.push({ type: 'forgotWord', actor: kith.id, word });
  }
  return withSpeaker(world, kith, { lexicon });
}

/** Whether `listener` can pick up `word` as `speaker` means it. */
function spreads(
  speaker: Speaker,
  listener: Lexicon,
  word: string,
  above: number,
): boolean {
  const entry = speaker.lang.lexicon[word];
  if (entry === undefined || entry.strength < above) return false;
  if (entry.meaning === 'self' || kinId(entry.meaning) !== null) {
    return false;
  }
  const heard = listener[word];
  return heard === undefined || heard.meaning === entry.meaning;
}

/** Picks up the words awake Kith nearby know well, while unattended. */
function overhear(
  world: World,
  registry: Registry,
  kith: Speaker,
  dtMs: number,
  events: GameEvent[],
): World {
  const { overhear: o, chatter } = kith.def;
  const hours = dtMs / HOUR_MS;
  for (const speaker of listenersNear(
    world,
    registry,
    kith.id,
    kith.x,
    o.within,
  )) {
    const parent = kith.lang.parents.includes(speaker.id) ? o.parent : 1;
    for (const word of Object.keys(speaker.lang.lexicon)) {
      const heard = lexiconOf(world, registry, kith.id);
      if (!spreads(speaker, heard, word, chatter.spreadAbove)) continue;
      const { meaning } = speaker.lang.lexicon[word]!;
      const taught = teach(
        world,
        registry,
        kith.id,
        word,
        meaning,
        o.perHour * hours * parent,
      );
      world = taught.world;
      events.push(...taught.events);
    }
  }
  return world;
}

/** What it would say unprompted: a strong feeling, or what is on its mind. */
function thoughts(
  world: World,
  registry: Registry,
  kith: Speaker,
  presence: Presence,
): [string[], World] {
  const { chatter } = kith.def;
  const { lexicon } = kith.lang;
  const say = (meaning: MeaningId | undefined) =>
    meaning === undefined ? null : wordFor(lexicon, meaning, kith.def);
  const need = dominantAbove(kith.mind.needs, chatter.feelAbove);
  const words: string[] = [];
  if (need !== null) {
    const you = say('you');
    if (
      you !== null &&
      presence.watching &&
      chatter.callPlayer.includes(need)
    ) {
      words.push(you);
    }
    const feeling = say(chatter.feelings[need]);
    if (feeling !== null) words.push(feeling);
  }
  if (words.length > 0) return [words, world];
  const { act } = kith.mind;
  const focus =
    act !== null && act.target?.kind === 'entity'
      ? world.entities[act.target.id]
      : undefined;
  const candidates = [
    say(focus && registry.types.get(focus.type)?.meaning),
    ...Object.values(world.entities)
      .filter(
        (other) =>
          other.id !== kith.id &&
          nameOf(other.state) !== '' &&
          Math.abs(other.x - kith.x) < chatter.nearby,
      )
      .map((other) =>
        say(
          meaningFor(world, registry, kith.id, {
            kind: 'entity',
            id: other.id,
          }) ?? undefined,
        ),
      ),
  ].filter((word): word is string => word !== null);
  const options = [...new Set(candidates)];
  if (options.length === 0) return [words, world];
  let r: number;
  [r, world] = roll(world);
  if (r >= chatter.mention) return [words, world];
  [r, world] = roll(world);
  return [[options[Math.floor(r * options.length)]!], world];
}

/**
 * Says what is on its mind, or babbles; awake Kith in earshot pick up the
 * words it knows well, a parent's faster.
 */
function chatter(
  world: World,
  registry: Registry,
  kith: Speaker,
  presence: Presence,
  events: GameEvent[],
): World {
  const { chatter: c, speech } = kith.def;
  const now = world.clock.simTime;
  let r: number;
  [r, world] = roll(world);
  world = withSpeaker(world, kith, {
    nextChatter: now + c.every[0] + r * (c.every[1] - c.every[0]),
  });
  let words: string[];
  [words, world] = thoughts(world, registry, kith, presence);
  if (words.length === 0 && kith.mind.stage !== 'baby') {
    [r, world] = roll(world);
    if (r < c.quiet) return world;
  }
  words = words.slice(
    0,
    speech.maxWords[kith.mind.stage] ?? speech.defaultMaxWords,
  );
  const said = speak(
    world,
    registry,
    kith.id,
    words.length > 0 ? `${words.join(' ')}!` : '',
  );
  world = said.world;
  events.push(...said.events);
  for (const other of listenersNear(
    world,
    registry,
    kith.id,
    kith.x,
    c.hearWithin,
  )) {
    const strength = other.lang.parents.includes(kith.id)
      ? c.parentStrength
      : c.strength;
    for (const word of words) {
      const heard = lexiconOf(world, registry, other.id);
      if (!spreads(kith, heard, word, c.spreadAbove)) continue;
      const { meaning } = kith.lang.lexicon[word]!;
      const taught = teach(world, registry, other.id, word, meaning, strength);
      world = taught.world;
      events.push(...taught.events);
    }
  }
  return world;
}

/**
 * One step of an entity's language: its words fade or settle; live, it
 * chatters when it is awake and has not spoken lately; while unattended, it
 * picks up words from the Kith around it.
 */
export function languageStep(
  world: World,
  registry: Registry,
  presence: Presence,
  live: boolean,
  id: EntityId,
  dtMs: number,
): StepResult {
  let kith = speakerOf(world, registry, id);
  if (kith === null) return { world, events: [] };
  const events: GameEvent[] = [];
  if (Object.keys(kith.lang.lexicon).length > 0) {
    world = remember(world, kith, dtMs, events);
    kith = speakerOf(world, registry, id)!;
  }
  if (kith.mind.asleep) return { world, events };
  if (!live) {
    return { world: overhear(world, registry, kith, dtMs, events), events };
  }
  if (world.clock.simTime < kith.lang.nextChatter) return { world, events };
  return { world: chatter(world, registry, kith, presence, events), events };
}
