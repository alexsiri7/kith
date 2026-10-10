import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { sessionCookie } from './auth.js';
import type { PrototypeWorldStore } from './prototype-worlds.js';
import { buildServer } from './index.js';
import { migrateDatabase } from './migrations.js';
import {
  defaultModel,
  maxPromptLength,
  parseReply,
  PgMindUsage,
  requestyChatUrl,
  requestyMind,
  type Mind,
  type MindCall,
  type MindLimits,
  type MindUsage,
  type Thought,
} from './mind.js';
import { PgUserStore } from './users.js';

const appOrigin = 'https://kith.example';
const day = 24 * 60 * 60 * 1000;
const prompt = 'You are the mind of Pip. Respond with JSON only: {"say":"..."}';

const noWorlds: PrototypeWorldStore = {
  load: () => Promise.reject(new Error('no worlds here')),
  save: () => Promise.reject(new Error('no worlds here')),
  erase: () => Promise.reject(new Error('no worlds here')),
};

const call: MindCall = {
  model: defaultModel,
  inputTokens: 120,
  outputTokens: 30,
  costMicrodollars: 270,
};

class MemoryMindUsage implements MindUsage {
  private readonly recorded = new Map<
    string,
    { ownerId: string; call: MindCall }
  >();
  private reservations = 0;

  /** Every call recorded, settled or not. */
  get calls() {
    return [...this.recorded.values()];
  }

  // Synchronous, so no other call can be reserved between its check and write.
  private within(ownerId: string, limits: MindLimits): boolean {
    const calls = this.calls.filter((c) => c.ownerId === ownerId).length;
    const spend = this.calls.reduce(
      (sum, c) => sum + c.call.costMicrodollars,
      0,
    );
    return (
      calls < limits.dailyCalls && spend < limits.monthlySpendUsd * 1_000_000
    );
  }

  async mayThink(ownerId: string, limits: MindLimits): Promise<boolean> {
    return this.within(ownerId, limits);
  }

  async reserve(
    ownerId: string,
    limits: MindLimits,
    held: MindCall,
  ): Promise<string | undefined> {
    if (!this.within(ownerId, limits)) return undefined;
    const reservation = String(++this.reservations);
    this.recorded.set(reservation, { ownerId, call: held });
    return reservation;
  }

  async settle(reservation: string, call: MindCall): Promise<void> {
    this.recorded.get(reservation)!.call = call;
  }

  async release(reservation: string): Promise<void> {
    this.recorded.delete(reservation);
  }
}

