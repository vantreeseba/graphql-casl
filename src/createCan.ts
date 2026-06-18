/**
 * The {@link createCan} factory — the central piece tying a CASL ability to the
 * `graphql-middleware` {@link Rule} layer.
 */

import type { AbilityLike, Action } from './ability.js';
import type { Rule } from './rules.js';

/**
 * The rule builder returned by {@link createCan} when a `buildSubject` tagger is
 * provided. Supports both bare-subject checks and condition objects derived from
 * resolver args via `getSubjectData`.
 *
 * @typeParam TArgs - The resolver's args type, used to type `getSubjectData`.
 */
export type RequireCan = <TArgs extends Record<string, unknown> = Record<string, unknown>>(
  action: Action,
  subject: string,
  getSubjectData?: (args: TArgs) => Record<string, unknown>,
) => Rule;

/**
 * The rule builder returned by {@link createCan} when no `buildSubject` tagger is
 * provided. Only bare-subject checks are possible: `getSubjectData` is omitted
 * because, without a tagger, the condition object would carry no `__typename`,
 * so CASL could not classify the subject and every conditioned check would
 * silently fail. Pass a `buildSubject` to `createCan` to unlock conditions.
 */
export type RequireCanBare = (action: Action, subject: string) => Rule;

/**
 * Factory that returns a `requireCan(action, subject, getSubjectData?)` rule
 * builder bound to a specific ability resolver.
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
 * @typeParam TAbility - The ability type returned by `getAbility`.
 * @param getAbility - Builds the CASL ability for a request's context.
 * @param isAuthenticated - Returns whether the context represents a logged-in caller.
 * @param buildSubject - Optional subject constructor, typically `createTyped`'s `typed`.
 * @returns A `requireCan(action, subject, getSubjectData?)` builder.
 * @example
 * ```ts
 * const canUser = createCan<Context, AppAbility>(
 *   async (ctx) => defineAbilitiesFor(ctx.userId),
 *   (ctx) => ctx.userId != null,
 *   typed,
 * );
 *
 * // bare subject:
 * const readUser = canUser(Actions.read, Subject.User);
 * // condition derived from args:
 * const updateNote = canUser<MutationUpdateNotesArgs>(
 *   Actions.update,
 *   Subject.Note,
 *   (args) => ({ userId: args.where?.userId?.eq }),
 * );
 * ```
 */
export function createCan<TContext, TAbility extends AbilityLike>(
  getAbility: (context: TContext) => Promise<TAbility>,
  isAuthenticated: (context: TContext) => boolean,
  // `type` is `any` so a narrowly-typed `typed<K extends keyof TMap>` assigns here
  // without a cast at the call site; this slot is wired once per app.
  // biome-ignore lint/suspicious/noExplicitAny: see note above
  buildSubject: (type: any, attrs: Record<string, unknown>) => unknown,
): RequireCan;
export function createCan<TContext, TAbility extends AbilityLike>(
  getAbility: (context: TContext) => Promise<TAbility>,
  isAuthenticated: (context: TContext) => boolean,
): RequireCanBare;
export function createCan<TContext, TAbility extends AbilityLike>(
  getAbility: (context: TContext) => Promise<TAbility>,
  isAuthenticated: (context: TContext) => boolean,
  // biome-ignore lint/suspicious/noExplicitAny: see overload signature above
  buildSubject?: (type: any, attrs: Record<string, unknown>) => unknown,
): RequireCan {
  return function requireCan<TArgs extends Record<string, unknown> = Record<string, unknown>>(
    action: Action,
    subject: string,
    getSubjectData?: (args: TArgs) => Record<string, unknown>,
  ): Rule {
    // Guards the footgun the overloads already forbid at the type level, for
    // callers reaching this via plain JS or a cast: a condition object with no
    // `__typename` can never be classified by CASL, so the check would silently
    // deny every request. Fail loudly at map-construction time instead.
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

      if (!ability.can(action, instance)) {
        throw new Error('Forbidden');
      }
      return resolve(parent, args, context, info);
    };
  };
}
