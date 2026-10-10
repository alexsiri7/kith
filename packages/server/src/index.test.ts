import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { clientMountPath } from './client-mount.js';
import type { IdentityProvider } from './google.js';
import { buildServer, readAppFiles, type ServerOptions } from './index.js';
import type { MindOptions } from './mind.js';
import type { PrototypeWorldStore } from './prototype-worlds.js';

const unusedGoogle: IdentityProvider = {
  authorizationUrl: () => 'https://google.test/auth',
  identify: () => Promise.reject(new Error('not signing in here')),
};

const noWorlds: PrototypeWorldStore = {
  load: () => Promise.reject(new Error('no worlds here')),
  save: () => Promise.reject(new Error('no worlds here')),
  erase: () => Promise.reject(new Error('no worlds here')),
};

const noMind: MindOptions = {
  mind: {
    model: 'anthropic/no-mind',
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
      worlds: noWorlds,
      mind: noMind,
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

  async function staticDir(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'kith-static-'));
    dirs.push(dir);
    for (const [file, body] of Object.entries(files)) {
      await writeFile(join(dir, file), body);
    }
    return dir;
  }

  it('serves the welcome page at / and the client at its mount', async () => {
    const server = build({
      gameDir: await staticDir({
        'welcome.html': '<p>kith-welcome</p>',
        'app-files.json': '[]',
      }),
      clientDir: await staticDir({ 'index.html': '<p>kith-client</p>' }),
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

  it('serves the installable-app files the build lists to everyone, and no other file of the game', async () => {
    const types = {
      'manifest.webmanifest': /^application\/manifest\+json/,
      'sw.js': /^application\/javascript/,
      'icon-192.png': /^image\/png/,
    };
    const server = build({
      gameDir: await staticDir({
        ...Object.fromEntries(Object.keys(types).map((file) => [file, file])),
        'kith.html': '<p>kith-game</p>',
        'app-files.json': JSON.stringify(Object.keys(types)),
      }),
    });

    for (const [file, type] of Object.entries(types)) {
      const res = await server.inject({ method: 'GET', url: `/${file}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(type);
      expect(res.body).toBe(file);
    }
    for (const file of ['kith.html', 'app-files.json']) {
      const res = await server.inject({ method: 'GET', url: `/${file}` });
      expect(res.statusCode, file).toBe(404);
    }
  });

  it('refuses a game build whose app-files.json names a path', async () => {
    const gameDir = await staticDir({
      'app-files.json': JSON.stringify(['../secret.txt']),
    });
    expect(() => readAppFiles(gameDir)).toThrow(/not a list of file names/);
    expect(() => build({ gameDir })).toThrow(/not a list of file names/);
  });

  it('redirects the bare mount path to the client', async () => {
    const res = await build({
      clientDir: await staticDir({ 'index.html': '<p>kith-client</p>' }),
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
