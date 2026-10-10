import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sessionCookie } from './auth.js';
import type { PrototypeWorldStore } from './prototype-worlds.js';
import { buildServer } from './index.js';
import { migrateDatabase } from './migrations.js';
import {
  anthropicMessagesUrl,
  anthropicMind,
  maxPromptLength,
  parseReply,
  PgMindUsage,
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
  model: 'claude-haiku-4-5-20251001',
  inputTokens: 120,
  outputTokens: 30,
  costMicrodollars: 270,
};

class MemoryMindUsage implements MindUsage {
  readonly calls: { ownerId: string; call: MindCall }[] = [];

  async callsToday(ownerId: string): Promise<number> {
    return this.calls.filter((c) => c.ownerId === ownerId).length;
  }

  async spendThisMonthMicrodollars(): Promise<number> {
    return this.calls.reduce((sum, c) => sum + c.call.costMicrodollars, 0);
  }

  async record(ownerId: string, call: MindCall): Promise<void> {
    this.calls.push({ ownerId, call });
  }
}

describe('/api/mind', () => {
  let app: FastifyInstance;
  let usage: MemoryMindUsage;
  let asked: { prompt: string; tier: string }[];
  let think: (prompt: string) => Promise<Thought>;
  let logs: string;

  async function build(limits: Partial<MindLimits> = {}): Promise<void> {
    usage = new MemoryMindUsage();
    asked = [];
    think = async () => ({ text: '{"say":"hi!"}', call });
    logs = '';
    const mind: Mind = {
      think: (prompt, tier) => {
        asked.push({ prompt, tier });
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
    expect(asked).toEqual([{ prompt, tier: 'quick' }]);
    expect(usage.calls).toEqual([{ ownerId: pip.userId, call }]);
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
    think = () => Promise.reject(new Error('Anthropic answered 529'));
    const res = await player().ask();
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'not_granted' });
    expect(usage.calls).toEqual([]);
    expect(logs).toContain('Anthropic answered 529');
    expect(logs).not.toContain('mind of Pip');
  });

  it('answers bad_reply when Claude replies without JSON, and still records the call', async () => {
    await build();
    think = async () => ({ text: 'I would rather not.', call });
    const res = await player().ask();
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'bad_reply' });
    expect(usage.calls).toHaveLength(1);
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

describe('anthropicMind', () => {
  function fakeAnthropic(status: number, body: unknown) {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetch: typeof globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init: init! });
      return new Response(JSON.stringify(body), { status });
    };
    return { requests, fetch };
  }

  it("asks the quick tier's model with the server's key and prices the call", async () => {
    const anthropic = fakeAnthropic(200, {
      content: [
        { type: 'text', text: '{"say":' },
        { type: 'text', text: '1}' },
      ],
      usage: { input_tokens: 1000, output_tokens: 200 },
    });
    const mind = anthropicMind({ apiKey: 'sk-test', fetch: anthropic.fetch });

    expect(await mind.think(prompt, 'quick')).toEqual({
      text: '{"say":1}',
      call: {
        model: 'claude-haiku-4-5-20251001',
        inputTokens: 1000,
        outputTokens: 200,
        costMicrodollars: 2000,
      },
    });
    const [request] = anthropic.requests;
    expect(request!.url).toBe(anthropicMessagesUrl);
    expect(request!.init.headers).toMatchObject({ 'x-api-key': 'sk-test' });
    expect(JSON.parse(String(request!.init.body))).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      messages: [{ role: 'user', content: prompt }],
    });
  });

  it('rejects when Anthropic answers an error', async () => {
    const anthropic = fakeAnthropic(401, { type: 'error' });
    const mind = anthropicMind({ apiKey: 'sk-test', fetch: anthropic.fetch });
    await expect(mind.think(prompt, 'quick')).rejects.toThrow(
      'Anthropic answered 401',
    );
  });

  it('rejects a reply without usage', async () => {
    const anthropic = fakeAnthropic(200, {
      content: [{ type: 'text', text: '{}' }],
    });
    const mind = anthropicMind({ apiKey: 'sk-test', fetch: anthropic.fetch });
    await expect(mind.think(prompt, 'quick')).rejects.toThrow(
      'Anthropic reply has no usage.input_tokens',
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

  async function recordAt(ownerId: string, calledAt: string, cost: number) {
    await pool.query(
      `INSERT INTO mind_calls
         (owner_id, called_at, model, input_tokens, output_tokens, cost_microdollars)
       VALUES ($1, ${calledAt}, 'model', 1, 1, $2)`,
      [ownerId, cost],
    );
  }

  it("counts the player's calls since midnight UTC", async () => {
    const pip = await newPlayer();
    const tam = await newPlayer();
    expect(await usage.callsToday(pip)).toBe(0);

    await usage.record(pip, call);
    await usage.record(pip, call);
    await usage.record(tam, call);
    await recordAt(
      pip,
      `date_trunc('day', now(), 'UTC') - interval '1 second'`,
      0,
    );

    expect(await usage.callsToday(pip)).toBe(2);
    expect(await usage.callsToday(tam)).toBe(1);
  });

  it("adds up every player's spend since the 1st of the month UTC", async () => {
    const before = await usage.spendThisMonthMicrodollars();
    const pip = await newPlayer();
    const tam = await newPlayer();

    await usage.record(pip, call);
    await usage.record(tam, { ...call, costMicrodollars: 1_000_000 });
    await recordAt(
      pip,
      `date_trunc('month', now(), 'UTC') - interval '1 second'`,
      5_000_000,
    );

    expect(await usage.spendThisMonthMicrodollars()).toBe(
      before + call.costMicrodollars + 1_000_000,
    );
  });
});
