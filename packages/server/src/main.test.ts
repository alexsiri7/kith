import { afterEach, describe, expect, it, vi } from 'vitest';

describe('server entrypoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('./index.js');
    vi.resetModules();
  });

  it('listens on PORT on all interfaces', async () => {
    const listen = vi.fn();
    vi.doMock('./index.js', () => ({ buildServer: () => ({ listen }) }));
    vi.stubEnv('PORT', '4321');

    await import('./main.js');

    expect(listen).toHaveBeenCalledWith({ port: 4321, host: '0.0.0.0' });
  });

  it('falls back to port 3000 when PORT is unset', async () => {
    const listen = vi.fn();
    vi.doMock('./index.js', () => ({ buildServer: () => ({ listen }) }));
    vi.stubEnv('PORT', undefined);

    await import('./main.js');

    expect(listen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
  });

  for (const port of ['', 'abc', '-1', '0', '3.5', '65536']) {
    it(`refuses to listen when PORT is ${JSON.stringify(port)}`, async () => {
      const listen = vi.fn();
      vi.doMock('./index.js', () => ({ buildServer: () => ({ listen }) }));
      vi.stubEnv('PORT', port);

      await expect(import('./main.js')).rejects.toThrow(
        `PORT must be an integer from 1 to 65535, got "${port}"`,
      );
      expect(listen).not.toHaveBeenCalled();
    });
  }
});
