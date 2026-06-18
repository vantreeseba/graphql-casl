import type { GraphQLResolveInfo } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import {
  type Action,
  Actions,
  accept,
  createCan,
  createGraphQLAbility,
  createSubjects,
  createTyped,
  deny,
  type GraphQLAbility,
} from '../src/index.js';

// An example subject map — in a real app this comes from SubjectMap<Resolvers, ResolversTypes>.
type ExampleSubjectMap = {
  Note: { id: string; userId: string };
  Org: { id: string };
};

type TestAbility = GraphQLAbility<ExampleSubjectMap>;

interface TestContext {
  userId?: string;
}

const typed = createTyped<ExampleSubjectMap>();

function buildAbility(userId: string | undefined): TestAbility {
  const { can, build } = createGraphQLAbility<ExampleSubjectMap>();
  if (!userId) return build(); // no rules ⇒ everything denied
  can(Actions.read, 'Note');
  can(Actions.update, 'Note', { userId });
  return build();
}

// A stand-in resolve info object — rules never read it, so an empty cast is fine.
const info = {} as GraphQLResolveInfo;

describe('accept / deny', () => {
  it('accept invokes resolve and returns its value', async () => {
    const resolve = vi.fn().mockResolvedValue('ok');
    await expect(accept(resolve, 'parent', 'args', {}, info)).resolves.toBe('ok');
    expect(resolve).toHaveBeenCalledWith('parent', 'args', {}, info);
  });

  it('deny always throws Forbidden', () => {
    expect(() => deny(vi.fn(), null, null, {}, info)).toThrow('Forbidden');
  });
});

describe('createCan', () => {
  const canUser = createCan<TestContext, ExampleSubjectMap>(
    async (ctx) => buildAbility(ctx.userId),
    (ctx) => ctx.userId != null,
    typed,
  );

  it('throws when the context is not authenticated', async () => {
    const rule = canUser(Actions.read, 'Note');
    await expect(rule(vi.fn(), null, {}, {}, info)).rejects.toThrow('Not authenticated');
  });

  it('allows when the ability grants the action on a bare subject', async () => {
    const resolve = vi.fn().mockResolvedValue('note');
    const rule = canUser(Actions.read, 'Note');
    await expect(rule(resolve, null, {}, { userId: 'u1' }, info)).resolves.toBe('note');
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('forbids when subject conditions do not match', async () => {
    const rule = canUser(Actions.update, 'Note', (args: { userId: string }) => ({
      userId: args.userId,
    }));
    const resolve = vi.fn();
    await expect(
      rule(resolve, null, { userId: 'someone-else' }, { userId: 'u1' }, info),
    ).rejects.toThrow('Forbidden');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('allows when subject conditions match via a typed subject', async () => {
    const resolve = vi.fn().mockResolvedValue('updated');
    const rule = canUser(Actions.update, 'Note', (args: { userId: string }) => ({
      userId: args.userId,
    }));
    await expect(rule(resolve, null, { userId: 'u1' }, { userId: 'u1' }, info)).resolves.toBe(
      'updated',
    );
  });

  it('types getSubjectData against the subject fields (compile-time)', () => {
    // @ts-expect-error `nope` is not a field of Note
    canUser(Actions.update, 'Note', (args: { x: string }) => ({ nope: args.x }));
    // a real field typechecks
    canUser(Actions.update, 'Note', (args: { userId: string }) => ({ userId: args.userId }));
    expect(true).toBe(true);
  });

  it('throws if getSubjectData is used without configuring buildSubject', () => {
    // Omitting buildSubject yields the RequireCanBare overload, which forbids
    // getSubjectData at compile time; cast past it to exercise the runtime guard.
    const canBare = createCan<TestContext, ExampleSubjectMap>(
      async (ctx) => buildAbility(ctx.userId),
      (ctx) => ctx.userId != null,
    ) as unknown as (
      action: Action,
      subject: string,
      getSubjectData: (args: unknown) => Record<string, unknown>,
    ) => unknown;
    expect(() => canBare(Actions.update, 'Note', () => ({ userId: 'u1' }))).toThrow(
      /requires a `buildSubject` tagger/,
    );
  });
});

describe('createTyped', () => {
  it('tags attrs with __typename', () => {
    expect(typed('Note', { id: '1' })).toEqual({ __typename: 'Note', id: '1' });
  });
});

describe('createSubjects', () => {
  it('returns the provided subject map unchanged', () => {
    const Subject = createSubjects<ExampleSubjectMap>()({ Note: 'Note', Org: 'Org' } as const);
    expect(Subject.Note).toBe('Note');
    expect(Subject.Org).toBe('Org');
  });
});
