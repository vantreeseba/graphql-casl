/**
 * The {@link createCan} factory — the central piece tying a CASL ability to the
 * `graphql-middleware` {@link Rule} layer.
 */

import type { AbilityLike, Action } from './ability.js';
import type { Rule } from './rules.js';

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
 *   typed as (type: string, attrs: Record<string, unknown>) => any,
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
  buildSubject?: (type: string, attrs: Record<string, unknown>) => unknown,
) {
  return function requireCan<TArgs extends Record<string, unknown> = Record<string, unknown>>(
    action: Action,
    subject: string,
    getSubjectData?: (args: TArgs) => Record<string, unknown>,
  ): Rule {
    return async (resolve, parent, args, context, info) => {
      if (!isAuthenticated(context)) {
        throw new Error('Not authenticated');
      }
      const ability = await getAbility(context);
      const instance =
        getSubjectData && buildSubject
          ? buildSubject(subject, getSubjectData(args as TArgs))
          : getSubjectData
            ? getSubjectData(args as TArgs)
            : subject;

      if (!ability.can(action, instance)) {
        throw new Error('Forbidden');
      }
      return resolve(parent, args, context, info);
    };
  };
}
