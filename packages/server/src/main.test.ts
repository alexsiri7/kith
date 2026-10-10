import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerOptions } from './index.js';

const validEnv = {
  DATABASE_URL: 'postgres://kith:kith@localhost:5432/kith',
  LLM_API_KEY: 'test-key',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef',
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
};

describe('server entrypoint', () => {
  const listen = vi.fn();
  const buildServer = vi.fn<(options: ServerOptions) => unknown>(() => ({
    listen,
    addHook: vi.fn(),
  }));
  const query = vi.fn();

  beforeEach(() => {
    vi.doMock('./index.js', () => ({ buildServer }));
    vi.doMock('pg', () => ({
      default: {
        Pool: class {
          query = query;
          end = vi.fn();
        },
      },
    }));
    for (const [name, value] of Object.entries(validEnv)) {
      vi.stubEnv(name, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('./index.js');
    vi.doUnmock('pg');
    vi.resetModules();
    listen.mockReset();
    buildServer.mockClear();
    query.mockReset();
  });

  it('listens on PORT on all interfaces', async () => {
    vi.stubEnv('PORT', '4321');

    await import('./main.js');

    expect(listen).toHaveBeenCalledWith({ port: 4321, host: '0.0.0.0' });
  });

  it('falls back to port 3000 when PORT is unset', async () => {
    vi.stubEnv('PORT', undefined);

    await import('./main.js');

    expect(listen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
  });

  it('serves the prototype build and the client build', async () => {
    await import('./main.js');

    expect(buildServer).toHaveBeenCalledWith(
      expect.objectContaining({
        gameDir: fileURLToPath(
          new URL('../../../prototype/dist/', import.meta.url),
        ),
        clientDir: expect.stringMatching(/packages[\\/]client[\\/]dist[\\/]?$/),
      }),
    );
  });

  it('thinks through Requesty with the model LLM_MODEL names', async () => {
    vi.stubEnv('LLM_MODEL', 'anthropic/claude-sonnet-5');

    await import('./main.js');

    expect(buildServer.mock.calls[0]![0].mind.mind.model).toBe(
      'anthropic/claude-sonnet-5',
    );
  });

  it('reports readiness by querying the database', async () => {
    await import('./main.js');
    const { checkDatabase } = buildServer.mock.calls[0]![0];

    query.mockResolvedValueOnce({ rows: [] });
    await checkDatabase();
    expect(query).toHaveBeenCalledWith('SELECT 1');

    const failure = new Error('connection refused');
    query.mockRejectedValueOnce(failure);
    await expect(checkDatabase()).rejects.toBe(failure);
  });

  for (const port of ['', 'abc', '-1', '0', '3.5', '65536']) {
    it(`refuses to listen when PORT is ${JSON.stringify(port)}`, async () => {
      vi.stubEnv('PORT', port);

      await expect(import('./main.js')).rejects.toThrow(
        `PORT must be an integer from 1 to 65535, got "${port}"`,
      );
      expect(listen).not.toHaveBeenCalled();
    });
  }

  it('refuses to start when DATABASE_URL is unset', async () => {
    vi.stubEnv('DATABASE_URL', undefined);

    await expect(import('./main.js')).rejects.toThrow(
      'DATABASE_URL must be set',
    );
    expect(buildServer).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });
});
