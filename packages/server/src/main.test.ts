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
});
