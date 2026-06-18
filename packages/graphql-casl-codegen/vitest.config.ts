import { defineConfig } from 'vitest/config';

// Keep graphql a single instance under vitest's SSR loader (it throws
// "another module or realm" when loaded as both CJS and ESM).
export default defineConfig({
  resolve: {
    dedupe: ['graphql'],
  },
  test: {
    server: {
      deps: {
        inline: ['graphql'],
      },
    },
  },
});
