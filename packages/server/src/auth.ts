import { createHash, randomBytes } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { GoogleIdentity, IdentityProvider } from './google.js';
import type { UserStore } from './users.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, or null when the request carries no valid session. */
    userId: string | null;
  }
}

export interface AuthOptions {
  appOrigin: string;
  sessionSecret: string;
  google: IdentityProvider;
  users: UserStore;
}

export const sessionCookie = 'kith_session';
export const sessionMaxAgeSeconds = 90 * 24 * 60 * 60;
const oauthCookie = 'kith_oauth';
const oauthCookiePath = '/auth/google';
const oauthMaxAgeSeconds = 10 * 60;
const callbackPath = '/auth/google/callback';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  signed: true,
} as const;

function issueSession(reply: FastifyReply, userId: string): void {
  const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
  reply.setCookie(sessionCookie, `${userId}:${expiresAt}`, {
    ...cookieOptions,
    path: '/',
    maxAge: sessionMaxAgeSeconds,
  });
}

function unsigned(request: FastifyRequest, name: string): string | null {
  const raw = request.cookies[name];
  if (raw === undefined) return null;
  const { valid, value } = request.unsignCookie(raw);
  return valid ? value : null;
}

// The expiry is inside the signed value because a client can keep sending a
// cookie past its Max-Age.
function sessionUser(request: FastifyRequest): string | null {
  const [userId, expiresAt] =
    unsigned(request, sessionCookie)?.split(':') ?? [];
  if (userId === undefined || !(Number(expiresAt) > Date.now())) return null;
  return userId;
}

// SameSite=Lax already keeps the session cookie off cross-site POSTs; this
// also refuses them from browsers or proxies that ignore SameSite.
function isSameOrigin(request: FastifyRequest, appOrigin: string): boolean {
  const origin = request.headers.origin;
  if (origin !== undefined) return origin === appOrigin;
  return request.headers['sec-fetch-site'] === 'same-origin';
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Google sign-in and the session cookie it issues. Every request learns its
 * `userId`, and a valid session is renewed for another 90 days on each use.
 * Routes under `/api/` answer 401 without a session, and 403 to a
 * state-changing request from another origin.
 */
export const auth = fp<AuthOptions>(async (app, options) => {
  const redirectUri = `${options.appOrigin}${callbackPath}`;
  await app.register(fastifyCookie, { secret: options.sessionSecret });
  app.decorateRequest('userId', null);

  app.addHook('onRequest', async (request, reply) => {
    request.userId = sessionUser(request);
    if (request.userId !== null) issueSession(reply, request.userId);

    if (request.routeOptions.url?.startsWith('/api/')) {
      if (request.userId === null) {
        return reply.code(401).send({ error: 'Sign in first' });
      }
      if (
        !safeMethods.has(request.method) &&
        !isSameOrigin(request, options.appOrigin)
      ) {
        return reply.code(403).send({ error: 'Cross-origin request refused' });
      }
    }
  });

  app.get('/auth/google', async (_request, reply) => {
    const state = randomBytes(16).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    reply.setCookie(oauthCookie, `${state}:${codeVerifier}`, {
      ...cookieOptions,
      path: oauthCookiePath,
      maxAge: oauthMaxAgeSeconds,
    });
    return reply.redirect(
      options.google.authorizationUrl({
        redirectUri,
        state,
        codeChallenge: pkceChallenge(codeVerifier),
      }),
    );
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    callbackPath,
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { code: { type: 'string' }, state: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const [state, codeVerifier] =
        unsigned(request, oauthCookie)?.split(':') ?? [];
      reply.clearCookie(oauthCookie, { path: oauthCookiePath });
      const { code } = request.query;
      // Covers a refused consent screen too: Google then sends no code.
      if (
        code === undefined ||
        state === undefined ||
        codeVerifier === undefined ||
        request.query.state !== state
      ) {
        request.log.warn('Google sign-in callback without a matching state');
        return reply.redirect('/', 303);
      }
      let identity: GoogleIdentity;
      try {
        identity = await options.google.identify({
          code,
          redirectUri,
          codeVerifier,
        });
      } catch (err) {
        request.log.warn({ err }, 'Google sign-in failed');
        return reply.redirect('/', 303);
      }
      let userId: string;
      try {
        userId = await options.users.signIn(identity);
      } catch (err) {
        request.log.error({ err }, 'Failed to save the signed-in user');
        return reply.code(500).send({ error: 'Internal Server Error' });
      }
      issueSession(reply, userId);
      return reply.redirect('/', 303);
    },
  );

  await app.register(async (signOut) => {
    // The game signs out with an HTML form, whose empty body Fastify would
    // otherwise refuse as an unsupported media type.
    signOut.addContentTypeParser(
      'application/x-www-form-urlencoded',
      (_request, _payload, done) => done(null),
    );
    signOut.post('/auth/sign-out', async (request, reply) => {
      if (!isSameOrigin(request, options.appOrigin)) {
        return reply.code(403).send({ error: 'Cross-origin request refused' });
      }
      reply.clearCookie(sessionCookie, { path: '/' });
      return reply.redirect('/', 303);
    });
  });
});
