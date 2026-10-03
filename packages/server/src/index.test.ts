import { describe, expect, it } from 'vitest';
import { buildServer } from './index.js';

describe('server', () => {
  it('reports health', async () => {
    const app = buildServer({ logger: false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
