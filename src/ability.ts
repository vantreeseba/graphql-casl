/**
 * CASL action verbs and the minimal ability shape the rule layer depends on.
 *
 * The concrete typed ability lives in `./graphqlAbility.js`
 * ({@link GraphQLAbility} / {@link createGraphQLAbility}).
 */

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
 * Minimal structural type for anything with a CASL-style `can` method. Kept
 * deliberately loose so any concrete ability (e.g. a typed `GraphQLAbility`,
 * whose `can` is narrowly overloaded) satisfies it.
 */
export type AbilityLike = {
  // biome-ignore lint/suspicious/noExplicitAny: structural shim for any ability's can()
  can(...args: any[]): boolean;
};
