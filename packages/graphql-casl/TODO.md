# TODO

## Deferred from the initial version

- **Ready-made ability presets** — explore optional helpers for common
  ownership patterns (e.g. `ownsField('userId')`) so consumers write less
  boilerplate in their ability builders.

- **Parent-aware `createCan` for field-level rules** — `PermissionsMap`
  already supports field-level rules graphql-shield-style (keys are
  `keyof TResolvers`, not just root types, so `{ User: { email: rule } }`
  typechecks and `graphql-middleware` enforces it per-field). However,
  `createCan`'s `getSubjectData` hook only receives `args`, not the resolved
  `parent`. So a field rule conditioned on the parent object (e.g. "only read
  `User.email` when it's your own user") can't be expressed through the
  `createCan` builder today — it requires a hand-written `Rule`, which does
  receive `parent`. Consider a parent-aware variant, e.g.
  `getSubjectData(args, parent)`, so conditioned field-level checks work
  through the builder.
