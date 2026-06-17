# AGENTS.md

## Project

`@vantreeseba/graphql-casl` — a `graphql-middleware` plugin for defining
[CASL](https://casl.js.org/) permission rules that apply to GraphQL resolvers.
Rules are declared per type/field in a `PermissionsMap` and enforced before the
underlying resolver runs.

## Specifications

Deferred work is tracked in [TODO.md](./TODO.md). Usage is documented in
[README.md](./README.md).

## Stack

- **Language:** TypeScript 5, strict mode, ESM only
- **Tests:** Vitest (`npm test`)
- **Formatting/linting:** Biome (`npm run check`)
- **Build:** `tsc` (`npm run build`) — outputs to `dist/`
- **API docs:** TypeDoc + markdown plugin (`npm run docs`) — outputs to `docs/api/`
  (generated, not committed; built and uploaded as an artifact in CI)
- **Peer deps:** `@casl/ability >=6`, `graphql >=16`, `graphql-middleware >=6`
- **No runtime dependencies** — everything ships as peer deps

## Project structure

```
src/
  index.ts          — public API entry point (re-exports + package overview)
  schemaTypes.ts    — type helpers derived from generated Resolvers/ResolversTypes
  rules.ts          — graphql-middleware rule layer (Rule, PermissionsMap, accept, deny)
  ability.ts        — CASL Action/Actions/AppAbility/abilityOptions
  subjects.ts       — createSubjects / createTyped
  createCan.ts      — factory tying a CASL ability to the rule layer
test/
  permissions.test.ts                       — unit tests for the rule primitives
  integration/
    permissions.integration.test.ts         — end-to-end test against an executable schema
vitest.config.ts    — dedupes/inlines graphql so it loads as a single instance under vitest
```

## Key conventions

- All exports go through `src/index.ts`
- The library is **schema-agnostic**: type helpers (`SubjectName`, `SubjectMap`,
  `ArgsOf`, `ParentOf`, `ContextOf`) are derived from the consumer's generated
  `Resolvers` / `ResolversTypes` — never hardcode domain type names in the library
- Runtime subject detection uses `__typename` via `abilityOptions.detectSubjectType`,
  so consumers tag plain objects with `createTyped()` rather than CASL's `subject()`
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
  do not publish.

## CI & releases

Two GitHub Actions workflows, mirroring the rest of the `@vantreeseba` libs:

- **`.github/workflows/test.yml`** — runs on every push: `npm ci`, biome check,
  `npm run typecheck`, `npm test`, `npm run coverage`, `npm run build`.
- **`.github/workflows/release.yml`** — runs after the **Test** workflow succeeds
  on `main`, then runs `npx semantic-release`.

Releases are automated by [semantic-release](https://semantic-release.gitbook.io/)
(`.releaserc.json`): it analyzes commits, updates `CHANGELOG.md` and
`package.json`, publishes to npm, and creates a GitHub release + tag.

- Requires repo secret **`NPM_ACCESS_TOKEN`** (npm automation token). `GITHUB_TOKEN`
  is provided by Actions.
- semantic-release derives the version from git tags, **not** `package.json`. With
  no tag present its first release is `1.0.0`; to keep the intended `0.x` line,
  push an initial `v0.1.0` tag before the first release so it bumps from there.

## Running locally

```bash
npm install
npm test        # run vitest
npm run build   # compile to dist/
npm run check   # biome lint + format check
```
