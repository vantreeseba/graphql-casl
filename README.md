# @vantreeseba/graphql-casl

A [`graphql-middleware`](https://github.com/dimagi/graphql-middleware) plugin for
defining [CASL](https://casl.js.org/) permission rules that apply to your GraphQL
resolvers. Declare rules per type/field in a `PermissionsMap`; each rule runs
before the underlying resolver and throws if the request is not allowed.

The library is **schema-agnostic** — the subject names and condition types are
derived from your own generated `Resolvers` / `ResolversTypes`, so there is no
manual type listing.

## Install

```bash
npm install @vantreeseba/graphql-casl
# peer deps
npm install @casl/ability graphql graphql-middleware
```

## Concepts

| Export | What it does |
|---|---|
| `createCan(getAbility, isAuthenticated, buildSubject?)` | Factory that returns a `requireCan(action, subject, getSubjectData?)` rule builder, bound to your context shape and ability builder. |
| `createTyped<SubjectMap>()` | Returns a `typed(type, attrs)` helper that tags plain objects with `__typename` for CASL's runtime subject detection. |
| `createSubjects<SubjectMap>()` | Validates a subject-name const object against your schema's domain types. |
| `accept` / `deny` | Always-pass / always-fail rule primitives. |
| `abilityOptions` | `detectSubjectType` config (reads `__typename`) to pass to `createMongoAbility`. |
| `Actions` | Const map of `create` / `read` / `update` / `delete` / `manage`. |

Type helpers: `PermissionsMap`, `Rule`, `SubjectName`, `SubjectMap`, `ArgsOf`,
`ParentOf`, `ContextOf`, `Action`, `AppAbility`, `AbilityLike`.

A failed authentication check throws `Not authenticated`; a failed ability check
throws `Forbidden`.

## Usage

### 1. Build abilities

Bind the generic helpers to your app's generated types and define abilities with
CASL's `AbilityBuilder`. Subjects are tagged by `__typename`, so use
`abilityOptions` when building.

```ts
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import {
  Actions,
  abilityOptions,
  createSubjects,
  createTyped,
  type AppAbility,
  type SubjectMap,
} from '@vantreeseba/graphql-casl';
import type { Resolvers, ResolversTypes } from './__generated__/resolvers.js';

type AppSubjectMap = SubjectMap<Resolvers, ResolversTypes>;

export const typed = createTyped<AppSubjectMap>();
export const Subject = createSubjects<AppSubjectMap>()({
  User: 'User',
  Note: 'Note',
} as const);

export function defineAbilitiesFor(userId: string | undefined): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  if (!userId) {
    cannot(Actions.manage, 'all');
    return build(abilityOptions);
  }
  can(Actions.read, Subject.Note);
  can(Actions.update, Subject.Note, { userId }); // condition on the subject's fields
  return build(abilityOptions);
}
```

### 2. Bind `createCan` to your context

```ts
import { createCan } from '@vantreeseba/graphql-casl';
import type { Context } from './context.js';
import { defineAbilitiesFor, typed } from './abilities.js';

const canUser = createCan<Context, AppAbility>(
  async (ctx) => defineAbilitiesFor(ctx.userId),
  (ctx) => ctx.userId != null,
  // biome-ignore lint: typed<K> generic can't widen to (string) at the call site
  typed as (type: string, attrs: Record<string, unknown>) => any,
);
```

### 3. Declare the permissions map

`getSubjectData` pulls condition values out of the resolver args; without it the
rule checks against the bare subject type.

```ts
import { accept, deny, type PermissionsMap } from '@vantreeseba/graphql-casl';
import type { Resolvers, MutationUpdateNotesArgs } from './__generated__/resolvers.js';

export const permissions: PermissionsMap<Resolvers> = {
  Query: {
    note: canUser(Actions.read, Subject.Note),
    me: canUser(Actions.read, Subject.User),
  },
  Mutation: {
    requestMagicLink: accept, // public
    deleteNotes: deny,        // nobody, ever
    updateNotes: canUser<MutationUpdateNotesArgs>(Actions.update, Subject.Note, (args) => ({
      userId: args.where?.userId?.eq,
    })),
  },
};
```

### 4. Apply as middleware

```ts
import { applyMiddleware } from 'graphql-middleware';

const schemaWithPermissions = applyMiddleware(schema, permissions);
```

## Development

```bash
npm install
npm test        # run vitest
npm run coverage # run vitest with coverage
npm run typecheck # tsc --noEmit
npm run build   # compile to dist/
npm run check   # biome lint + format check
npm run docs    # generate the Markdown API reference into docs/api/
```

## API reference

Every export carries JSDoc. Generate a full Markdown API reference with
[TypeDoc](https://typedoc.org/) + the Markdown plugin:

```bash
npm run docs   # writes docs/api/ (git-ignored)
```

The docs are not committed; CI builds them on every push and uploads them as a
workflow artifact.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and
drive automated releases: pushes to `main` run the **Test** workflow, and on
success the **Release** workflow runs [semantic-release](https://semantic-release.gitbook.io/)
to version, changelog, publish to npm, and tag a GitHub release.

See [TODO.md](./TODO.md) for deferred work.
