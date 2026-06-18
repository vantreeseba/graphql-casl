/**
 * Tests for the schema-typed ability: `createGraphQLAbility` builds a CASL
 * ability with the GraphQL conditions matcher and `__typename` detection applied
 * automatically; `buildGraphQLAbility` rehydrates one from stored rules; and
 * `GraphQLAbility` types `can`/`cannot` conditions against each subject's fields.
 *
 * Compile-time expectations use `@ts-expect-error` (enforced under
 * `npm run typecheck:tests`); each is paired with a runtime assertion.
 */

import { describe, expect, it } from 'vitest';
import {
  buildGraphQLAbility,
  createGraphQLAbility,
  createTyped,
  type GqlConditions,
  type GraphQLRule,
  gqlConditionsMatcher,
  type SubjectMap,
} from '../src/index.js';
import type { Resolvers, ResolversTypes } from './example.codegen.js';

// Derived straight from the generated types — `{ Todo: Partial<Todo> }` here.
type AppSubjectMap = SubjectMap<Resolvers, ResolversTypes>;

const typed = createTyped<AppSubjectMap>();

describe('createGraphQLAbility', () => {
  it('builds an ability with __typename detection applied automatically', () => {
    const { can, build } = createGraphQLAbility<AppSubjectMap>();
    can('read', 'Todo');
    const ability = build(); // no options passed by hand

    expect(ability.can('read', typed('Todo', { id: 't1' }))).toBe(true);
    expect(ability.can('delete', typed('Todo', { id: 't1' }))).toBe(false);
  });

  it('matches bare-value conditions as equality', () => {
    const { can, build } = createGraphQLAbility<AppSubjectMap>();
    can('update', 'Todo', { ownerId: 'alice' });
    const ability = build();

    expect(ability.can('update', typed('Todo', { ownerId: 'alice' }))).toBe(true);
    expect(ability.can('update', typed('Todo', { ownerId: 'bob' }))).toBe(false);
  });

  it('supports the in operator', () => {
    const { can, build } = createGraphQLAbility<AppSubjectMap>();
    can('read', 'Todo', { ownerId: { in: ['alice', 'bob'] } });
    const ability = build();

    expect(ability.can('read', typed('Todo', { ownerId: 'bob' }))).toBe(true);
    expect(ability.can('read', typed('Todo', { ownerId: 'carol' }))).toBe(false);
  });

  it('supports the ne operator', () => {
    const { can, build } = createGraphQLAbility<AppSubjectMap>();
    can('read', 'Todo', { title: { ne: 'secret' } });
    const ability = build();

    expect(ability.can('read', typed('Todo', { title: 'public' }))).toBe(true);
    expect(ability.can('read', typed('Todo', { title: 'secret' }))).toBe(false);
  });

  it('allows manage/all rules', () => {
    const { can, build } = createGraphQLAbility<AppSubjectMap>();
    can('manage', 'all');
    const ability = build();

    expect(ability.can('delete', typed('Todo', { id: 't1' }))).toBe(true);
  });

  it('denies everything when no rules are defined', () => {
    const ability = createGraphQLAbility<AppSubjectMap>().build();
    expect(ability.can('read', typed('Todo', { id: 't1' }))).toBe(false);
  });
});

describe('buildGraphQLAbility (stored rules)', () => {
  it('rehydrates an ability from serialized rules', () => {
    const { can, build } = createGraphQLAbility<AppSubjectMap>();
    can('update', 'Todo', { ownerId: 'alice' });

    // round-trip the rules through JSON, as a DB-backed store would.
    const stored: GraphQLRule<AppSubjectMap>[] = JSON.parse(JSON.stringify(build().rules));
    const ability = buildGraphQLAbility<AppSubjectMap>(stored);

    expect(ability.can('update', typed('Todo', { ownerId: 'alice' }))).toBe(true);
    expect(ability.can('update', typed('Todo', { ownerId: 'bob' }))).toBe(false);
  });
});

describe('typed conditions (compile-time)', () => {
  it('rejects unknown condition fields and cross-subject fields', () => {
    const { can } = createGraphQLAbility<AppSubjectMap>();

    // @ts-expect-error `nope` is not a field of Todo
    can('update', 'Todo', { nope: 'x' });
    // valid calls still typecheck
    can('update', 'Todo', { ownerId: 'x' });
    can('read', 'Todo', { done: { ne: true } });

    expect(true).toBe(true);
  });
});

