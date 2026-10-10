import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { clientMountPath } from './client-mount.js';
import type { IdentityProvider } from './google.js';
import { appFiles, buildServer, type ServerOptions } from './index.js';

const unusedGoogle: IdentityProvider = {
  authorizationUrl: () => 'https://google.test/auth',
  identify: () => Promise.reject(new Error('not signing in here')),
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('server', () => {
  let app: FastifyInstance | undefined;
  const dirs: string[] = [];

  afterEach(async () => {
    await app?.close();
    app = undefined;
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
  });

  function build(options: Partial<ServerOptions> = {}): FastifyInstance {
    app = buildServer({
      checkDatabase: async () => undefined,
      logger: false,
      auth: {
        appOrigin: 'https://kith.example',
        sessionSecret: 's'.repeat(32),
        google: unusedGoogle,
        users: { signIn: () => Promise.reject(new Error('no users here')) },
      },
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

  async function staticDir(file: string, body: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'kith-static-'));
    dirs.push(dir);
    await writeFile(join(dir, file), body);
    return dir;
  }

  it('serves the welcome page at / and the client at its mount', async () => {
    const server = build({
      gameDir: await staticDir('welcome.html', '<p>kith-welcome</p>'),
      clientDir: await staticDir('index.html', '<p>kith-client</p>'),
    });

    const welcome = await server.inject({ method: 'GET', url: '/' });
    expect(welcome.statusCode).toBe(200);
    expect(welcome.headers['content-type']).toMatch(/^text\/html/);
    expect(welcome.body).toContain('kith-welcome');
    expect(welcome.headers).not.toHaveProperty('cache-control');
    expect(welcome.headers).not.toHaveProperty('last-modified');
    expect(welcome.headers).not.toHaveProperty('etag');

    const client = await server.inject({
      method: 'GET',
      url: `${clientMountPath}/`,
    });
    expect(client.statusCode).toBe(200);
    expect(client.headers['content-type']).toMatch(/^text\/html/);
    expect(client.body).toContain('kith-client');
    expect(client.headers).not.toHaveProperty('cache-control');
    expect(client.headers).not.toHaveProperty('last-modified');
    expect(client.headers).not.toHaveProperty('etag');

    const health = await server.inject({ method: 'GET', url: '/healthz' });
    expect(health.json()).toEqual({ status: 'ok' });
  });

  it('serves the installable-app files to everyone, and no other file of the game', async () => {
    const gameDir = await staticDir('kith.html', '<p>kith-game</p>');
    for (const file of appFiles) await writeFile(join(gameDir, file), file);
    const server = build({ gameDir });

    const types = {
      'manifest.webmanifest': /^application\/manifest\+json/,
      'sw.js': /^application\/javascript/,
      'icon-192.png': /^image\/png/,
      'icon-512.png': /^image\/png/,
      'icon-maskable-512.png': /^image\/png/,
      'apple-touch-icon.png': /^image\/png/,
    } satisfies Record<(typeof appFiles)[number], RegExp>;
    for (const [file, type] of Object.entries(types)) {
      const res = await server.inject({ method: 'GET', url: `/${file}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(type);
      expect(res.body).toBe(file);
    }

    const game = await server.inject({ method: 'GET', url: '/kith.html' });
    expect(game.statusCode).toBe(404);
  });

  it('redirects the bare mount path to the client', async () => {
    const res = await build({
      clientDir: await staticDir('index.html', '<p>kith-client</p>'),
    }).inject({ method: 'GET', url: clientMountPath });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe(`${clientMountPath}/`);
  });

  it('serves no files without builds', async () => {
    const server = build();
    const welcome = await server.inject({ method: 'GET', url: '/' });
    expect(welcome.statusCode).toBe(404);
    const client = await server.inject({
      method: 'GET',
      url: `${clientMountPath}/`,
    });
    expect(client.statusCode).toBe(404);
  });
});
