# TODO

## Deferred from the initial version

- **Static condition typing** — `AppAbility` is `MongoAbility<[Action, any]>`
  because `__typename`-based runtime detection cannot statically type CASL
  conditions without `ForcedSubject`. Revisit once a typed subject strategy is
  in place.

- **`applyMiddleware` integration test** — current tests exercise the rule
  primitives and `createCan` directly. Add an end-to-end test that wires a
  `PermissionsMap` through `graphql-middleware` against a real executable schema.

- **Ready-made ability presets** — explore optional helpers for common
  ownership patterns (e.g. `ownsField('userId')`) so consumers write less
  boilerplate in their ability builders.
