import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startSentry } from './sentry.js';

interface SentEvent {
  environment?: string;
  release?: string;
  exception?: { values?: { value?: string }[] };
  request?: {
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, string>;
  };
}

describe('startSentry', () => {
  // Stands in for sentry.io, collecting the events sent to its DSN.
  let ingest: Server;
  let dsn: string;
  const events: SentEvent[] = [];

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
  });
});
