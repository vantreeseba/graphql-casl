# graphql-casl

A monorepo for the `@vantreeseba/graphql-casl` toolkit — CASL permission rules
for GraphQL resolvers.

## Packages

| Package | Description |
|---|---|
| [`@vantreeseba/graphql-casl`](./packages/graphql-casl) | The runtime: a `graphql-middleware` plugin for defining CASL permission rules on resolvers. See its [README](./packages/graphql-casl/README.md). |
| [`@vantreeseba/graphql-casl-codegen`](./packages/graphql-casl-codegen) | A GraphQL Code Generator plugin that emits subject bindings from your schema. See its [README](./packages/graphql-casl-codegen/README.md). |

## Development

This is an npm-workspaces monorepo.

```bash
npm install
npm run build        # build every package
npm test             # test every package
npm run typecheck    # type-check every package
npm run typecheck:tests
npm run check        # biome lint + format check (whole repo)
```

Run a script in a single package with `-w`:

```bash
npm run test -w packages/graphql-casl-codegen
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and
drive automated, per-package releases via
[semantic-release](https://semantic-release.gitbook.io/) +
[`semantic-release-monorepo`](https://github.com/pmowrer/semantic-release-monorepo).
