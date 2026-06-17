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
 * @packageDocumentation
 */

import type { MongoAbility } from '@casl/ability';
import type { GraphQLResolveInfo, GraphQLScalarType, OperationTypeNode } from 'graphql';
import type { IMiddlewareTypeMap } from 'graphql-middleware';

type RootOperations = Capitalize<`${OperationTypeNode}`>;

/**
 * Derives the domain type names from any generated `Resolvers` type by excluding:
 *
 * - Root operation types (`Query`, `Mutation`, `Subscription`)
 * - Custom scalar types (whose value is a `GraphQLScalarType` in `Resolvers`)
 *
 * The key remapping evaluates eagerly so consumers receive a concrete string
 * union, and `string &` ensures only string literal keys are retained.
 *
 * @typeParam TResolvers - Your generated `Resolvers` type.
 */
export type SubjectName<TResolvers> = string &
  keyof {
    [K in keyof TResolvers as K extends string
      ? K extends RootOperations
        ? never
        : NonNullable<TResolvers[K]> extends GraphQLScalarType
          ? never
          : K
      : never]: unknown;
  };

/**
 * Maps each domain name to a `Partial` of its model type via `TResolversTypes`.
 *
 * `Awaited<>` unwraps `ResolverTypeWrapper<T> = Promise<T> | T`, and `Partial<T>`
 * lets CASL conditions match any subset of the model's fields.
 *
 * @typeParam TResolvers - Your generated `Resolvers` type.
 * @typeParam TResolversTypes - Your generated `ResolversTypes` type.
 */
export type SubjectMap<TResolvers, TResolversTypes> = {
  [K in SubjectName<TResolvers>]: K extends keyof TResolversTypes
    ? Partial<Awaited<TResolversTypes[K]>>
    : never;
};

/**
 * Extracts the parent (the object being resolved) from a generated resolver field.
 *
 * @typeParam TResolverField - A field of a generated `*Resolvers` type.
 * @example
 * ```ts
 * type F = NoteResolvers['id'];
 * type P = ParentOf<F>; // Note
 * ```
 */
export type ParentOf<TResolverField> = TResolverField extends (
  parent: infer TParent,
  ...rest: unknown[]
) => unknown
  ? TParent
  : unknown;

/**
 * Extracts the args type from a generated resolver field. Falls back to
 * `Record<string, unknown>` for fields that take no args.
 *
 * @typeParam TResolverField - A field of a generated `*Resolvers` type.
 * @example
 * ```ts
 * type M = MutationResolvers['updateUsers'];
 * type A = ArgsOf<M>; // MutationUpdateUsersArgs
 * ```
 */
export type ArgsOf<TResolverField> = TResolverField extends (
  parent: unknown,
  args: infer TArgs,
  ...rest: unknown[]
) => unknown
  ? TArgs
  : Record<string, unknown>;

/**
 * Extracts the context type from a generated resolver field.
 *
 * @typeParam TResolverField - A field of a generated `*Resolvers` type.
 * @example
 * ```ts
 * type M = MutationResolvers['updateUsers'];
 * type C = ContextOf<M>; // Context
 * ```
 */
export type ContextOf<TResolverField> = TResolverField extends (
  parent: unknown,
  args: unknown,
  context: infer TContext,
  ...rest: unknown[]
) => unknown
  ? TContext
  : unknown;

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
 * deny it. {@link createCan} produces rules that enforce CASL abilities;
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

/**
 * CASL options to pass to `createMongoAbility` / `AbilityBuilder.build`.
 *
 * `detectSubjectType` reads `__typename`, so subjects tagged by {@link createTyped}
 * are resolved at runtime without CASL's `ForcedSubject`.
 */
export const abilityOptions = {
  detectSubjectType: (obj: Record<PropertyKey, unknown>) => obj.__typename as string,
};

/** Minimal structural type for anything with a CASL-style `can` method. */
export type AbilityLike = {
  can(action: string, subject: unknown): boolean;
};

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
 * @param buildSubject - Optional subject constructor, typically {@link createTyped}'s `typed`.
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

/**
 * Returns a helper that validates a subject-name const object against the keys
 * of `TMap`.
 *
 * The object's keys must exactly cover the derived domain type names — TypeScript
 * errors if any are missing or misspelled. Values equal keys so each entry can be
 * used directly in CASL calls.
 *
 * @typeParam TMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 * @example
 * ```ts
 * const Subject = createSubjects<AppSubjectMap>()({
 *   User: 'User', Note: 'Note', Org: 'Org', OrgMember: 'OrgMember',
 * } as const);
 *
 * ability.can('read', Subject.User); // typed literal 'User', not plain string
 * ```
 */
export function createSubjects<TMap extends Record<string, object>>() {
  return function subjects<T extends Record<string & keyof TMap, string & keyof TMap>>(map: T): T {
    return map;
  };
}

/**
 * Returns a `typed(type, attrs)` helper bound to a specific {@link SubjectMap}.
 *
 * Call once at the app level to tag plain objects with `__typename` so CASL's
 * `detectSubjectType` (see {@link abilityOptions}) can resolve them at runtime.
 *
 * @typeParam TMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 * @example
 * ```ts
 * const typed = createTyped<AppSubjectMap>();
 * ability.can('update', typed('User', { id: targetId }));
 * ```
 */
export function createTyped<TMap extends Record<string, object>>() {
  return function typed<K extends string & keyof TMap>(
    type: K,
    attrs: Record<string, unknown>,
  ): TMap[keyof TMap] {
    return { __typename: type, ...attrs } as unknown as TMap[keyof TMap];
  };
}
