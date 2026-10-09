import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

it('prototype/tests/test8.js runs under plain node', () => {
  expect(() =>
    execFileSync(process.execPath, ['prototype/tests/test8.js'], {
      cwd: repoRoot,
      stdio: 'pipe',
    }),
  ).not.toThrow();
}, 60_000);
