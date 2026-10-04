// Export condition through which workspace packages resolve each other's
// TypeScript sources. JSON files (tsconfig.base.json and each package's
// `exports` map) cannot import it, so tests/source-condition.test.ts keeps
// them in step.
export const sourceCondition = '@kith/source';
