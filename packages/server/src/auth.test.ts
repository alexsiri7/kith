import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionCookie, sessionMaxAgeSeconds } from './auth.js';
import { googleProvider, type GoogleIdentity } from './google.js';
import { buildServer } from './index.js';
import type { UserStore } from './users.js';

const appOrigin = 'https://kith.example';
const clientId = 'kith-client-id';
const clientSecret = 'kith-client-secret';
const tokenUrl = 'https://google.test/token';
const day = 24 * 60 * 60 * 1000;

const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/** Plays Google's token endpoint: it accepts one code, for one account. */
function fakeGoogle() {
  const tokenRequests: URLSearchParams[] = [];
  let challenge: string | undefined;
  const provider = googleProvider({
    clientId,
    clientSecret,
    authorizationUrl: 'https://google.test/auth',
    tokenUrl,
    fetch: async (url, init) => {
      expect(url).toBe(tokenUrl);
      const form = new URLSearchParams(String(init?.body));
      tokenRequests.push(form);
      const verifier = form.get('code_verifier') ?? '';
      const verified =
        createHash('sha256').update(verifier).digest('base64url') === challenge;
      if (form.get('code') !== 'good-code' || !verified) {
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      }
      const claims = {
        iss: 'https://accounts.google.com',
        aud: clientId,
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: 'google-sub-1',
        email: 'alex@kith.example',
        email_verified: true,
        name: 'Alex',
      };
      return Response.json({
        id_token: `${base64url({ alg: 'RS256' })}.${base64url(claims)}.sig`,
      });
    },
  });
  return {
    tokenRequests,
    provider: {
      ...provider,
      authorizationUrl: (
        request: Parameters<typeof provider.authorizationUrl>[0],
      ) => {
        challenge = request.codeChallenge;
        return provider.authorizationUrl(request);
      },
    },
  };
}

class MemoryUserStore implements UserStore {
  readonly users = new Map<string, GoogleIdentity & { id: string }>();

  async signIn(identity: GoogleIdentity): Promise<string> {
    const existing = this.users.get(identity.subject);
    const id = existing?.id ?? `user-${this.users.size + 1}`;
    this.users.set(identity.subject, { ...identity, id });
    return id;
  }
}

function cookieFrom(res: LightMyRequestResponse, name: string) {
  return res.cookies.find((cookie) => cookie.name === name);
}