describe('/api/mind', () => {
  let app: FastifyInstance;
  let usage: MemoryMindUsage;
  let asked: string[];
  let think: (prompt: string) => Promise<Thought>;
  let logs: string;

  async function build(limits: Partial<MindLimits> = {}): Promise<void> {
    usage = new MemoryMindUsage();
    asked = [];
    think = async () => ({ text: '{"say":"hi!"}', call });
    logs = '';
    const mind: Mind = {
      model: defaultModel,
      think: (prompt) => {
        asked.push(prompt);
        return think(prompt);
      },
    };
    app = buildServer({
      checkDatabase: async () => undefined,
      logger: {
        stream: new Writable({
          write(chunk, _encoding, done) {
            logs += String(chunk);
            done();
          },
        }),
      },
      auth: {
        appOrigin,
        sessionSecret: 's'.repeat(32),
        google: {
          authorizationUrl: () => 'https://google.test/auth',
          identify: () => Promise.reject(new Error('not signing in here')),
        },
        users: { signIn: () => Promise.reject(new Error('no users here')) },
      },
      worlds: noWorlds,
      mind: {
        mind,
        usage,
        limits: { dailyCalls: 300, monthlySpendUsd: 20, ...limits },
      },
    });
    await app.ready();
  }

  afterEach(async () => {
    await app?.close();
  });

  function player(userId = randomUUID()) {
    const cookies = {
      [sessionCookie]: app.signCookie(`${userId}:${Date.now() + day}`),
    };
    return {
      userId,
      available: () => app.inject({ method: 'GET', url: '/api/mind', cookies }),
      ask: (payload: unknown = { prompt, modelTier: 'quick' }) =>
        app.inject({
          method: 'POST',
          url: '/api/mind',
          cookies,
          headers: { origin: appOrigin },
          payload: payload as object,
        }),
    };
  }

  it('answers 401 without a session and never asks Claude', async () => {
    await build();
    const available = await app.inject({ method: 'GET', url: '/api/mind' });
    expect(available.statusCode).toBe(401);
    const ask = await app.inject({
      method: 'POST',
      url: '/api/mind',
      headers: { origin: appOrigin },
      payload: { prompt, modelTier: 'quick' },
    });
    expect(ask.statusCode).toBe(401);
    expect(asked).toEqual([]);
  });

  it('refuses a request from another origin', async () => {
    await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mind',
      cookies: {
        [sessionCookie]: app.signCookie(`${randomUUID()}:${Date.now() + day}`),
      },
      headers: { origin: 'https://elsewhere.example' },
      payload: { prompt, modelTier: 'quick' },
    });
    expect(res.statusCode).toBe(403);
    expect(asked).toEqual([]);
  });

  it("answers Claude's JSON and records the call against the player", async () => {
    await build();
    const pip = player();
    expect((await pip.available()).json()).toEqual({ available: true });

    const res = await pip.ask();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ say: 'hi!' });
    expect(asked).toEqual([prompt]);
    expect(usage.calls).toEqual([{ ownerId: pip.userId, call }]);
  });

  it("holds the call under the mind's model until Claude answers", async () => {
    await build();
    let held: MindCall | undefined;
    think = async () => {
      held = usage.calls[0]!.call;
      return { text: '{"say":"hi!"}', call };
    };
    await player().ask();
    expect(held).toMatchObject({
      model: defaultModel,
      outputTokens: 1024,
    });
    expect(held!.costMicrodollars).toBeGreaterThan(call.costMicrodollars);
  });

  it('logs the tokens of each call but never the prompt or the reply', async () => {
    await build();
    const pip = player();
    await pip.ask();

    const line = logs
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((l) => l.msg === 'mind call');
    expect(line).toMatchObject({ ownerId: pip.userId, ...call });
    expect(logs).not.toContain('mind of Pip');
    expect(logs).not.toContain('hi!');
  });

  for (const [name, payload] of [
    ['no prompt', { modelTier: 'quick' }],
    ['an empty prompt', { prompt: '', modelTier: 'quick' }],
    ['a prompt that is not text', { prompt: 3, modelTier: 'quick' }],
    [
      'a prompt that is too long',
      { prompt: 'a'.repeat(maxPromptLength + 1), modelTier: 'quick' },
    ],
    ['no model tier', { prompt }],
    ['an unknown model tier', { prompt, modelTier: 'deep' }],
    ['an inherited property as the tier', { prompt, modelTier: 'toString' }],
  ] as const) {
    it(`answers 400 to ${name}`, async () => {
      await build();
      const res = await player().ask(payload);
      expect(res.statusCode).toBe(400);
      expect(asked).toEqual([]);
    });
  }

  it("refuses with not_granted once the player's daily calls are used", async () => {
    await build({ dailyCalls: 2 });
    const pip = player();
    expect((await pip.ask()).statusCode).toBe(200);
    expect((await pip.ask()).statusCode).toBe(200);

    const refused = await pip.ask();
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ code: 'not_granted' });
    expect((await pip.available()).json()).toEqual({ available: false });
    expect(asked).toHaveLength(2);

    const tam = player();
    expect((await tam.available()).json()).toEqual({ available: true });
    expect((await tam.ask()).statusCode).toBe(200);
  });

  /** Asks for each player at once, with Claude answering only once all have
   * been let through or one has been refused. */
  async function askTogether(players: ReturnType<typeof player>[]) {
    let answer!: () => void;
    const claudeAnswers = new Promise<void>((resolve) => (answer = resolve));
    think = async () => {
      await claudeAnswers;
      return { text: '{"say":"hi!"}', call };
    };
    const asking = players.map((p) => p.ask());
    await Promise.race([
      ...asking,
      vi.waitFor(() => expect(asked).toHaveLength(players.length)),
    ]);
    answer();
    const answers = await Promise.all(asking);
    return answers.map((a) => a.statusCode).sort();
  }

  it('lets only one of two calls made together past a daily limit of one', async () => {
    await build({ dailyCalls: 1 });
    const pip = player();
    expect(await askTogether([pip, pip])).toEqual([200, 429]);
    expect(asked).toHaveLength(1);
    expect(usage.calls).toEqual([{ ownerId: pip.userId, call }]);
  });

  it('holds the most a call could cost against the monthly spend until Claude answers', async () => {
    // Far more than a call costs, far less than the most it could.
    await build({ monthlySpendUsd: 0.001 });
    expect(await askTogether([player(), player()])).toEqual([200, 429]);
    expect(asked).toHaveLength(1);
    expect(usage.calls.map((c) => c.call)).toEqual([call]);
  });

  it('is off for everyone when the daily limit is 0', async () => {
    await build({ dailyCalls: 0 });
    const pip = player();
    expect((await pip.available()).json()).toEqual({ available: false });
    expect((await pip.ask()).json()).toMatchObject({ code: 'not_granted' });
    expect(asked).toEqual([]);
  });

  it('refuses every player with not_granted once the monthly spend is reached', async () => {
    // Two calls cost 540 microdollars, past a cap of 500.
    await build({ monthlySpendUsd: 0.0005 });
    expect((await player().ask()).statusCode).toBe(200);
    expect((await player().ask()).statusCode).toBe(200);

    const refused = await player().ask();
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ code: 'not_granted' });
    expect((await player().available()).json()).toEqual({ available: false });
    expect(asked).toHaveLength(2);
  });

  it('answers not_granted when Claude fails, and records nothing', async () => {
    await build();
    think = () => Promise.reject(new Error('Requesty answered 529'));
    const res = await player().ask();
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'not_granted' });
    expect(usage.calls).toEqual([]);
    expect(logs).toContain('Requesty answered 529');
    expect(logs).not.toContain('mind of Pip');
  });

  it('answers bad_reply when Claude replies without JSON, and still records the call', async () => {
    await build();
    think = async () => ({ text: 'I would rather not.', call });
    const res = await player().ask();
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'bad_reply' });
    expect(usage.calls.map((c) => c.call)).toEqual([call]);
    expect(logs).toContain('Claude replied without JSON');
    expect(logs).not.toContain('I would rather not.');
  });
});

