/**
 * The `graphql-middleware` integration layer: the {@link Rule} shape, the
 * {@link PermissionsMap} assembled from rules, and the {@link accept} / {@link deny}
 * primitives.
 */

import type { GraphQLResolveInfo } from 'graphql';
import type { IMiddlewareTypeMap } from 'graphql-middleware';

type ResolveFn = (
  parent?: unknown,
  args?: unknown,
  context?: unknown,
  info?: GraphQLResolveInfo,
  // biome-ignore lint/suspicious/noExplicitAny: resolver resolve() must return any
) => Promise<any>;

/**
 * The callable middleware form used in {@link PermissionsMap} entries.
 *
 * A rule receives the wrapped `resolve` function plus the standard resolver
 * arguments. It either calls `resolve(...)` to allow the field, or throws to
 * deny it. `createCan` produces rules that enforce CASL abilities;
 * {@link accept} and {@link deny} are the always-pass / always-fail primitives.
 */
export type Rule = (
  resolve: ResolveFn,
  parent: unknown,
  args: unknown,
  // biome-ignore lint/suspicious/noExplicitAny: accepts any concrete context type
  context: any,
  info: GraphQLResolveInfo,
  // biome-ignore lint/suspicious/noExplicitAny: resolver result is opaque to the rule
) => Promise<any>;

/**
 * An always-pass {@link Rule}: invokes the wrapped resolver unconditionally.
 * Use for public fields that need no authorization.
 */
export const accept: Rule = (resolve, parent, args, context, info) =>
  resolve(parent, args, context, info);

/**
 * An always-fail {@link Rule}: throws `Forbidden` without invoking the resolver.
 * Use to block a field for every caller.
 */
export const deny: Rule = () => {
  throw new Error('Forbidden');
};

/**
 * The permissions map passed to `graphql-middleware`'s `applyMiddleware`.
 *
 * Extends `IMiddlewareTypeMap` so it is directly assignable to `applyMiddleware`.
 * Each type key is optional and maps to either a single {@link Rule} (applied to
 * every field of the type) or a per-field map of rules.
 *
 * @typeParam TResolvers - Your generated `Resolvers` type.
 * @example
 * ```ts
 * const permissions: PermissionsMap<Resolvers> = {
 *   Query: { me: canUser(Actions.read, Subject.User) },
 *   Mutation: { requestMagicLink: accept, deleteNotes: deny },
 * };
 * ```
 */
export type PermissionsMap<TResolvers> = IMiddlewareTypeMap & {
  [TypeName in keyof TResolvers]?:
    | Rule
    | {
        [FieldName in keyof NonNullable<TResolvers[TypeName]>]?: Rule;
      };
};
