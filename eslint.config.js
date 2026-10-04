import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const languageGlobals = new Set(Object.keys(globals.es2022));
const hostGlobals = [
  ...new Set([...Object.keys(globals.browser), ...Object.keys(globals.node)]),
].filter((name) => !languageGlobals.has(name));

// The engine and content must produce identical worlds from identical inputs
// on any device or server, so they may not read the clock, ambient randomness
// or anything provided by the host environment.
export const deterministicPackages = [
  'packages/engine/**',
  'packages/content/**',
];

export default tseslint.config(
  { ignores: ['**/dist/**', 'prototype/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['*.js', '*.ts', 'packages/server/**', 'packages/cortex/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/client/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: deterministicPackages,
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded RNG.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Use the simulation clock.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Use the simulation clock.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Use the simulation clock.',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...hostGlobals.map((name) => ({
          name,
          message: 'Host (DOM/Node) globals are not deterministic.',
        })),
      ],
    },
  },
  prettier,
);