describe('parseReply', () => {
  it('reads a JSON object', () => {
    expect(parseReply('{"say":"hi"}')).toEqual({ say: 'hi' });
  });

  it('reads the object out of a code fence or prose', () => {
    expect(parseReply('```json\n{"say":"hi"}\n```')).toEqual({ say: 'hi' });
    expect(parseReply('Here you go: {"say":"{hi}"} Enjoy!')).toEqual({
      say: '{hi}',
    });
  });

  for (const text of ['', 'no', '["hi"]', '{"say":', '} {']) {
    it(`finds no object in ${JSON.stringify(text)}`, () => {
      expect(parseReply(text)).toBeUndefined();
    });
  }
});

describe('requestyMind', () => {
  function fakeRequesty(status: number, body: unknown) {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetch: typeof globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return new Response(JSON.stringify(body), { status });
    };
    return { requests, fetch };
  }

  const model = 'anthropic/claude-haiku-4-5-20251001';
  const reply = (usage: Record<string, unknown>) => ({
    choices: [{ message: { role: 'assistant', content: '{"say":1}' } }],
    usage,
  });

  it("asks the model with the server's key and prices the call at list price", async () => {
    const requesty = fakeRequesty(
      200,
      reply({ prompt_tokens: 1000, completion_tokens: 200 }),
    );
    const mind = requestyMind({
      apiKey: 'rq-test',
      model,
      fetch: requesty.fetch,
    });

    expect(mind.model).toBe(model);
    expect(await mind.think(prompt)).toEqual({
      text: '{"say":1}',
      call: {
        model,
        inputTokens: 1000,
        outputTokens: 200,
        costMicrodollars: 2000,
      },
    });
    const [request] = requesty.requests;
    expect(request!.url).toBe(requestyChatUrl);
    expect(request!.init.headers).toMatchObject({
      authorization: 'Bearer rq-test',
    });
    expect(JSON.parse(String(request!.init.body))).toMatchObject({
      model,
      messages: [
        { role: 'system', content: expect.any(String) },
        { role: 'user', content: prompt },
      ],
    });
  });

  it('prefers the cost Requesty reports', async () => {
    const requesty = fakeRequesty(
      200,
      reply({ prompt_tokens: 1000, completion_tokens: 200, cost: 0.00516 }),
    );
    const mind = requestyMind({
      apiKey: 'rq-test',
      model,
      fetch: requesty.fetch,
    });
    expect((await mind.think(prompt)).call.costMicrodollars).toBe(5160);
  });

  it('rejects when Requesty answers an error', async () => {
    const requesty = fakeRequesty(401, { error: { message: 'bad key' } });
    const mind = requestyMind({
      apiKey: 'rq-test',
      model,
      fetch: requesty.fetch,
    });
    await expect(mind.think(prompt)).rejects.toThrow('Requesty answered 401');
  });

  it('rejects a reply without usage', async () => {
    const requesty = fakeRequesty(200, {
      choices: [{ message: { content: '{}' } }],
    });
    const mind = requestyMind({
      apiKey: 'rq-test',
      model,
      fetch: requesty.fetch,
    });
    await expect(mind.think(prompt)).rejects.toThrow(
      'Requesty reply has no usage.prompt_tokens',
    );
  });

  it('rejects a reply without a message', async () => {
    const requesty = fakeRequesty(200, {
      choices: [],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    const mind = requestyMind({
      apiKey: 'rq-test',
      model,
      fetch: requesty.fetch,
    });
    await expect(mind.think(prompt)).rejects.toThrow(
      'Requesty reply has no message content',
    );
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined && process.env.CI !== undefined) {
  throw new Error('TEST_DATABASE_URL must be set in CI');
}

describe.skipIf(databaseUrl === undefined)('PgMindUsage', () => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let users: PgUserStore;
  let usage: PgMindUsage;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    await migrateDatabase(pool);
    users = new PgUserStore(pool);
    usage = new PgMindUsage(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  const newPlayer = () =>
    users.signIn({
      subject: randomUUID(),
      email: 'player@kith.example',
      displayName: 'Player',
    });

  const limits: MindLimits = { dailyCalls: 2, monthlySpendUsd: 1_000_000 };

  async function recordAt(ownerId: string, calledAt: string, cost: number) {
    await pool.query(
      `INSERT INTO mind_calls
         (owner_id, called_at, model, input_tokens, output_tokens, cost_microdollars)
       VALUES ($1, ${calledAt}, 'model', 1, 1, $2)`,
      [ownerId, cost],
    );
  }

  async function costs(ownerId: string): Promise<number[]> {
    const { rows } = await pool.query<{ cost: string }>(
      `SELECT cost_microdollars AS cost FROM mind_calls
       WHERE owner_id = $1 ORDER BY id`,
      [ownerId],
    );
    return rows.map((r) => Number(r.cost));
  }

  it("counts the player's calls since midnight UTC against the daily limit", async () => {
    const pip = await newPlayer();
    const tam = await newPlayer();
    await recordAt(
      pip,
      `date_trunc('day', now(), 'UTC') - interval '1 second'`,
      0,
    );
    expect(await usage.mayThink(pip, limits)).toBe(true);

    expect(await usage.reserve(pip, limits, call)).toBeDefined();
    expect(await usage.reserve(pip, limits, call)).toBeDefined();
    expect(await usage.mayThink(pip, limits)).toBe(false);
    expect(await usage.reserve(pip, limits, call)).toBeUndefined();

    expect(await usage.mayThink(tam, limits)).toBe(true);
    expect(await usage.reserve(tam, limits, call)).toBeDefined();
  });

  it("measures every player's spend since the 1st of the month UTC against the cap", async () => {
    const pip = await newPlayer();
    const tam = await newPlayer();
    await recordAt(
      pip,
      `date_trunc('month', now(), 'UTC') - interval '1 second'`,
      1_000_000_000_000,
    );
    const { rows } = await pool.query<{ spend: string }>(
      `SELECT coalesce(sum(cost_microdollars), 0) AS spend FROM mind_calls
       WHERE called_at >= date_trunc('month', now(), 'UTC')`,
    );
    const capped = {
      dailyCalls: 300,
      monthlySpendUsd: (Number(rows[0]!.spend) + 1) / 1_000_000,
    };
    expect(await usage.mayThink(tam, capped)).toBe(true);

    expect(await usage.reserve(pip, capped, call)).toBeDefined();
    expect(await usage.mayThink(tam, capped)).toBe(false);
    expect(await usage.reserve(tam, capped, call)).toBeUndefined();
  });

  it('settles a reservation with what the call used, or releases it', async () => {
    const pip = await newPlayer();
    const held = { ...call, costMicrodollars: 9_000 };
    const settled = (await usage.reserve(pip, limits, held))!;
    const released = (await usage.reserve(pip, limits, held))!;
    expect(await costs(pip)).toEqual([9_000, 9_000]);

    await usage.settle(settled, call);
    await usage.release(released);
    expect(await costs(pip)).toEqual([call.costMicrodollars]);
    expect(await usage.mayThink(pip, limits)).toBe(true);
  });

  it('reserves no more calls than the limit when asked at once', async () => {
    const pip = await newPlayer();
    const reservations = await Promise.all(
      Array.from({ length: 6 }, () => usage.reserve(pip, limits, call)),
    );
    expect(reservations.filter((r) => r !== undefined)).toHaveLength(
      limits.dailyCalls,
    );
    expect(await costs(pip)).toHaveLength(limits.dailyCalls);
  });
});
