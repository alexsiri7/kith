import { buildServer } from './index.js';
import { resolvePort } from './port.js';

const app = buildServer();
// Railway injects PORT and routes traffic to it on all interfaces.
await app.listen({ port: resolvePort(process.env.PORT), host: '0.0.0.0' });
