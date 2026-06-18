/**
 * The schema-typed ability. {@link GraphQLAbility} is a CASL ability built on the
 * pure `Ability` base (not `MongoAbility`) with a GraphQL-oriented conditions
 * language and `__typename` subject detection. {@link createGraphQLAbility}
 * returns a builder whose `can`/`cannot` type their conditions against each
 * subject's fields; {@link buildGraphQLAbility} reconstructs an ability from
 * stored {@link GraphQLRule}s.
 *
 * Subjects are discriminated by `__typename` — CASL's `TaggedInterface` natively
 * accepts a required `__typename` tag, so no `__caslSubjectType__` is needed.
 * Rules are plain JSON ({@link GraphQLRule}), so they can be persisted in a
 * database and loaded/cached at startup.
 */

import {
  Ability,
  AbilityBuilder,
  type AbilityOptionsOf,
  type ConditionsMatcher,
  type Container,
  type GenericFactory,
  type MatchConditions,
  type RawRuleOf,
} from '@casl/ability';
import type { Action } from './ability.js';

// --- Conditions language ----------------------------------------------------

/**
 * Operator object for a single field condition. Every operator is plain JSON, so
 * a condition built from these is serializable and storable.
 *
 * @typeParam V - The field's value type.
 */
export interface GqlOperators<V> {
  /** Field strictly equals the value (same as a bare value). */
  eq?: V;
  /** Field is not strictly equal to the value. */
  ne?: V;
  /** Field is one of the values. */
  in?: readonly V[];
  /** Field is none of the values. */
  nin?: readonly V[];
  /** Field is greater than the value (numbers, strings, or `Date`s). */
  gt?: V;
  /** Field is greater than or equal to the value. */
  gte?: V;
  /** Field is less than the value. */
  lt?: V;
  /** Field is less than or equal to the value. */
  lte?: V;
}

/** A field condition: either a bare value (equality) or a {@link GqlOperators} object. */
export type GqlFieldCondition<V> = V | GqlOperators<V>;

/**
 * The condition object for a single subject: every field is optional and typed
 * to its own value type.
 *
 * @typeParam T - The subject's model type.
 */
export type GqlConditionsFor<T> = {
  [K in keyof T]?: GqlFieldCondition<T[K]>;
};

// HKT factory so CASL's AbilityBuilder narrows conditions per subject instance.
interface GqlConditionsFactory extends GenericFactory {
  produce: GqlConditionsFor<this[0]>;
}

/**
 * The conditions generic carried by a {@link GraphQLAbility}. The `Container`
 * intersection plugs into CASL's higher-kinded machinery so `can`/`cannot` infer
 * {@link GqlConditionsFor} the specific subject; at runtime it is a plain object.
 *
 * @typeParam T - The subject's model type (inferred by CASL per call).
 */
export type GqlConditions<T extends object = Record<PropertyKey, unknown>> = GqlConditionsFor<T> &
  Container<GqlConditionsFactory>;

// --- Conditions matcher -----------------------------------------------------

const OPERATOR_KEYS = ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte'] as const;
type OperatorKey = (typeof OPERATOR_KEYS)[number];
const OPERATOR_SET: ReadonlySet<string> = new Set(OPERATOR_KEYS);

function isOperatorObject(cond: unknown): cond is GqlOperators<unknown> {
  if (cond === null || typeof cond !== 'object' || Array.isArray(cond)) return false;
  return Object.keys(cond).every((key) => OPERATOR_SET.has(key));
}

/** Orders two values; `undefined` when they are not mutually comparable. */
function compare(actual: unknown, expected: unknown): number | undefined {
  if (typeof actual === 'number' && typeof expected === 'number') return actual - expected;
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual < expected ? -1 : actual > expected ? 1 : 0;
  }
  if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() - expected.getTime();
  }
  return undefined;
}

function matchOperators(actual: unknown, ops: GqlOperators<unknown>): boolean {
  for (const key of Object.keys(ops) as OperatorKey[]) {
    const expected = (ops as Record<OperatorKey, unknown>)[key];
    switch (key) {
      case 'eq':
        if (actual !== expected) return false;
        break;
      case 'ne':
        if (actual === expected) return false;
        break;
      case 'in':
        if (!Array.isArray(expected) || !expected.includes(actual)) return false;
        break;
      case 'nin':
        if (Array.isArray(expected) && expected.includes(actual)) return false;
        break;
      case 'gt': {
        const order = compare(actual, expected);
        if (order === undefined || order <= 0) return false;
        break;
      }
      case 'gte': {
        const order = compare(actual, expected);
        if (order === undefined || order < 0) return false;
        break;
      }
      case 'lt': {
        const order = compare(actual, expected);
        if (order === undefined || order >= 0) return false;
        break;
      }
      case 'lte': {
        const order = compare(actual, expected);
        if (order === undefined || order > 0) return false;
        break;
      }
    }
  }
  return true;
}

function matchField(actual: unknown, cond: unknown): boolean {
  return isOperatorObject(cond) ? matchOperators(actual, cond) : actual === cond;
}

/**
 * The GraphQL-oriented conditions matcher used by {@link GraphQLAbility} in place
 * of CASL's mongo-query matcher. A rule's condition object matches a subject when
 * every field condition holds (bare value ⇒ equality; otherwise the
 * {@link GqlOperators} apply). Exported for advanced/manual ability construction.
 */
