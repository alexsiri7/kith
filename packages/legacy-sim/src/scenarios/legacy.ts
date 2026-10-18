import {
  catchUp,
  content,
  DAY,
  fearsRiver,
  HOUR,
  knows,
  newCreature,
  newGenome,
  newWorld,
  rngOf,
  ruleWants,
  step,
} from '../index.js';
import type { Creature, LogEntry, LogType, World } from '../index.js';
import type {
  Activity,
  KithTally,
  LiveSession,
  ScenarioSim,
  WorldSpec,
} from './harness.js';

const START = Date.UTC(2026, 9, 14, 9);
/** The app steps a live garden at most 200ms at a time. */
const LIVE_STEP = 200;
/** How often the app, without Claude, gives a content Kith new wishes. */
const WISH_EVERY = 300e3;

export const legacySim: ScenarioSim = {
  run(spec) {
    const w = garden(spec);
    const kith = [...w.kith];
    const log = logCounter(w);
    const activity: Record<Activity, number> = {
      resting: 0,
      playing: 0,
      wishing: 0,
      other: 0,
    };
    leaveAlone(w, spec.days * DAY, log.read);
    if (spec.present)
      visit(w, spec.present, () => {
        log.read();
        for (const c of kith) if (c.alive) activity[activityOf(c)] += LIVE_STEP;
      });
    return {
      kith: kith.map(tally),
      tockSpent: w.tockSpent || 0,
      meals: (log.events.ate ?? 0) + (log.events.vended ?? 0),
      events: log.events,
      activity,
    };
  },
};

function garden({ seed, kith, coins }: WorldSpec) {
  const w = newWorld(seed, START, 'A', 'Pip', kith > 1 ? 'Moss' : null);
  while (w.kith.length < kith)
    w.kith.push(
      newCreature(
        w,
        'K' + w.kith.length,
        START,
        newGenome(rngOf(w)),
        300 + w.kith.length * 40,
      ),
    );
  for (const c of w.kith) c.hatchAt = START;
  w.coins = coins;
  return w;
}

/** catchUp an hour at a time, which steps the garden exactly as one long catchUp would. */
function leaveAlone(w: World, ms: number, eachHour: () => void) {
  const end = w.simTime + ms;
  while (w.simTime < end) {
    catchUp(w, Math.min(w.simTime + HOUR, end));
    eachHour();
  }
}

function visit(w: World, session: LiveSession, eachStep: () => void) {
  const ctx = { present: true, hand: session.hand, live: true };
  let wishedAt = -Infinity;
  for (let t = 0; t < session.minutes * 60e3; t += LIVE_STEP) {
    step(w, LIVE_STEP, ctx);
    eachStep();
    const c = w.creature;
    if (
      !c.asleep &&
      content(c) &&
      !c.wants.length &&
      w.simTime - wishedAt > WISH_EVERY
    ) {
      wishedAt = w.simTime;
      ruleWants(w);
    }
  }
}

/** Counts every log entry once, though the log keeps only its last 800. */
function logCounter(w: World) {
  const events: Partial<Record<LogType, number>> = {};
  let last: LogEntry | undefined;
  return {
    events,
    read() {
      const from = last ? w.log.lastIndexOf(last) + 1 : 0;
      if (last && !from)
        throw new Error('The log turned over between two reads');
      for (const e of w.log.slice(from))
        events[e.type] = (events[e.type] ?? 0) + 1;
      last = w.log.at(-1) ?? last;
    },
  };
}

function activityOf(c: Creature): Activity {
  const kind = c.asleep ? 'sleep' : c.act?.kind;
  if (kind === 'rest' || kind === 'sleep') return 'resting';
  if (kind === 'play') return 'playing';
  if (kind === 'want') return 'wishing';
  return 'other';
}

function tally(c: Creature): KithTally {
  return {
    cause: c.alive ? null : c.cause,
    avoidsRiver: fearsRiver(c),
    words: Object.keys(c.lex).filter((word) => knows(c, word)).length,
    opinions: { ...c.objVal },
  };
}
