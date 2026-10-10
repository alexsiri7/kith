import type { FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type pg from 'pg';

/** The game only ever asks for `quick`, which claude.ai's `sample` also offers. */
export type ModelTier = 'quick';

function isModelTier(tier: unknown): tier is ModelTier {
  return tier === 'quick';
}

/** Claude Haiku 4.5, in Requesty's `provider/model` form. */
export const defaultModel = 'anthropic/claude-haiku-4-5-20251001';

// Claude Haiku 4.5's list price, in millionths of a dollar per token. Calls are
// held at it, and settled at it when Requesty reports no cost of its own.
const inputMicrodollarsPerToken = 1;
const outputMicrodollarsPerToken = 5;

function listPrice(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * inputMicrodollarsPerToken +
    outputTokens * outputMicrodollarsPerToken
  );
}

/** What one call to Claude used, as `mind_calls` records it. */
export interface MindCall {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicrodollars: number;
}

export interface Thought {
  /** Claude's reply, which the prompt asked to be JSON. */
  text: string;
  call: MindCall;
}

export interface Mind {
  /** The model every call asks. */
  model: string;
  /** Rejects when Claude does not answer. */
  think(prompt: string): Promise<Thought>;
}

export const requestyChatUrl = 'https://router.requesty.ai/v1/chat/completions';
const maxReplyTokens = 1024;
const framingTokens = 32;
const requestyTimeoutMs = 30_000;
const system =
  'Reply with only the JSON the prompt asks for: no prose and no code fences.';

function field(value: unknown, name: PropertyKey): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

function tokenCount(usage: unknown, name: string): number {
  const count = field(usage, name);
  if (!Number.isSafeInteger(count)) {
    throw new Error(`Requesty reply has no usage.${name}`);
  }
  return count as number;
}

/** Requesty's own cost of the call, when it reports one in US dollars. */
function reportedCostMicrodollars(usage: unknown): number | undefined {
  const cost = field(usage, 'cost');
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0
    ? Math.round(cost * 1_000_000)
    : undefined;
}

function replyText(choices: unknown): string {
  const content = field(field(field(choices, 0), 'message'), 'content');
  if (typeof content !== 'string') {
    throw new Error('Requesty reply has no message content');
  }
  return content;
}

/** Claude through Requesty's OpenAI-compatible router, paid for by `apiKey`. */
export function requestyMind(options: {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}): Mind {
  const { apiKey, model } = options;
  const send = options.fetch ?? fetch;
  return {
    model,
    async think(prompt) {
      const res = await send(requestyChatUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxReplyTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(requestyTimeoutMs),
      });
      if (!res.ok) throw new Error(`Requesty answered ${res.status}`);
      const body = (await res.json()) as Record<string, unknown>;
      const inputTokens = tokenCount(body.usage, 'prompt_tokens');
      const outputTokens = tokenCount(body.usage, 'completion_tokens');
      return {
        text: replyText(body.choices),
        call: {
          model,
          inputTokens,
          outputTokens,
          costMicrodollars:
            reportedCostMicrodollars(body.usage) ??
            listPrice(inputTokens, outputTokens),
        },
      };
    },
  };
}

/**
 * The most a call can use: every token of a prompt is at least one byte of it,
 * plus a few to frame the message, and the reply stops at `maxReplyTokens`.
 */
export function mostACallUses(prompt: string, model: string): MindCall {
  const inputTokens =
    Buffer.byteLength(system) + Buffer.byteLength(prompt) + framingTokens;
  return {
    model,
    inputTokens,
    outputTokens: maxReplyTokens,
    costMicrodollars: listPrice(inputTokens, maxReplyTokens),
  };
}

/**
 * The JSON object in a reply, or undefined when there is none. Tolerates the
 * prose or code fence a model sometimes wraps it in.
 */
export function parseReply(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) return undefined;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export interface MindLimits {
  /** Calls each player's Kith may make a day; 0 turns the mind off. */
  dailyCalls: number;
  /** What all players' calls together may cost a month. */
  monthlySpendUsd: number;
}

/**
 * The Claude calls made so far, which the limits are measured against: a
 * player's calls since midnight UTC, and every player's spend since the 1st of
 * this month, UTC.
 */
export interface MindUsage {
  /** Whether a call for the player would be within the limits now. */
  mayThink(ownerId: string, limits: MindLimits): Promise<boolean>;
  /**
   * Records `held` against the player when a call is within the limits,
   * checking and recording as one step so that calls made together cannot
   * pass a limit. Answers the reservation, or undefined when past a limit.
   */
  reserve(
    ownerId: string,
    limits: MindLimits,
    held: MindCall,
  ): Promise<string | undefined>;
  /** Replaces what a reservation holds with what the call used. */
  settle(reservation: string, call: MindCall): Promise<void>;
  /** Forgets a reservation for a call Claude never answered. */
  release(reservation: string): Promise<void>;
}

// Arbitrary, but fixed: every process reserving calls must agree on it.
const mindReservationLockKey = 0x6d696e64;

