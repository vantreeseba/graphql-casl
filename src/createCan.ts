/**
 * The {@link createCan} factory — the central piece tying a CASL ability to the
 * `graphql-middleware` {@link Rule} layer.
 */

import type { AbilityLike, Action } from './ability.js';
import type { Rule } from './rules.js';

/**
 * A subject tagger, typically `createTyped`'s `typed`: turns a subject name plus
 * field values into a `__typename`-tagged instance CASL can classify.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 */
export type BuildSubject<TSubjectMap extends Record<string, object>> = <
  K extends keyof TSubjectMap & string,
>(
  type: K,
  attrs: Partial<TSubjectMap[K]>,
) => unknown;

/**
 * The rule builder returned by {@link createCan} when a `buildSubject` tagger is
 * provided. Supports both bare-subject checks and condition checks where the
 * subject instance is built from resolver args via `getSubjectData`.
 *
 * The subject name `K` narrows `getSubjectData`'s return to that subject's fields
 * (`Partial<TSubjectMap[K]>`); annotate `getSubjectData`'s `args` parameter with
 * your generated `*Args` type to type the extraction end to end.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 */
export type RequireCan<TSubjectMap extends Record<string, object>> = <
  K extends keyof TSubjectMap & string,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
>(
  action: Action,
  subject: K,
  getSubjectData?: (args: TArgs) => Partial<TSubjectMap[K]>,
) => Rule;

/**
 * The rule builder returned by {@link createCan} when no `buildSubject` tagger is
 * provided. Only bare-subject checks are possible: `getSubjectData` is omitted
 * because, without a tagger, the built subject would carry no `__typename`, so
 * CASL could not classify it and every conditioned check would silently fail.
 * Pass a `buildSubject` to `createCan` to unlock condition checks.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 */
export type RequireCanBare<TSubjectMap extends Record<string, object>> = <
  K extends keyof TSubjectMap & string,
>(
  action: Action,
  subject: K,
) => Rule;

/**
 * Factory that returns a `requireCan(action, subject, getSubjectData?)` rule
 * builder bound to a specific ability resolver and subject map.
 *
 * This decouples the auth/ability logic from the permissions map so projects can
 * swap in any ability-building strategy. The returned builder produces a
 * {@link Rule} that:
 *
 * 1. throws `Not authenticated` when `isAuthenticated` returns `false`;
 * 2. builds the request's ability via `getAbility`;
 * 3. throws `Forbidden` when the ability denies the action;
 * 4. otherwise calls the wrapped resolver.
 *
 * When `getSubjectData` and `buildSubject` are both supplied, the checked subject
 * is `buildSubject(subject, getSubjectData(args))` (e.g. a `typed()` instance);
 * with only `getSubjectData` it is the raw data object; with neither it is the
 * bare subject-name string.
 *
 * @typeParam TContext - Your resolver context type.
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 * @param getAbility - Builds the ability for a request's context.
 * @param isAuthenticated - Returns whether the context represents a logged-in caller.
 * @param buildSubject - Optional subject constructor, typically `createTyped`'s `typed`.
 * @returns A `requireCan(action, subject, getSubjectData?)` builder.
 * @example
 * ```ts
 * const canUser = createCan<Context, AppSubjectMap>(
 *   async (ctx) => defineAbilitiesFor(ctx.userId),
 *   (ctx) => ctx.userId != null,
 *   typed,
 * );
 *
 * // bare subject:
 * const readUser = canUser(Actions.read, Subject.User);
 * // subject instance built from args (annotate `args` to type the extraction):
 * const updateNote = canUser(Actions.update, Subject.Note, (args: MutationUpdateNoteArgs) => ({
 *   userId: args.userId,
 * }));
 * ```
 */
export function createCan<TContext, TSubjectMap extends Record<string, object>>(
  getAbility: (context: TContext) => Promise<AbilityLike>,
  isAuthenticated: (context: TContext) => boolean,
  buildSubject: BuildSubject<TSubjectMap>,
): RequireCan<TSubjectMap>;
export function createCan<TContext, TSubjectMap extends Record<string, object>>(
  getAbility: (context: TContext) => Promise<AbilityLike>,
  isAuthenticated: (context: TContext) => boolean,
): RequireCanBare<TSubjectMap>;
export function createCan<TContext, TSubjectMap extends Record<string, object>>(
  getAbility: (context: TContext) => Promise<AbilityLike>,
  isAuthenticated: (context: TContext) => boolean,
  buildSubject?: BuildSubject<TSubjectMap>,
): RequireCan<TSubjectMap> {
  return function requireCan<
    K extends keyof TSubjectMap & string,
    TArgs extends Record<string, unknown> = Record<string, unknown>,
  >(action: Action, subject: K, getSubjectData?: (args: TArgs) => Partial<TSubjectMap[K]>): Rule {
    // Guards the footgun the overloads already forbid at the type level, for
    // callers reaching this via plain JS or a cast: a subject built without a
    // tagger has no `__typename`, so CASL can't classify it and the check would
    // silently deny every request. Fail loudly at map-construction time instead.
    if (getSubjectData && !buildSubject) {
      throw new Error(
        'createCan: `getSubjectData` requires a `buildSubject` tagger (e.g. `typed` from ' +
          '`createTyped`) to be passed to `createCan`; without it the subject has no ' +
          '`__typename` and CASL cannot match conditions.',
      );
    }
    return async (resolve, parent, args, context, info) => {
      if (!isAuthenticated(context)) {
        throw new Error('Not authenticated');
      }
      const ability = await getAbility(context);
      const instance =
        getSubjectData && buildSubject
          ? buildSubject(subject, getSubjectData(args as TArgs))
          : subject;

      // `instance` is an opaque subject value or name here; the ability's `can`
      // is narrowly overloaded, so check through the loose AbilityLike shape.
      if (!ability.can(action, instance)) {
        throw new Error('Forbidden');
      }
      return resolve(parent, args, context, info);
    };
  };
}
