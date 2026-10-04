import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer, type ServerOptions } from './index.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('server', () => {
  let app: FastifyInstance | undefined;
  let clientDir: string | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (clientDir !== undefined) await rm(clientDir, { recursive: true });
    clientDir = undefined;
  });

  function build(options: Partial<ServerOptions> = {}): FastifyInstance {
    app = buildServer({
      checkDatabase: async () => undefined,
      logger: false,
      ...options,
    });
    return app;
  }

  it('reports liveness on /healthz', async () => {
    const res = await build().inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('no longer serves /health', async () => {
    const res = await build().inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(404);
  });

  it('reports ready when the database is reachable', async () => {
    const res = await build().inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('reports unavailable when the database is unreachable', async () => {
    const res = await build({
      checkDatabase: () => Promise.reject(new Error('connection refused')),
    }).inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable' });
  });

  it('echoes an incoming request id', async () => {
    const res = await build().inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'upstream-id' },
    });
    expect(res.headers['x-request-id']).toBe('upstream-id');
  });

  it('generates a UUID request id when none is sent', async () => {
    const res = await build().inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-request-id']).toMatch(uuid);
  });

  it('logs JSON lines tagged with the request id', async () => {
    const lines: string[] = [];
    await build({
      logger: { stream: { write: (line: string) => lines.push(line) } },
    }).inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'test-id' },
    });
    const entries = lines.map((line) => JSON.parse(line) as { reqId?: string });
    expect(entries.some((entry) => entry.reqId === 'test-id')).toBe(true);
  });

  it('serves the client build when given one', async () => {
    clientDir = await mkdtemp(join(tmpdir(), 'kith-client-'));
    await writeFile(join(clientDir, 'index.html'), '<p>kith-client</p>');
    const server = build({ clientDir });

    const page = await server.inject({ method: 'GET', url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.body).toContain('kith-client');

    const health = await server.inject({ method: 'GET', url: '/healthz' });
    expect(health.json()).toEqual({ status: 'ok' });
  });

  it('serves no files without a client build', async () => {
    const res = await build().inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
  });
});