// $1 the player, $2 their daily calls, $3 the monthly cap in microdollars.
const withinLimits = `
  (SELECT count(*) FROM mind_calls
   WHERE owner_id = $1 AND called_at >= date_trunc('day', now(), 'UTC')) < $2
  AND (SELECT coalesce(sum(cost_microdollars), 0) FROM mind_calls
   WHERE called_at >= date_trunc('month', now(), 'UTC')) < $3`;

function limitParams(ownerId: string, limits: MindLimits) {
  return [ownerId, limits.dailyCalls, limits.monthlySpendUsd * 1_000_000];
}

export class PgMindUsage implements MindUsage {
  constructor(private readonly pool: pg.Pool) {}

  async mayThink(ownerId: string, limits: MindLimits): Promise<boolean> {
    const { rows } = await this.pool.query<{ available: boolean }>(
      `SELECT ${withinLimits} AS available`,
      limitParams(ownerId, limits),
    );
    return rows[0]!.available;
  }

  async reserve(
    ownerId: string,
    limits: MindLimits,
    held: MindCall,
  ): Promise<string | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // The monthly cap is shared by every player, so every reservation
      // waits its turn; each is two indexed reads and a write.
      await client.query('SELECT pg_advisory_xact_lock($1)', [
        mindReservationLockKey,
      ]);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO mind_calls
           (owner_id, model, input_tokens, output_tokens, cost_microdollars)
         SELECT $1, $4, $5, $6, $7 WHERE ${withinLimits}
         RETURNING id`,
        [
          ...limitParams(ownerId, limits),
          held.model,
          held.inputTokens,
          held.outputTokens,
          held.costMicrodollars,
        ],
      );
      await client.query('COMMIT');
      return rows[0]?.id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async settle(reservation: string, call: MindCall): Promise<void> {
    await this.pool.query(
      `UPDATE mind_calls
       SET model = $2, input_tokens = $3, output_tokens = $4,
           cost_microdollars = $5
       WHERE id = $1`,
      [
        reservation,
        call.model,
        call.inputTokens,
        call.outputTokens,
        call.costMicrodollars,
      ],
    );
  }

  async release(reservation: string): Promise<void> {
    await this.pool.query('DELETE FROM mind_calls WHERE id = $1', [
      reservation,
    ]);
  }
}

export interface MindOptions {
  mind: Mind;
  usage: MindUsage;
  limits: MindLimits;
}

/** Long enough for any prompt the game builds, with room to spare. */
export const maxPromptLength = 32_000;

interface MindRequest {
  prompt: string;
  modelTier: ModelTier;
}

function isMindRequest(body: unknown): body is MindRequest {
  if (typeof body !== 'object' || body === null) return false;
  const { prompt, modelTier } = body as Record<string, unknown>;
  return (
    typeof prompt === 'string' &&
    prompt.length > 0 &&
    prompt.length <= maxPromptLength &&
    isModelTier(modelTier)
  );
}

// The code claude.ai's `sample` rejects with when it is not allowed; the game
// answers it by thinking without Claude until it is reloaded.
function notGranted(reply: FastifyReply, status: number, error: string) {
  return reply.code(status).send({ error, code: 'not_granted' });
}

/**
 * `GET /api/mind` says whether the player's Kith may think with Claude now;
 * `POST /api/mind` takes `{ prompt, modelTier }`, asks Claude and answers the
 * JSON object it replied with. Each player has a daily call limit and all of
 * them share a monthly spend cap; a call past either, or one Claude fails,
 * answers `not_granted`. Calls are logged and recorded without their text.
 */
export const mindApi = fp<MindOptions>(async (app, { mind, usage, limits }) => {
  // auth answers 401 to /api/ requests without a session, so userId is set.
  app.get('/api/mind', async (request) => ({
    available: await usage.mayThink(request.userId!, limits),
  }));

  app.post('/api/mind', async (request, reply) => {
    if (!isMindRequest(request.body)) {
      return reply.code(400).send({
        error: `Expected { prompt, modelTier: "quick" } with a prompt of at most ${maxPromptLength} characters`,
      });
    }
    const { prompt } = request.body;
    const ownerId = request.userId!;
    const reservation = await usage.reserve(
      ownerId,
      limits,
      mostACallUses(prompt, mind.model),
    );
    if (reservation === undefined) {
      return notGranted(
        reply,
        429,
        'The mind has done enough thinking for now',
      );
    }
    let thought: Thought;
    try {
      thought = await mind.think(prompt);
    } catch (err) {
      await usage.release(reservation);
      request.log.warn({ err, ownerId }, 'Claude did not answer');
      return notGranted(reply, 502, 'Claude did not answer');
    }
    await usage.settle(reservation, thought.call);
    request.log.info({ ownerId, ...thought.call }, 'mind call');
    const json = parseReply(thought.text);
    if (json === undefined) {
      request.log.warn({ ownerId }, 'Claude replied without JSON');
      return reply
        .code(502)
        .send({ error: 'Claude replied without JSON', code: 'bad_reply' });
    }
    return json;
  });
});
