import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessionCookie } from './auth.js';
import { buildServer } from './index.js';
import { migrateDatabase } from './migrations.js';
import { defaultModel, type MindOptions } from './mind.js';
import {
  PgPrototypeWorldStore,
  type PrototypeState,
} from './prototype-worlds.js';
import { PgUserStore } from './users.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined && process.env.CI !== undefined) {
  throw new Error('TEST_DATABASE_URL must be set in CI');
}

const appOrigin = 'https://kith.example';
const day = 24 * 60 * 60 * 1000;

const noMind: MindOptions = {
  mind: {
    model: defaultModel,
    think: () => Promise.reject(new Error('no mind here')),
  },
  usage: {
    mayThink: () => Promise.reject(new Error('no mind here')),
    reserve: () => Promise.reject(new Error('no mind here')),
    settle: () => Promise.reject(new Error('no mind here')),
    release: () => Promise.reject(new Error('no mind here')),
  },
  limits: { dailyCalls: 0, monthlySpendUsd: 0 },
};
const savedWorld: PrototypeState = JSON.parse(
  readFileSync(
    new URL('../../content/src/prototype-v22.fixture.json', import.meta.url),
    'utf8',
  ),
);

describe.skipIf(databaseUrl === undefined)('/api/world', () => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  let app: FastifyInstance;
  let users: PgUserStore;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
    });
    await migrateDatabase(pool);
    users = new PgUserStore(pool);
    app = buildServer({
      checkDatabase: async () => undefined,
      logger: false,
      auth: {
        appOrigin,
        sessionSecret: 's'.repeat(32),
        google: {
          authorizationUrl: () => 'https://google.test/auth',
          identify: () => Promise.reject(new Error('not signing in here')),
        },
        users,
      },
      worlds: new PgPrototypeWorldStore(pool),
      mind: noMind,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  /** Signs in a new player and returns requests made as them. */
  async function newPlayer() {
    const userId = await users.signIn({
      subject: randomUUID(),
      email: 'player@kith.example',
      displayName: 'Player',
    });
    const cookies = {
      [sessionCookie]: app.signCookie(`${userId}:${Date.now() + day}`),
    };
    return {
      get: () => app.inject({ method: 'GET', url: '/api/world', cookies }),
      put: (payload: unknown) =>
        app.inject({
          method: 'PUT',
          url: '/api/world',
          cookies,
          headers: { origin: appOrigin },
          payload: payload as object,
        }),
      erase: () =>
        app.inject({
          method: 'DELETE',
          url: '/api/world',
          cookies,
          headers: { origin: appOrigin },
        }),
    };
  }

  const withCoins = (coins: number) => ({ ...savedWorld, coins });

  it('answers 401 without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/world' });
    expect(res.statusCode).toBe(401);
  });

  it('answers 404 to a new player', async () => {
    const player = await newPlayer();
    const res = await player.get();
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'No world yet', version: 0 });
  });

  it('loads a saved world exactly as it was saved', async () => {
    const player = await newPlayer();
    const first = await player.put({ state: savedWorld, version: 0 });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ version: 1 });

    const loaded = await player.get();
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json()).toEqual({ state: savedWorld, version: 1 });

    const second = await player.put({ state: withCoins(1), version: 1 });
    expect(second.json()).toEqual({ version: 2 });
    expect((await player.get()).json()).toEqual({
      state: withCoins(1),
      version: 2,
    });
  });

  it('refuses a save based on an older version and returns the stored world', async () => {
    const player = await newPlayer();
    await player.put({ state: withCoins(1), version: 0 });
    await player.put({ state: withCoins(2), version: 1 });

    const stale = await player.put({ state: withCoins(3), version: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ state: withCoins(2), version: 2 });

    const first = await player.put({ state: withCoins(4), version: 0 });
    expect(first.statusCode).toBe(409);
    expect(first.json()).toEqual({ state: withCoins(2), version: 2 });

    expect((await player.get()).json()).toEqual({
      state: withCoins(2),
      version: 2,
    });
  });

  it("never reads or writes another player's world", async () => {
    const alex = await newPlayer();
    const sam = await newPlayer();
    await alex.put({ state: withCoins(1), version: 0 });
    await alex.put({ state: withCoins(2), version: 1 });
    const alexWorld = { state: withCoins(2), version: 2 };

    expect((await sam.get()).statusCode).toBe(404);

    const atAlexVersion = await sam.put({ state: withCoins(9), version: 2 });
    expect(atAlexVersion.statusCode).toBe(409);
    expect(atAlexVersion.json()).toEqual({ state: null, version: 0 });

    expect((await sam.put({ state: withCoins(9), version: 0 })).json()).toEqual(
      { version: 1 },
    );
    expect((await sam.erase()).statusCode).toBe(204);
    expect((await alex.get()).json()).toEqual(alexWorld);
  });

  it('accepts a save up to 2 MiB and refuses a larger one', async () => {
    const player = await newPlayer();
    const big = { ...savedWorld, padding: 'x'.repeat(1.5 * 1024 * 1024) };
    expect((await player.put({ state: big, version: 0 })).statusCode).toBe(200);

    const tooBig = { ...savedWorld, padding: 'x'.repeat(2 * 1024 * 1024) };
    const res = await player.put({ state: tooBig, version: 1 });
    expect(res.statusCode).toBe(413);
    expect((await player.get()).json()).toEqual({ state: big, version: 1 });
  });

  it.each([
    ['without a state', { version: 0 }],
    ['with a list as the state', { state: [], version: 0 }],
    ['with a state that has no Kith', { state: { simTime: 0 }, version: 0 }],
    [
      'with a Kith missing its fields',
      { state: { ...savedWorld, kith: [{}] }, version: 0 },
    ],
    [
      'with a state that only has Kith and a time',
      { state: { kith: [], simTime: 0 }, version: 0 },
    ],
    ['with a negative version', { state: savedWorld, version: -1 }],
    ['with a fractional version', { state: savedWorld, version: 1.5 }],
    ['with a version given as text', { state: savedWorld, version: '0' }],
  ])('refuses a save %s', async (_case, body) => {
    const player = await newPlayer();
    const res = await player.put(body);
    expect(res.statusCode).toBe(400);
    expect((await player.get()).statusCode).toBe(404);
  });

  it('starts over without letting the old world come back', async () => {
    const player = await newPlayer();
    await player.put({ state: withCoins(1), version: 0 });

    expect((await player.erase()).statusCode).toBe(204);
    const erased = await player.get();
    expect(erased.statusCode).toBe(404);
    expect(erased.json()).toEqual({ error: 'No world yet', version: 2 });

    const stale = await player.put({ state: withCoins(1), version: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ state: null, version: 2 });

    const fresh = await player.put({ state: withCoins(5), version: 2 });
    expect(fresh.json()).toEqual({ version: 3 });
  });
});
