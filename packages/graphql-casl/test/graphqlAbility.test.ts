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
  type GraphQLRule,
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
