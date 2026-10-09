import { describe, expect, it } from 'vitest';
import { googleProvider } from './google.js';

const clientId = 'kith-client-id';
const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const validClaims = {
  iss: 'https://accounts.google.com',
  aud: clientId,
  exp: Math.floor(Date.now() / 1000) + 3600,
  sub: 'google-sub-1',
  email: 'alex@kith.example',
  email_verified: true,
  name: 'Alex',
};

function providerAnswering(response: Response) {
  return googleProvider({
    clientId,
    clientSecret: 'kith-client-secret',
    authorizationUrl: 'https://google.test/auth',
    tokenUrl: 'https://google.test/token',
    fetch: async () => response,
  });
}

function identify(claims: Record<string, unknown>) {
  const idToken = `${base64url({ alg: 'RS256' })}.${base64url(claims)}.sig`;
  return providerAnswering(Response.json({ id_token: idToken })).identify({
    code: 'code',
    redirectUri: 'https://kith.example/auth/google/callback',
    codeVerifier: 'verifier',
  });
}

describe('googleProvider', () => {
  it('reads the identity from the ID token', async () => {
    await expect(identify(validClaims)).resolves.toEqual({
      subject: 'google-sub-1',
      email: 'alex@kith.example',
      displayName: 'Alex',
    });
  });

  it('names an account without a name after its email', async () => {
    await expect(
      identify({ ...validClaims, name: undefined }),
    ).resolves.toMatchObject({
      displayName: 'alex@kith.example',
    });
  });

  const rejected: [string, Record<string, unknown>, string][] = [
    ['another issuer', { iss: 'https://evil.example' }, 'not issued by Google'],
    ['another client', { aud: 'other-client' }, 'issued to another client'],
    [
      'an expired token',
      { exp: Math.floor(Date.now() / 1000) - 1 },
      'has expired',
    ],
    ['no subject', { sub: '' }, 'has no subject'],
    ['an unverified email', { email_verified: false }, 'no verified email'],
  ];
  for (const [what, override, message] of rejected) {
    it(`rejects an ID token with ${what}`, async () => {
      await expect(identify({ ...validClaims, ...override })).rejects.toThrow(
        message,
      );
    });
  }

  it('rejects a failed token exchange', async () => {
    const provider = providerAnswering(
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );
    await expect(
      provider.identify({ code: 'c', redirectUri: 'r', codeVerifier: 'v' }),
    ).rejects.toThrow('Google token endpoint answered 400');
  });

  it('rejects a token response without an ID token', async () => {
    const provider = providerAnswering(Response.json({ access_token: 'a' }));
    await expect(
      provider.identify({ code: 'c', redirectUri: 'r', codeVerifier: 'v' }),
    ).rejects.toThrow('no ID token');
  });
});
