/**
 * CASL-specific pieces: the {@link Action} verbs, the {@link AppAbility} shape,
 * and the {@link abilityOptions} that wire `__typename`-based subject detection.
 */

import type { MongoAbility } from '@casl/ability';

/** The CASL action verbs supported by this middleware. */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage';

/**
 * Const object holding every {@link Action} value — use instead of raw strings
 * in `can`/`cannot` calls and rule definitions to get autocomplete and catch
 * typos at compile time.
 *
 * The `satisfies` clause validates full coverage: TypeScript errors if `Action`
 * gains a new value and this object is not updated.
 */
export const Actions = {
  create: 'create',
  read: 'read',
  update: 'update',
  delete: 'delete',
  manage: 'manage',
} as const satisfies Record<Action, Action>;

/**
 * The ability shape used throughout the middleware.
 *
 * Uses `MongoAbility<[Action, any]>` because `__typename`-based runtime subject
 * detection cannot provide static condition typing without CASL's `ForcedSubject`.
 */
// biome-ignore lint/suspicious/noExplicitAny: see type doc above
export type AppAbility = MongoAbility<[Action, any]>;

/** Minimal structural type for anything with a CASL-style `can` method. */
export type AbilityLike = {
  can(action: string, subject: unknown): boolean;
};

/**
 * CASL options to pass to `createMongoAbility` / `AbilityBuilder.build`.
 *
 * `detectSubjectType` reads `__typename`, so subjects tagged by `createTyped`
 * are resolved at runtime without CASL's `ForcedSubject`.
 */
export const abilityOptions = {
  detectSubjectType: (obj: Record<PropertyKey, unknown>) => obj.__typename as string,
};
