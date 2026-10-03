import { buildServer } from './index.js';

const app = buildServer();
// Railway injects PORT and routes traffic to it on all interfaces.
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
