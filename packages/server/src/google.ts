export interface GoogleIdentity {
  /** Google's stable account id (the ID token's `sub`). */
  subject: string;
  email: string;
  displayName: string;
}

export interface IdentityProvider {
  authorizationUrl(request: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string;
  /** Redeems an authorization code for the identity it was issued to. */
  identify(request: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<GoogleIdentity>;
}

export interface GoogleOAuthOptions {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  fetch?: typeof fetch;
}

export const googleAuthorizationUrl =
  'https://accounts.google.com/o/oauth2/v2/auth';
export const googleTokenUrl = 'https://oauth2.googleapis.com/token';
const googleIssuers = ['https://accounts.google.com', 'accounts.google.com'];

function claim(source: object, name: string): unknown {
  return Reflect.get(source, name);
}

function decodeJwtPayload(token: string): object {
  const payload = token.split('.')[1];
  if (payload === undefined) throw new Error('ID token is not a JWT');
  const claims: unknown = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  );
  if (typeof claims !== 'object' || claims === null) {
    throw new Error('ID token payload is not an object');
  }
  return claims;
}

// The ID token comes straight from Google's token endpoint over TLS in
// exchange for our client secret, so OpenID Connect Core 3.1.3.7 lets us
// trust its signature without fetching Google's keys; the claims are still
// ours to check.
function identityFrom(idToken: string, clientId: string): GoogleIdentity {
  const claims = decodeJwtPayload(idToken);
  const iss = claim(claims, 'iss');
  const exp = claim(claims, 'exp');
  const sub = claim(claims, 'sub');
  const email = claim(claims, 'email');
  const name = claim(claims, 'name');
  if (typeof iss !== 'string' || !googleIssuers.includes(iss)) {
    throw new Error('ID token was not issued by Google');
  }
  if (claim(claims, 'aud') !== clientId) {
    throw new Error('ID token was issued to another client');
  }
  if (typeof exp !== 'number' || exp * 1000 <= Date.now()) {
    throw new Error('ID token has expired');
  }
  if (typeof sub !== 'string' || sub === '') {
    throw new Error('ID token has no subject');
  }
  if (typeof email !== 'string' || claim(claims, 'email_verified') !== true) {
    throw new Error('Google account has no verified email');
  }
  return {
    subject: sub,
    email,
    displayName: typeof name === 'string' && name !== '' ? name : email,
  };
}

export function googleProvider(options: GoogleOAuthOptions): IdentityProvider {
  const fetchFn = options.fetch ?? fetch;
  return {
    authorizationUrl({ redirectUri, state, codeChallenge }) {
      const url = new URL(options.authorizationUrl);
      url.search = new URLSearchParams({
        client_id: options.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return url.toString();
    },

    async identify({ code, redirectUri, codeVerifier }) {
      const response = await fetchFn(options.tokenUrl, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          code_verifier: codeVerifier,
        }),
      });
      if (!response.ok) {
        throw new Error(`Google token endpoint answered ${response.status}`);
      }
      const body: unknown = await response.json();
      const idToken =
        typeof body === 'object' && body !== null
          ? claim(body, 'id_token')
          : undefined;
      if (typeof idToken !== 'string') {
        throw new Error('Google token response has no ID token');
      }
      return identityFrom(idToken, options.clientId);
    },
  };
}
