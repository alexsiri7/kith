import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('migration entrypoint', () => {
  const startSentry = vi.fn();
  const migrateDatabase = vi.fn(async () => []);

  beforeEach(() => {
    vi.doMock('./sentry.js', () => ({ startSentry }));
    vi.doMock('./migrations.js', () => ({ migrateDatabase }));
    vi.doMock('./database.js', () => ({
      assertConfinedRole: vi.fn(),
      poolConfig: vi.fn(),
    }));
    vi.doMock('pg', () => ({
      default: {
        Pool: class {
          end = vi.fn();
        },
      },
    }));
    vi.stubEnv('DATABASE_URL', 'postgres://kith:kith@localhost:5432/kith');
    vi.stubEnv('SENTRY_DSN', 'https://public@sentry.example/1');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('./sentry.js');
    vi.doUnmock('./migrations.js');
    vi.doUnmock('./database.js');
    vi.doUnmock('pg');
    vi.resetModules();
    vi.restoreAllMocks();
    startSentry.mockClear();
    migrateDatabase.mockClear();
  });

  it('starts Sentry with SENTRY_DSN before migrating', async () => {
    await import('./migrate-main.js');

    expect(startSentry).toHaveBeenCalledWith(
      'https://public@sentry.example/1',
      process.env,
    );
    expect(startSentry.mock.invocationCallOrder[0]).toBeLessThan(
      migrateDatabase.mock.invocationCallOrder[0]!,
    );
  });

  it('starts Sentry even when DATABASE_URL is unset, so that is reported', async () => {
    vi.stubEnv('DATABASE_URL', undefined);

    await expect(import('./migrate-main.js')).rejects.toThrow(
      'DATABASE_URL must be set',
    );
    expect(startSentry).toHaveBeenCalled();
  });
});
