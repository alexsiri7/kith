import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const sessionSecret = 's'.repeat(32);
const validEnv = {
  DATABASE_URL: 'postgres://kith:db-password@localhost:5432/kith',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  APP_ORIGIN: 'https://kith.example',
  SESSION_SECRET: sessionSecret,
};

function problemsFor(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('returns the validated configuration', () => {
    expect(
      loadConfig({
        ...validEnv,
        PORT: '8080',
        SENTRY_DSN: 'https://key@sentry.example/1',
      }),
    ).toEqual({
      port: 8080,
      databaseUrl: validEnv.DATABASE_URL,
      anthropicApiKey: validEnv.ANTHROPIC_API_KEY,
      sentryDsn: 'https://key@sentry.example/1',
      appOrigin: 'https://kith.example',
      sessionSecret,
    });
  });

  it('defaults PORT to 3000 and treats SENTRY_DSN as optional', () => {
    expect(loadConfig(validEnv)).toMatchObject({
      port: 3000,
      sentryDsn: undefined,
    });
    expect(loadConfig({ ...validEnv, SENTRY_DSN: '' }).sentryDsn).toBe(
      undefined,
    );
  });

  it('accepts postgresql:// database URLs', () => {
    const databaseUrl = 'postgresql://kith@db.internal/kith';
    expect(
      loadConfig({ ...validEnv, DATABASE_URL: databaseUrl }).databaseUrl,
    ).toBe(databaseUrl);
  });

  for (const name of [
    'DATABASE_URL',
    'ANTHROPIC_API_KEY',
    'APP_ORIGIN',
    'SESSION_SECRET',
  ]) {
    it(`requires ${name}`, () => {
      expect(problemsFor({ ...validEnv, [name]: undefined })).toContain(
        `${name} must be set`,
      );
      expect(problemsFor({ ...validEnv, [name]: '' })).toContain(
        `${name} must be set`,
      );
    });
  }

  it('rejects an invalid PORT', () => {
    expect(problemsFor({ ...validEnv, PORT: 'abc' })).toContain(
      'PORT must be an integer from 1 to 65535, got "abc"',
    );
  });

  for (const databaseUrl of ['mysql://kith@localhost/kith', 'not a url']) {
    it(`rejects DATABASE_URL ${JSON.stringify(databaseUrl)}`, () => {
      expect(problemsFor({ ...validEnv, DATABASE_URL: databaseUrl })).toContain(
        'DATABASE_URL must be a postgres:// or postgresql:// URL',
      );
    });
  }

  for (const appOrigin of [
    'https://kith.example/',
    'https://kith.example/app',
    'kith.example',
    'ftp://kith.example',
  ]) {
    it(`rejects APP_ORIGIN ${JSON.stringify(appOrigin)}`, () => {
      expect(problemsFor({ ...validEnv, APP_ORIGIN: appOrigin })).toContain(
        `APP_ORIGIN must be an origin like https://kith.example, got "${appOrigin}"`,
      );
    });
  }

  it('requires SESSION_SECRET to be at least 32 characters', () => {
    expect(
      problemsFor({ ...validEnv, SESSION_SECRET: 's'.repeat(31) }),
    ).toContain('SESSION_SECRET must be at least 32 characters');
  });

  it('rejects a SENTRY_DSN that is not a URL', () => {
    expect(problemsFor({ ...validEnv, SENTRY_DSN: 'not a url' })).toContain(
      'SENTRY_DSN must be a URL',
    );
  });

  it('reports every problem at once', () => {
    const message = problemsFor({ PORT: '0', APP_ORIGIN: 'kith.example' });
    expect(message).toMatch(/^Invalid configuration:\n- /);
    expect(message).toContain('PORT must be an integer');
    expect(message).toContain('DATABASE_URL must be set');
    expect(message).toContain('ANTHROPIC_API_KEY must be set');
    expect(message).toContain('APP_ORIGIN must be an origin');
    expect(message).toContain('SESSION_SECRET must be set');
  });

  it('never echoes secret values', () => {
    const message = problemsFor({
      ...validEnv,
      DATABASE_URL: 'mysql://kith:db-password@localhost/kith',
      SESSION_SECRET: 'short-session-secret',
      APP_ORIGIN: 'bad',
    });
    expect(message).not.toContain('db-password');
    expect(message).not.toContain('short-session-secret');
    expect(message).not.toContain('test-anthropic-key');
  });
});
