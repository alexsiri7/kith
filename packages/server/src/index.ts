import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';

export function buildServer(
  options: FastifyServerOptions = { logger: true },
): FastifyInstance {
  const app = Fastify(options);
  app.get('/health', () => ({ status: 'ok' }));
  return app;
}
