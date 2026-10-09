// Stands in for Google's OAuth endpoints during the end-to-end tests: the
// consent screen approves at once, as the one account below, and the token
// endpoint checks what Google would before issuing an ID token.
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';

const account = {
  sub: 'e2e-google-subject',
  email: 'player@kith.example',
  name: 'Alex',
};

const port = Number(process.env.PORT);
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

interface Grant {
  redirectUri: string;
  codeChallenge: string;
}
const grants = new Map<string, Grant>();

const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);

  if (request.method === 'GET' && url.pathname === '/auth') {
    const query = url.searchParams;
    const redirectUri = query.get('redirect_uri');
    const codeChallenge = query.get('code_challenge');
    if (
      query.get('client_id') !== clientId ||
      redirectUri === null ||
      codeChallenge === null ||
      query.get('code_challenge_method') !== 'S256'
    ) {
      response.writeHead(400).end('bad authorization request');
      return;
    }
    const code = randomUUID();
    grants.set(code, { redirectUri, codeChallenge });
    const callback = new URL(redirectUri);
    callback.searchParams.set('code', code);
    callback.searchParams.set('state', query.get('state') ?? '');
    response.writeHead(302, { location: callback.toString() }).end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/token') {
    const form = new URLSearchParams(await readBody(request));
    const code = form.get('code') ?? '';
    const grant = grants.get(code);
    grants.delete(code);
    const verifier = form.get('code_verifier') ?? '';
    if (
      grant === undefined ||
      form.get('client_id') !== clientId ||
      form.get('client_secret') !== clientSecret ||
      form.get('redirect_uri') !== grant.redirectUri ||
      createHash('sha256').update(verifier).digest('base64url') !==
        grant.codeChallenge
    ) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    const claims = {
      ...account,
      iss: 'https://accounts.google.com',
      aud: clientId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      email_verified: true,
    };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id_token: `${base64url({ alg: 'none' })}.${base64url(claims)}.`,
      }),
    );
    return;
  }

  response.writeHead(url.pathname === '/healthz' ? 200 : 404).end();
}).listen(port);
