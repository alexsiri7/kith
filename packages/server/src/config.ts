import { googleAuthorizationUrl, googleTokenUrl } from './google.js';
import type { MindLimits } from './mind.js';
import { resolvePort } from './port.js';

export interface Config {
  port: number;
  databaseUrl: string;
  anthropicApiKey: string;
  mind: MindLimits;
  sentryDsn: string | undefined;
  appOrigin: string;
  sessionSecret: string;
  google: {
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
  };
}

const minSessionSecretLength = 32;

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function hasProtocol(url: URL | undefined, protocols: string[]): boolean {
  return url !== undefined && protocols.includes(url.protocol);
}

// Error messages never include DATABASE_URL, ANTHROPIC_API_KEY,
// SESSION_SECRET or GOOGLE_CLIENT_SECRET values: startup errors end up in deploy logs.
export function loadConfig(env: Record<string, string | undefined>): Config {
  const problems: string[] = [];
  const required = (name: string): string => {
    const value = env[name];
    if (value === undefined || value === '') {
      problems.push(`${name} must be set`);
      return '';
    }
    return value;
  };

  let port = 0;
  try {
    port = resolvePort(env.PORT);
  } catch (error) {
    problems.push((error as Error).message);
  }

  const databaseUrl = required('DATABASE_URL');
  if (
    databaseUrl !== '' &&
    !hasProtocol(parseUrl(databaseUrl), ['postgres:', 'postgresql:'])
  ) {
    problems.push('DATABASE_URL must be a postgres:// or postgresql:// URL');
  }

  const anthropicApiKey = required('ANTHROPIC_API_KEY');

  const optionalNumber = (
    name: string,
    fallback: number,
    pattern: RegExp,
    rule: string,
  ): number => {
    const value = env[name];
    if (value === undefined || value === '') return fallback;
    if (!pattern.test(value)) {
      problems.push(`${name} must be ${rule}, got "${value}"`);
    }
    return Number(value);
  };
  const mind = {
    dailyCalls: optionalNumber(
      'MIND_DAILY_CALLS',
      300,
      /^\d{1,9}$/,
      'a whole number of calls',
    ),
    monthlySpendUsd: optionalNumber(
      'MIND_MONTHLY_SPEND_USD',
      20,
      /^\d{1,9}(\.\d+)?$/,
      'an amount in US dollars',
    ),
  };

  const sentryDsn = env.SENTRY_DSN === '' ? undefined : env.SENTRY_DSN;
  if (
    sentryDsn !== undefined &&
    !hasProtocol(parseUrl(sentryDsn), ['http:', 'https:'])
  ) {
    problems.push('SENTRY_DSN must be a URL');
  }

  const appOrigin = required('APP_ORIGIN');
  if (appOrigin !== '') {
    const url = parseUrl(appOrigin);
    if (!hasProtocol(url, ['http:', 'https:']) || url?.origin !== appOrigin) {
      problems.push(
        `APP_ORIGIN must be an origin like https://kith.example, got "${appOrigin}"`,
      );
    }
  }

  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret !== '' && sessionSecret.length < minSessionSecretLength) {
    problems.push(
      `SESSION_SECRET must be at least ${minSessionSecretLength} characters`,
    );
  }

  // Only the end-to-end tests point the URLs at a fake Google.
  const optionalUrl = (name: string, fallback: string): string => {
    const value = env[name];
    if (value === undefined || value === '') return fallback;
    if (!hasProtocol(parseUrl(value), ['http:', 'https:'])) {
      problems.push(`${name} must be a URL`);
    }
    return value;
  };
  const google = {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    authorizationUrl: optionalUrl('GOOGLE_AUTH_URL', googleAuthorizationUrl),
    tokenUrl: optionalUrl('GOOGLE_TOKEN_URL', googleTokenUrl),
  };

  if (problems.length > 0) {
    throw new Error(
      `Invalid configuration:\n${problems.map((p) => `- ${p}`).join('\n')}`,
    );
  }
  return {
    port,
    databaseUrl,
    anthropicApiKey,
    mind,
    sentryDsn,
    appOrigin,
    sessionSecret,
    google,
  };
}