describe('Google sign-in', () => {
  let app: FastifyInstance;
  let google: ReturnType<typeof fakeGoogle>;
  let users: MemoryUserStore;
  let gameDir: string;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    gameDir = await mkdtemp(join(tmpdir(), 'kith-game-'));
    await writeFile(join(gameDir, 'kith.html'), '<p>kith-game</p>');
    await writeFile(join(gameDir, 'welcome.html'), '<p>kith-welcome</p>');
    google = fakeGoogle();
    users = new MemoryUserStore();
    app = buildServer({
      checkDatabase: async () => undefined,
      logger: false,
      gameDir,
      auth: {
        appOrigin,
        sessionSecret: 's'.repeat(32),
        google: google.provider,
        users,
      },
    });
    app.get('/api/probe', (request) => ({ userId: request.userId }));
    app.post('/api/probe', (request) => ({ userId: request.userId }));
  });

  afterEach(async () => {
    await app.close();
    await rm(gameDir, { recursive: true });
    vi.useRealTimers();
  });

  async function startSignIn() {
    const res = await app.inject({ method: 'GET', url: '/auth/google' });
    const location = new URL(String(res.headers.location));
    const oauth = cookieFrom(res, 'kith_oauth');
    return { res, location, oauth: oauth?.value ?? '' };
  }

  async function callback(query: string, oauth: string) {
    return app.inject({
      method: 'GET',
      url: `/auth/google/callback?${query}`,
      cookies: { kith_oauth: oauth },
    });
  }

  /** Signs in through the fake Google and returns the session cookie's value. */
  async function signIn(): Promise<string> {
    const { location, oauth } = await startSignIn();
    const state = location.searchParams.get('state');
    const res = await callback(`code=good-code&state=${state}`, oauth);
    const session = cookieFrom(res, sessionCookie);
    expect(session).toBeDefined();
    return session!.value;
  }

  const withSession = (session: string) => ({ [sessionCookie]: session });

  it('sends the visitor to Google with a state and a PKCE challenge', async () => {
    const { res, location, oauth } = await startSignIn();

    expect(res.statusCode).toBe(302);
    expect(location.origin + location.pathname).toBe(
      'https://google.test/auth',
    );
    expect(Object.fromEntries(location.searchParams)).toMatchObject({
      client_id: clientId,
      redirect_uri: `${appOrigin}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge_method: 'S256',
    });
    expect(location.searchParams.get('state')).toMatch(/^[\w-]{20,}$/);
    expect(location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(oauth).not.toBe('');
    expect(cookieFrom(res, 'kith_oauth')).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/auth/google',
      maxAge: 600,
    });
  });

  it('creates the user on the callback and issues a 90-day session', async () => {
    const { location, oauth } = await startSignIn();
    const state = location.searchParams.get('state');

    const res = await callback(`code=good-code&state=${state}`, oauth);

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/');
    const [token] = google.tokenRequests;
    expect(Object.fromEntries(token!)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'good-code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${appOrigin}/auth/google/callback`,
    });
    expect([...users.users.values()]).toEqual([
      {
        id: 'user-1',
        subject: 'google-sub-1',
        email: 'alex@kith.example',
        displayName: 'Alex',
      },
    ]);
    expect(cookieFrom(res, sessionCookie)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: sessionMaxAgeSeconds,
    });
    expect(cookieFrom(res, 'kith_oauth')).toMatchObject({ maxAge: 0 });

    const probe = await app.inject({
      method: 'GET',
      url: '/api/probe',
      cookies: withSession(cookieFrom(res, sessionCookie)!.value),
    });
    expect(probe.json()).toEqual({ userId: 'user-1' });
  });

  it('signs a returning player in as the same user', async () => {
    await signIn();
    const session = await signIn();
    const probe = await app.inject({
      method: 'GET',
      url: '/api/probe',
      cookies: withSession(session),
    });
    expect(probe.json()).toEqual({ userId: 'user-1' });
    expect(users.users.size).toBe(1);
  });

  it('issues no session when the state does not match', async () => {
    const { oauth } = await startSignIn();
    const res = await callback('code=good-code&state=forged', oauth);
    expect(res.statusCode).toBe(303);
    expect(cookieFrom(res, sessionCookie)).toBeUndefined();
    expect(google.tokenRequests).toEqual([]);
  });

  it('issues no session without the sign-in cookie', async () => {
    const { location } = await startSignIn();
    const state = location.searchParams.get('state');
    const res = await callback(`code=good-code&state=${state}`, 'tampered');
    expect(cookieFrom(res, sessionCookie)).toBeUndefined();
    expect(google.tokenRequests).toEqual([]);
  });

  it('issues no session when the player declines on Google', async () => {
    const { location, oauth } = await startSignIn();
    const state = location.searchParams.get('state');
    const res = await callback(`error=access_denied&state=${state}`, oauth);
    expect(res.statusCode).toBe(303);
    expect(cookieFrom(res, sessionCookie)).toBeUndefined();
  });

  it('issues no session when Google rejects the code', async () => {
    const { location, oauth } = await startSignIn();
    const state = location.searchParams.get('state');
    const res = await callback(`code=stale-code&state=${state}`, oauth);
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/');
    expect(cookieFrom(res, sessionCookie)).toBeUndefined();
    expect(users.users.size).toBe(0);
  });

  it('shows signed-out visitors the welcome card and players the game', async () => {
    const signedOut = await app.inject({ method: 'GET', url: '/' });
    expect(signedOut.statusCode).toBe(200);
    expect(signedOut.body).toContain('kith-welcome');
    expect(signedOut.body).not.toContain('kith-game');

    const session = await signIn();
    const signedIn = await app.inject({
      method: 'GET',
      url: '/',
      cookies: withSession(session),
    });
    expect(signedIn.statusCode).toBe(200);
    expect(signedIn.body).toContain('kith-game');
  });

  it('renews the session on use', async () => {
    const session = await signIn();

    vi.setSystemTime(Date.now() + 60 * day);
    const used = await app.inject({
      method: 'GET',
      url: '/',
      cookies: withSession(session),
    });
    const renewed = cookieFrom(used, sessionCookie);
    expect(renewed).toMatchObject({ maxAge: sessionMaxAgeSeconds });

    // Past the first session's 90 days, the renewed one still works.
    vi.setSystemTime(Date.now() + 60 * day);
    const later = await app.inject({
      method: 'GET',
      url: '/',
      cookies: withSession(renewed!.value),
    });
    expect(later.body).toContain('kith-game');
  });

  it('expires a session unused for 90 days', async () => {
    const session = await signIn();

    vi.setSystemTime(Date.now() + 90 * day - 1);
    const lastDay = await app.inject({
      method: 'GET',
      url: '/api/probe',
      cookies: withSession(session),
    });
    expect(lastDay.statusCode).toBe(200);

    vi.setSystemTime(Date.now() + 1);
    const expired = await app.inject({
      method: 'GET',
      url: '/',
      cookies: withSession(session),
    });
    expect(expired.body).toContain('kith-welcome');
    expect(cookieFrom(expired, sessionCookie)).toBeUndefined();
  });

  it('ignores a session cookie that was not signed with SESSION_SECRET', async () => {
    const session = await signIn();
    const forged = session.replace('user-1', 'user-2');
    const res = await app.inject({
      method: 'GET',
      url: '/api/probe',
      cookies: withSession(forged),
    });
    expect(res.statusCode).toBe(401);
  });

  for (const method of ['GET', 'POST'] as const) {
    it(`answers ${method} /api/* with 401 when signed out`, async () => {
      const res = await app.inject({
        method,
        url: '/api/probe',
        headers: { origin: appOrigin },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: 'Sign in first' });
    });
  }

  it('accepts state-changing /api/* requests from the app only', async () => {
    const session = await signIn();
    const post = (headers: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: '/api/probe',
        cookies: withSession(session),
        headers,
      });

    expect((await post({ origin: appOrigin })).json()).toEqual({
      userId: 'user-1',
    });
    expect((await post({ 'sec-fetch-site': 'same-origin' })).statusCode).toBe(
      200,
    );
    for (const headers of [
      { origin: 'https://evil.example' },
      { 'sec-fetch-site': 'cross-site' },
      {},
    ]) {
      const res = await post(headers);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'Cross-origin request refused' });
    }
  });

  it('signs out', async () => {
    const session = await signIn();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      cookies: withSession(session),
      // What the game's sign-out form sends.
      headers: {
        origin: appOrigin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: '',
    });

    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/');
    expect(res.cookies.filter((c) => c.name === sessionCookie)).toEqual([
      expect.objectContaining({ value: '', maxAge: 0, path: '/' }),
    ]);
  });

  it('refuses a sign-out posted from another site', async () => {
    const session = await signIn();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      cookies: withSession(session),
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(cookieFrom(res, sessionCookie)?.value).not.toBe('');
  });
});
