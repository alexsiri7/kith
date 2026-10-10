import { randomUUID } from 'node:crypto';
import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { auth, type AuthOptions } from './auth.js';
import { clientMountPath } from './client-mount.js';

/**
 * What `prototype/build.js` writes beside the pages so the game installs as
 * an app.
 */
export const appFiles = [
  'manifest.webmanifest',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
] as const;

export interface ServerOptions {
  checkDatabase: () => Promise<unknown>;
  auth: AuthOptions;
  /**
   * The built v2.2 prototype. `/` serves its game to signed-in players and
   * its welcome page to everyone else; its `appFiles` are served to everyone.
   */
  gameDir?: string;
  /** The new client's build, served under `clientMountPath`. */
  clientDir?: string;
  logger?: FastifyServerOptions['logger'];
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    // Honour an upstream id so logs correlate across proxies.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });
  app.register(auth, options.auth);

  app.get('/healthz', () => ({ status: 'ok' }));
  app.get('/readyz', async (request, reply) => {
    try {
      await options.checkDatabase();
      return { status: 'ready' };
    } catch (err) {
      request.log.warn({ err }, 'database unreachable');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  const uncached = { cacheControl: false, lastModified: false, etag: false };
  if (options.gameDir !== undefined) {
    app.register(fastifyStatic, {
      root: options.gameDir,
      serve: false,
      ...uncached,
    });
    app.get('/', (request, reply) =>
      reply.sendFile(request.userId === null ? 'welcome.html' : 'kith.html'),
    );
    for (const file of appFiles) {
      app.get(`/${file}`, (_request, reply) => reply.sendFile(file));
    }
  }
  if (options.clientDir !== undefined) {
    app.register(fastifyStatic, {
      root: options.clientDir,
      prefix: clientMountPath,
      redirect: true,
      // Nothing sends files by hand, and a second reply.sendFile decoration
      // would clash with the game's.
      decorateReply: false,
      ...uncached,
    });
  }
  return app;
}
