import { defineConfig } from 'vitest/config';

// graphql throws "another module or realm" when it is loaded more than once.
// Under vitest's SSR loader the package can be pulled in as both CJS and ESM,
// so dedupe it to a single instance and inline it (plus the graphql-tools /
// middleware packages that also import it) through vitest's transform.
export default defineConfig({
  resolve: {
    dedupe: ['graphql'],
  },
  test: {
    server: {
      deps: {
        inline: ['graphql', /@graphql-tools\//, 'graphql-middleware'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // schemaTypes.ts is type-only (erased at runtime); it is exercised by the
      // type-checked tests, not at runtime, so it has nothing to cover here.
      exclude: ['src/schemaTypes.ts'],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
