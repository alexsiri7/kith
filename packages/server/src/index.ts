import { randomUUID } from 'node:crypto';
import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';

export interface ServerOptions {
  checkDatabase: () => Promise<unknown>;
  /** The built v2.2 prototype, served at `/`. */
  gameDir?: string;
  /** The new client's build, served at `/next/`. */
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
      index: 'kith.html',
      ...uncached,
    });
  }
  if (options.clientDir !== undefined) {
    app.register(fastifyStatic, {
      root: options.clientDir,
      prefix: '/next',
      redirect: true,
      // Nothing sends files by hand, and a second reply.sendFile decoration
      // would clash with the game's.
      decorateReply: false,
      ...uncached,
    });
  }
  return app;
}
