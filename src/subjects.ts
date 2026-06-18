/**
 * Subject helpers: bind a const subject map and a `typed()` tagger to a specific
 * {@link SubjectMap}. No external dependencies.
 *
 * @see {@link SubjectMap} from `./schemaTypes.js` for deriving `TMap`.
 */

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
 * Returns a `typed(type, attrs)` helper bound to a specific subject map.
 *
 * Call once at the app level to tag plain objects with `__typename` so CASL's
 * `detectSubjectType` (see `abilityOptions`) can resolve them at runtime.
 *
 * @typeParam TMap - The subject map, e.g. `SubjectMap<Resolvers, ResolversTypes>`.
 * @example
 * ```ts
 * const typed = createTyped<AppSubjectMap>();
 * ability.can('update', typed('User', { id: targetId }));
 * ```
 */
export function createTyped<TMap extends Record<string, object>>() {
  return function typed<K extends string & keyof TMap>(type: K, attrs: Partial<TMap[K]>): TMap[K] {
    return { __typename: type, ...attrs } as TMap[K];
  };
}
