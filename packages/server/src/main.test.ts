import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validEnv = {
  DATABASE_URL: 'postgres://kith:kith@localhost:5432/kith',
  ANTHROPIC_API_KEY: 'test-key',
  APP_ORIGIN: 'http://localhost:3000',
  SESSION_SECRET: 'test-session-secret-0123456789abcdef',
};

describe('server entrypoint', () => {
  const listen = vi.fn();
  const buildServer = vi.fn(() => ({ listen, addHook: vi.fn() }));

  beforeEach(() => {
    vi.doMock('./index.js', () => ({ buildServer }));
    for (const [name, value] of Object.entries(validEnv)) {
      vi.stubEnv(name, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('./index.js');
    vi.resetModules();
    listen.mockReset();
    buildServer.mockClear();
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

  it('serves the client build', async () => {
    await import('./main.js');

    expect(buildServer).toHaveBeenCalledWith(
      expect.objectContaining({
        clientDir: expect.stringMatching(/packages[\\/]client[\\/]dist[\\/]?$/),
      }),
    );
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
