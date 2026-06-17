/**
 * graphql-casl — generic CASL permissions middleware for GraphQL resolvers.
 *
 * Everything here is schema-agnostic: pass your own generated `Resolvers` /
 * `ResolversTypes` to the type helpers and you get a fully-derived subject
 * union without any manual type listing. The runtime helpers (`createCan`,
 * `createTyped`, `createSubjects`, `accept`, `deny`) are bound to your app's
 * context shape and ability builder at call time.
 *
 * `AppAbility` uses `MongoAbility<[Action, any]>` because `__typename`-based
 * runtime subject detection cannot provide static condition typing without
 * CASL's `ForcedSubject`.
 *
 * Modules:
 * - `schemaTypes` — type helpers derived from generated `Resolvers`/`ResolversTypes`
 * - `rules` — the `graphql-middleware` rule layer (`Rule`, `PermissionsMap`, `accept`, `deny`)
 * - `ability` — CASL `Action`/`Actions`/`AppAbility`/`abilityOptions`
 * - `subjects` — `createSubjects` / `createTyped`
 * - `createCan` — the factory tying abilities to rules
 *
 * @packageDocumentation
 */

export type { AbilityLike, Action, AppAbility } from './ability.js';
export { Actions, abilityOptions } from './ability.js';
export { createCan } from './createCan.js';
export type { PermissionsMap, Rule } from './rules.js';
export { accept, deny } from './rules.js';
export type { ArgsOf, ContextOf, ParentOf, SubjectMap, SubjectName } from './schemaTypes.js';
export { createSubjects, createTyped } from './subjects.js';
