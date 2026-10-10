import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { auth, type AuthOptions } from './auth.js';
import { clientMountPath } from './client-mount.js';
import { mindApi, type MindOptions } from './mind.js';
import { worldApi, type PrototypeWorldStore } from './prototype-worlds.js';

/**
 * The files `prototype/build.js` writes beside the pages so the game installs
 * as an app, as it lists them in the build's `app-files.json`.
 */
export function readAppFiles(gameDir: string): string[] {
  const files: unknown = JSON.parse(
    readFileSync(join(gameDir, 'app-files.json'), 'utf8'),
  );
  if (
    !Array.isArray(files) ||
    !files.every(
      (file): file is string =>
        typeof file === 'string' && /^[\w.-]+$/.test(file),
    )
  ) {
    throw new Error(`${gameDir}/app-files.json is not a list of file names`);
  }
  return files;
}

export interface ServerOptions {
  checkDatabase: () => Promise<unknown>;
  auth: AuthOptions;
  worlds: PrototypeWorldStore;
  mind: MindOptions;
  /**
   * The built v2.2 prototype. `/` serves its game to signed-in players and
   * its welcome page to everyone else; the files its `app-files.json` lists are
   * served to everyone.
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
  app.register(worldApi, { worlds: options.worlds });
  app.register(mindApi, options.mind);

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
    for (const file of readAppFiles(options.gameDir)) {
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
