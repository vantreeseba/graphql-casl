# AGENTS.md

## Project

An npm-workspaces monorepo for the `@vantreeseba/graphql-casl` toolkit:

- **`packages/graphql-casl`** — the runtime: a `graphql-middleware` plugin for
  defining [CASL](https://casl.js.org/) permission rules on resolvers. Rules are
  declared per type/field in a `PermissionsMap` and enforced before the resolver runs.
- **`packages/graphql-casl-codegen`** — a GraphQL Code Generator plugin that emits
  subject bindings (`SubjectMap`, `Subject`, `typed`, `ability`) from a schema.

## Specifications

Deferred work is tracked per package (`packages/graphql-casl/TODO.md`) and in
`.agents/*.todo.txt`. Usage is documented in each package's README.

## Stack

- **Language:** TypeScript 5, strict mode, ESM only
- **Monorepo:** npm workspaces; run scripts at root (delegates to packages via
  `--workspaces`) or target one with `-w packages/<name>`
- **Tests:** Vitest (`npm test`)
- **Formatting/linting:** Biome (`npm run check`) — single root config, whole repo
- **Build:** `tsc` per package (`npm run build`) — outputs to each package's `dist/`
- **API docs:** TypeDoc (`npm run docs`) — `packages/graphql-casl/docs/api/`
  (generated, not committed; CI publishes them to the GitHub Wiki on `main`)
- **graphql-casl peer deps:** `@casl/ability >=6`, `graphql >=16`, `graphql-middleware >=6`;
  no runtime dependencies
- **graphql-casl-codegen peer deps:** `@graphql-codegen/plugin-helpers >=5`, `graphql >=16`
- **Releases:** per-package semantic-release via `semantic-release-monorepo`
  (each package has its own `.releaserc.json`); the release workflow matrixes over packages

## Project structure

```
packages/
  graphql-casl/
    src/
      index.ts          — public API entry point (re-exports + package overview)
      schemaTypes.ts    — type helpers derived from generated Resolvers/ResolversTypes
      rules.ts          — graphql-middleware rule layer (Rule, PermissionsMap, accept, deny)
      ability.ts        — CASL Action/Actions + the loose AbilityLike shape
      graphqlAbility.ts — GraphQLAbility, createGraphQLAbility, buildGraphQLAbility
      subjects.ts       — createSubjects / createTyped
      createCan.ts      — factory tying a CASL ability to the rule layer
    test/
      permissions.test.ts                — unit tests for the rule primitives
      graphqlAbility.test.ts             — typed ability: conditions, operators, stored-rule rehydration
      example.test.ts                    — runnable "todos" worked example / reference docs
      example.codegen.ts                 — trimmed `graphql-codegen` output the example consumes
      integration/permissions.integration.test.ts — end-to-end test against an executable schema
  graphql-casl-codegen/
    src/index.ts        — the codegen plugin (plugin + validate + config)
    test/plugin.test.ts — plugin output + config tests
vitest.config.ts (per package) — dedupes/inlines graphql so it loads as a single instance
```

## Key conventions

- All exports go through `src/index.ts`
- The library is **schema-agnostic**: type helpers (`SubjectName`, `SubjectMap`,
  `ArgsOf`, `ParentOf`, `ContextOf`) are derived from the consumer's generated
  `Resolvers` / `ResolversTypes` — never hardcode domain type names in the library
- Subjects are detected by `__typename`: `createTyped()` tags objects with a required,
  narrowed `__typename`, which CASL's `TaggedInterface` natively accepts (so no
  `__caslSubjectType__` is used)
- `GraphQLAbility<SubjectMap>` is a CASL `MongoAbility` (built via `createMongoAbility`,
  so conditions use CASL's mongo-query operators `$eq`/`$in`/`$gt`/… and its built-in
  `mongoQueryMatcher`); `createGraphQLAbility` gives statically-typed `can`/`cannot`
  conditions via a `__typename`-tagged subject tuple. There is no untyped ability path
- Rules are plain JSON: persist `builder.rules` / `ability.rules` and rehydrate with
  `buildGraphQLAbility(rules)` (for DB-backed, cached-at-startup authorization)
- `createCan` / `createSubjects` / `createTyped` are factories bound to the
  consumer's context shape and ability builder — keep auth/ability logic out of
  the library core
- `accept` and `deny` are the always-pass / always-fail rule primitives
- A failed auth check throws `Not authenticated`; a failed ability check throws `Forbidden`
- Tests live in `test/` (parallel to `src/`); integration tests go under `test/integration/`

## Commit conventions

- **Use Conventional Commits** (semantic commits) for every commit:
  `type(scope): summary`, e.g. `feat: add field-level rules`, `fix: handle null subject`,
  `docs: clarify README`, `test:`, `chore:`, `refactor:`, `ci:`.
- Keep the summary imperative and under ~72 characters; add a body when the why
  isn't obvious from the diff.
- One logical change per commit.
- Commit messages **drive releases** — `feat:` triggers a minor bump, `fix:` a
  patch, and a `BREAKING CHANGE:` footer a major. `chore:`/`docs:`/`test:`/`ci:`
  do not publish. Scope commits to the affected package so per-package release
  notes stay accurate (e.g. `feat(codegen): …`).

## CI & releases

Two GitHub Actions workflows:

- **`.github/workflows/test.yml`** — runs on every push: biome check, typecheck,
  test, coverage, build (all via root scripts that fan out to workspaces), then
  publishes TypeDoc from `packages/graphql-casl/docs/api/` to the wiki on `main`.
- **`.github/workflows/release.yml`** — runs after **Test** succeeds on `main`,
  matrixing over packages and running `npx semantic-release` in each package dir.

Releases are per-package via [semantic-release](https://semantic-release.gitbook.io/)
+ [`semantic-release-monorepo`](https://github.com/pmowrer/semantic-release-monorepo)
(each package has its own `.releaserc.json`): commit analysis is scoped to commits
touching that package's path, and tags are package-name-prefixed.

- Requires repo secret **`NPM_ACCESS_TOKEN`** (or OIDC trusted publishing).
  `GITHUB_TOKEN` is provided by Actions.
- **Migration note:** `semantic-release-monorepo` changes the tag format from
  `vX.Y.Z` to a package-prefixed tag, so the existing `graphql-casl` tag history
  isn't matched. Before the first monorepo release, seed an initial prefixed tag
  for `graphql-casl` (matching its current `0.2.0`) or its next release will jump
  to `1.0.0`. Validate with a `semantic-release --dry-run` per package.

## Running locally

```bash
npm install
npm test        # vitest across all packages
npm run build   # compile every package to its dist/
npm run check   # biome lint + format check (whole repo)

npm run test -w packages/graphql-casl-codegen  # one package
```