export const gqlConditionsMatcher: ConditionsMatcher<GqlConditions> = (conditions) => {
  const entries = Object.entries(conditions as Record<string, unknown>);
  const match = (subject: Record<PropertyKey, unknown>) =>
    entries.every(([field, cond]) => matchField(subject?.[field], cond));
  return match as unknown as MatchConditions;
};

// --- The ability ------------------------------------------------------------

/** Requires a literal `__typename` so CASL classifies the subject (type-level). */
type Tagged<K extends string, T> = T & { __typename: K };

/**
 * The CASL ability-tuple union derived from a {@link SubjectMap}: each subject
 * name `K` is paired with both its `__typename`-tagged object type and the bare
 * string literal, plus a `[Action, 'all']` member for `manage`/`all`-style rules.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 */
export type GraphQLAbilities<TSubjectMap extends Record<string, object>> =
  | {
      [K in keyof TSubjectMap & string]: [Action, Tagged<K, TSubjectMap[K]> | K];
    }[keyof TSubjectMap & string]
  | [Action, 'all'];

/**
 * A CASL ability whose conditions are statically typed against your schema.
 * Built on the pure `Ability` base with {@link gqlConditionsMatcher} and
 * `__typename` detection — `can('update', 'Note', { userId })` only accepts
 * fields that exist on `Note`.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 */
export type GraphQLAbility<TSubjectMap extends Record<string, object>> = Ability<
  GraphQLAbilities<TSubjectMap>,
  GqlConditions
>;

/**
 * A single serializable permission rule for a {@link GraphQLAbility}. This is a
 * plain JSON object (`action`, `subject`, optional `conditions`, `inverted`,
 * `fields`, `reason`), so a set of rules can be persisted in a database and
 * rehydrated with {@link buildGraphQLAbility} at app start.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 */
export type GraphQLRule<TSubjectMap extends Record<string, object>> = RawRuleOf<
  GraphQLAbility<TSubjectMap>
>;

/** Options accepted by {@link buildGraphQLAbility} / the builder's `build()`. */
export type GraphQLAbilityOptions<TSubjectMap extends Record<string, object>> = Partial<
  AbilityOptionsOf<GraphQLAbility<TSubjectMap>>
>;

function gqlAbilityOptions<TSubjectMap extends Record<string, object>>(
  overrides?: GraphQLAbilityOptions<TSubjectMap>,
): AbilityOptionsOf<GraphQLAbility<TSubjectMap>> {
  return {
    conditionsMatcher: gqlConditionsMatcher,
    detectSubjectType: (subject: { __typename: string }) => subject.__typename,
    ...overrides,
    // Cast bridges our broad `__typename: string` reader to CASL's literal
    // `ExtractSubjectType` return; detection is validated by tests instead.
  } as AbilityOptionsOf<GraphQLAbility<TSubjectMap>>;
}

/**
 * Reconstructs a {@link GraphQLAbility} from previously-stored {@link GraphQLRule}s
 * — the path for loading rules persisted in a database (and caching them) at app
 * start. Applies {@link gqlConditionsMatcher} and `__typename` detection.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 * @param rules - The stored rules.
 * @param options - Extra CASL ability options to override or extend the defaults.
 * @example
 * ```ts
 * const rules: GraphQLRule<AppSubjectMap>[] = await db.loadPermissionRules();
 * const ability = buildGraphQLAbility<AppSubjectMap>(rules);
 * ```
 */
export function buildGraphQLAbility<TSubjectMap extends Record<string, object>>(
  rules: GraphQLRule<TSubjectMap>[],
  options?: GraphQLAbilityOptions<TSubjectMap>,
): GraphQLAbility<TSubjectMap> {
  return new Ability<GraphQLAbilities<TSubjectMap>, GqlConditions>(
    rules,
    gqlAbilityOptions(options),
  );
}

/**
 * Creates a CASL `AbilityBuilder` typed against your {@link SubjectMap}, with the
 * GraphQL conditions matcher and `__typename` detection applied by `build()`.
 *
 * The returned builder's `can` / `cannot` type their conditions per subject (see
 * {@link GraphQLAbility}). Read `builder.rules` (or `ability.rules`) to persist
 * the rules and later rehydrate them with {@link buildGraphQLAbility}.
 *
 * @typeParam TSubjectMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 * @returns A typed `AbilityBuilder` whose `build()` wires the GraphQL defaults.
 * @example
 * ```ts
 * type AppSubjectMap = SubjectMap<Resolvers, ResolversTypes>;
 *
 * function defineAbilitiesFor(userId: string | undefined) {
 *   const { can, cannot, build } = createGraphQLAbility<AppSubjectMap>();
 *   if (!userId) return build(); // no rules ⇒ everything denied
 *   can('read', 'Note');
 *   can('update', 'Note', { userId });             // bare equality
 *   can('read', 'Note', { status: { in: ['live'] } }); // operators
 *   return build();
 * }
 * ```
 */
export function createGraphQLAbility<TSubjectMap extends Record<string, object>>() {
  const builder = new AbilityBuilder<GraphQLAbility<TSubjectMap>>(Ability);
  const build = builder.build;
  builder.build = (options?: GraphQLAbilityOptions<TSubjectMap>) =>
    build(gqlAbilityOptions(options));
  return builder;
}