describe('gqlConditionsMatcher', () => {
  // The matcher operates on plain objects; cast loosely so we can exercise every
  // operator and value type directly, independent of any subject map.
  const matches = (conditions: object, subject: object) =>
    gqlConditionsMatcher(conditions as GqlConditions)(subject as Record<PropertyKey, unknown>);

  it('matches a bare value as equality', () => {
    expect(matches({ n: 1 }, { n: 1 })).toBe(true);
    expect(matches({ n: 1 }, { n: 2 })).toBe(false);
  });

  it('eq / ne', () => {
    expect(matches({ n: { eq: 1 } }, { n: 1 })).toBe(true);
    expect(matches({ n: { eq: 1 } }, { n: 2 })).toBe(false);
    expect(matches({ n: { ne: 1 } }, { n: 2 })).toBe(true);
    expect(matches({ n: { ne: 1 } }, { n: 1 })).toBe(false);
  });

  it('in / nin', () => {
    expect(matches({ s: { in: ['a', 'b'] } }, { s: 'b' })).toBe(true);
    expect(matches({ s: { in: ['a', 'b'] } }, { s: 'c' })).toBe(false);
    expect(matches({ s: { nin: ['a', 'b'] } }, { s: 'c' })).toBe(true);
    expect(matches({ s: { nin: ['a', 'b'] } }, { s: 'a' })).toBe(false);
    // `in` with a non-array operand never matches
    expect(matches({ s: { in: 'nope' } }, { s: 'n' })).toBe(false);
    // `nin` with a non-array operand imposes no constraint
    expect(matches({ s: { nin: 'nope' } }, { s: 'n' })).toBe(true);
  });

  it('gt / gte / lt / lte on numbers', () => {
    expect(matches({ n: { gt: 2 } }, { n: 3 })).toBe(true);
    expect(matches({ n: { gt: 2 } }, { n: 2 })).toBe(false);
    expect(matches({ n: { gte: 2 } }, { n: 2 })).toBe(true);
    expect(matches({ n: { gte: 2 } }, { n: 1 })).toBe(false);
    expect(matches({ n: { lt: 2 } }, { n: 1 })).toBe(true);
    expect(matches({ n: { lt: 2 } }, { n: 2 })).toBe(false);
    expect(matches({ n: { lte: 2 } }, { n: 2 })).toBe(true);
    expect(matches({ n: { lte: 2 } }, { n: 3 })).toBe(false);
  });

  it('orders strings and Dates', () => {
    expect(matches({ s: { gt: 'a' } }, { s: 'b' })).toBe(true);
    expect(matches({ s: { lt: 'b' } }, { s: 'a' })).toBe(true);
    expect(matches({ s: { gte: 'a' } }, { s: 'a' })).toBe(true); // equal strings → 0
    const at = (iso: string) => new Date(iso);
    expect(matches({ at: { gte: at('2020-01-01') } }, { at: at('2021-01-01') })).toBe(true);
    expect(matches({ at: { lte: at('2020-01-01') } }, { at: at('2019-01-01') })).toBe(true);
  });

  it('never satisfies an ordering operator for non-comparable values', () => {
    expect(matches({ n: { gt: 1 } }, { n: 'x' })).toBe(false); // string vs number
    expect(matches({ n: { lt: 1 } }, { n: undefined })).toBe(false);
    expect(matches({ n: { gte: 1 } }, {})).toBe(false); // missing field
  });

  it('ANDs multiple field conditions', () => {
    expect(matches({ a: 1, b: { gt: 0 } }, { a: 1, b: 5 })).toBe(true);
    expect(matches({ a: 1, b: { gt: 0 } }, { a: 1, b: -1 })).toBe(false);
  });

  it('treats a non-operator object value as (reference) equality', () => {
    const shared = { foo: 1 };
    expect(matches({ obj: shared }, { obj: shared })).toBe(true);
    expect(matches({ obj: { foo: 1 } }, { obj: { foo: 1 } })).toBe(false);
  });

  it('an empty condition object matches anything', () => {
    expect(matches({}, { anything: true })).toBe(true);
  });
});
