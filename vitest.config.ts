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
  },
});
