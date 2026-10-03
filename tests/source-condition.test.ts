import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceCondition } from '../source-condition.js';

function readJson(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'),
  );
}

interface PackageManifest {
  exports?: Record<string, Record<string, string>>;
}

const packagesWithExports = readdirSync(new URL('../packages', import.meta.url))
  .map((dir) => ({
    dir,
    manifest: readJson(`packages/${dir}/package.json`) as PackageManifest,
  }))
  .filter(({ manifest }) => manifest.exports !== undefined);

describe('source export condition', () => {
  it('is the custom condition TypeScript resolves with', () => {
    const tsconfig = readJson('tsconfig.base.json') as {
      compilerOptions: { customConditions: string[] };
    };
    expect(tsconfig.compilerOptions.customConditions).toEqual([
      sourceCondition,
    ]);
  });

  it('is found in some package exports', () => {
    expect(packagesWithExports.length).toBeGreaterThan(0);
  });

  for (const { dir, manifest } of packagesWithExports) {
    it(`maps packages/${dir} to its sources`, () => {
      expect(manifest.exports?.['.']?.[sourceCondition]).toBe('./src/index.ts');
    });
  }
});
