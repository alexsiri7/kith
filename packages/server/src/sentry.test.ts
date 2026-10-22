import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as Sentry from '@sentry/node';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionCookie } from './auth.js';
import { buildServer } from './index.js';
import { defaultModel } from './mind.js';
import { startSentry } from './sentry.js';

interface SentEvent {
  environment?: string;
  release?: string;
  exception?: { values?: { value?: string }[] };
  request?: {
    url?: string;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    headers?: Record<string, string>;
  };
  user?: { ip_address?: string };
}

const failing = (what: string) => () => Promise.reject(new Error(what));

/** The real app, with every store failing with a message naming the call. */
function kith(overrides: { signIn?: () => Promise<string> } = {}) {
  return buildServer({
    checkDatabase: failing('checkDatabase'),
    logger: false,
    auth: {
      appOrigin: 'https://kith.example',
      sessionSecret: 's'.repeat(32),
      google: {
        authorizationUrl: () => 'https://google.test/auth',
        identify: () =>
          Promise.resolve({
            subject: 'google-subject',
            email: 'player@kith.example',
            displayName: 'Player',
          }),
      },
      users: { signIn: overrides.signIn ?? failing('signIn') },
    },
    worlds: {
      load: failing('worlds.load failed'),
      save: failing('worlds.save failed'),
      erase: failing('worlds.erase failed'),
    },
    mind: {
      mind: { model: defaultModel, think: failing('think') },
      usage: {
        mayThink: failing('mayThink'),
        reserve: failing('reserve'),
        settle: failing('settle'),
        release: failing('release'),
      },
      limits: { dailyCalls: 0, monthlySpendUsd: 0 },
    },
  });
}

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('startSentry', () => {
  // Stands in for sentry.io, collecting the events sent to its DSN.
  let ingest: Server;
  let dsn: string;
  const events: SentEvent[] = [];
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    ingest = createServer((request, response) => {
      let envelope = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => (envelope += chunk));
      request.on('end', () => {
        const [, itemHeader, item] = envelope.split('\n');
        if ((JSON.parse(itemHeader!) as { type: string }).type === 'event') {
          events.push(JSON.parse(item!) as SentEvent);
        }
        response.end();
      });
    });
    await new Promise<void>((resolve) => ingest.listen(0, resolve));
    const { port } = ingest.address() as AddressInfo;
    dsn = `http://public@127.0.0.1:${port}/1`;
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await Sentry.close();
    await new Promise((resolve) => ingest.close(resolve));
    events.length = 0;
  });

  it('does nothing when SENTRY_DSN is unset', () => {
    startSentry(undefined, {});
    startSentry('', {});

    expect(Sentry.isInitialized()).toBe(false);
  });

  it('reports a route error without its cookies or body', async () => {
    startSentry(dsn, {
      RAILWAY_ENVIRONMENT_NAME: 'production',
      RAILWAY_GIT_COMMIT_SHA: 'abc123',
    });
    const app = Fastify();
    app.post('/boom', () => {
      throw new Error('deliberate failure');
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/boom`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer player-token',
          cookie: 'kith_session=player-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ world: 'player-world' }),
      });
      expect(response.status).toBe(500);
      await Sentry.flush(2000);
    } finally {
      await app.close();
    }

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event!.exception?.values?.[0]?.value).toBe('deliberate failure');
    expect(event!.environment).toBe('production');
    expect(event!.release).toBe('abc123');
    expect(event!.request?.headers).toBeDefined();
    const sent = JSON.stringify(event);
    expect(sent).not.toContain('player-token');
    expect(sent).not.toContain('player-session');
    expect(sent).not.toContain('player-world');
    expect(event!.request?.cookies).toBeUndefined();
    expect(event!.request?.data).toBeUndefined();
    expect(event!.user?.ip_address).toBeUndefined();
  });

  it('reports an error thrown by an onRequest hook', async () => {
    startSentry(dsn, {});
    app = Fastify();
    app.addHook('onRequest', async () => {
      throw new Error('hook failure');
    });
    app.get('/hooked', () => 'unreachable');
    const base = await listen(app);

    expect((await fetch(`${base}/hooked`)).status).toBe(500);
    await Sentry.flush(2000);

    expect(events).toHaveLength(1);
    expect(events[0]!.exception?.values?.[0]?.value).toBe('hook failure');
  });

  it('reports an error thrown inside the real app without the session', async () => {
    startSentry(dsn, {});
    app = kith();
    const base = await listen(app);
    const session = app.signCookie(`player-id:${Date.now() + 60_000}`);

    const response = await fetch(`${base}/api/world`, {
      headers: { cookie: `${sessionCookie}=${session}` },
    });
    expect(response.status).toBe(500);
    await Sentry.flush(2000);

    expect(events).toHaveLength(1);
    expect(events[0]!.exception?.values?.[0]?.value).toBe('worlds.load failed');
    const sent = JSON.stringify(events[0]);
    expect(sent).not.toContain(session);
    expect(sent).not.toContain('player-id');
    expect(events[0]!.user?.ip_address).toBeUndefined();
  });

  it('reports a failed sign-in without its query string', async () => {
    startSentry(dsn, {});
    app = kith();
    const base = await listen(app);
    const oauth = app.signCookie('the-state:the-verifier');

    const response = await fetch(
      `${base}/auth/google/callback?code=google-code&state=the-state`,
      { headers: { cookie: `kith_oauth=${oauth}` }, redirect: 'manual' },
    );
    expect(response.status).toBe(500);
    await Sentry.flush(2000);

    expect(events).toHaveLength(1);
    expect(events[0]!.exception?.values?.[0]?.value).toBe('signIn');
    const sent = JSON.stringify(events[0]);
    expect(sent).not.toContain('google-code');
    expect(sent).not.toContain('the-verifier');
  });

  it('does not report requests the app refuses', async () => {
    startSentry(dsn, {});
    app = kith();
    const base = await listen(app);

    expect((await fetch(`${base}/api/world`)).status).toBe(401);
    expect((await fetch(`${base}/nowhere`)).status).toBe(404);
    expect((await fetch(`${base}/readyz`)).status).toBe(503);
    await Sentry.flush(2000);

    expect(events).toHaveLength(0);
  });
});
