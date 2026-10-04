import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { deterministicPackages } from '../eslint.config.js';

const eslint = new ESLint();

async function ruleViolations(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId);
}

describe('determinism lint rule', () => {
  it('covers exactly the engine and content packages', () => {
    expect(new Set(deterministicPackages)).toEqual(
      new Set(['packages/engine/**', 'packages/content/**']),
    );
  });

  const forbidden = {
    'Math.random': 'export const x = Math.random();',
    'Date.now': 'export const x = Date.now();',
    'new Date()': 'export const x = new Date();',
    'Date()': 'export const x = Date();',
    'performance.now': 'export const x = performance.now();',
    'DOM global': 'export const x = document.title;',
    'Node global': 'export const x = process.env;',
    timer: 'setTimeout(() => {}, 0);',
  };

  for (const pkg of deterministicPackages) {
    const filePath = pkg.replace('**', 'src/example.ts');

    for (const [name, code] of Object.entries(forbidden)) {
      it(`rejects ${name} in ${pkg}`, async () => {
        const violations = await ruleViolations(code, filePath);
        expect(violations.length).toBeGreaterThan(0);
      });
    }

    it(`allows plain language features in ${pkg}`, async () => {
      const code = 'export const x = Math.floor(Date.UTC(2020, 0) / 2);\n';
      expect(await ruleViolations(code, filePath)).toEqual([]);
    });
  }

  it('does not apply outside the deterministic packages', async () => {
    const code = 'export const x = Math.random() + Date.now();\n';
    expect(
      await ruleViolations(code, 'packages/server/src/example.ts'),
    ).toEqual([]);
  });
});
