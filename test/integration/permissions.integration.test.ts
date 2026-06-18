/**
 * End-to-end test: wire a PermissionsMap through graphql-middleware against a
 * real executable schema and run queries/mutations as different callers.
 */

import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { type GraphQLSchema, graphql } from 'graphql';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type Action,
  Actions,
  abilityOptions,
  accept,
  applyPermissions,
  createCan,
  createTyped,
  deny,
  type PermissionsMap,
} from '../../src/index.js';

// --- The app's domain model -------------------------------------------------

interface Note {
  id: string;
  userId: string;
  body: string;
}

const SEED: readonly Note[] = [
  { id: 'n1', userId: 'alice', body: 'alice note' },
  { id: 'n2', userId: 'bob', body: 'bob note' },
];

// Resolvers mutate notes in place, so this is reset before each test (see beforeEach).
let NOTES: Note[];

// --- Request context + ability builder -------------------------------------

interface Context {
  userId?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: see AppAbility doc in src/ability.ts
type AppAbility = MongoAbility<[Action, any]>;

type AppSubjectMap = {
  User: { id: string };
  Note: Note;
};

const typed = createTyped<AppSubjectMap>();

function defineAbilitiesFor(userId: string | undefined): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  if (!userId) {
    cannot(Actions.manage, 'all');
    return build(abilityOptions);
  }
  can(Actions.read, 'User');
  can(Actions.read, 'Note');
  // Callers may only update their own notes.
  can(Actions.update, 'Note', { userId });
  return build(abilityOptions);
}

const canUser = createCan<Context, AppAbility>(
  async (ctx) => defineAbilitiesFor(ctx.userId),
  (ctx) => ctx.userId != null,
  typed,
);

// --- The schema + resolvers -------------------------------------------------

const typeDefs = /* GraphQL */ `
  type Query {
    me: User
    notes: [Note!]!
    secret: String
  }
  type Mutation {
    updateNote(id: ID!, userId: ID!, body: String!): Note
    deleteNote(id: ID!): Boolean
  }
  type User {
    id: ID!
  }
  type Note {
    id: ID!
    userId: ID!
    body: String!
  }
`;

const resolvers = {
  Query: {
    // ctx.userId may be undefined, but the `me` rule blocks unauthenticated callers
    // before this resolver runs, so a real id is always present here.
    me: (_: unknown, __: unknown, ctx: Context) => ({ id: ctx.userId }),
    notes: () => NOTES,
    secret: () => 'top secret',
  },
  Mutation: {
    updateNote: (_: unknown, args: { id: string; userId: string; body: string }) => {
      const note = NOTES.find((n) => n.id === args.id);
      if (!note) return null;
      note.body = args.body;
      return note;
    },
    // id is ignored; this fixture only proves `accept` runs the resolver without an auth check.
    deleteNote: () => true,
  },
};

// Mirrors a generated Resolvers type closely enough for PermissionsMap to type-check.
type Resolvers = {
  Query: { me: unknown; notes: unknown; secret: unknown };
  Mutation: { updateNote: unknown; deleteNote: unknown };
  User: { id: unknown };
  Note: { id: unknown; userId: unknown; body: unknown };
};

const permissions: PermissionsMap<Resolvers> = {
  Query: {
    me: canUser(Actions.read, 'User'),
    notes: canUser(Actions.read, 'Note'),
    secret: deny, // never allowed
  },
  Mutation: {
    updateNote: canUser<{ id: string; userId: string }>(Actions.update, 'Note', (args) => ({
      userId: args.userId,
    })),
    deleteNote: accept, // public for the sake of the test
  },
};

let schema: GraphQLSchema;

beforeAll(() => {
  schema = applyPermissions<Resolvers>(makeExecutableSchema({ typeDefs, resolvers }), permissions);
});

beforeEach(() => {
  // Resolvers mutate notes in place; reset from the seed so tests stay isolated.
  NOTES = SEED.map((n) => ({ ...n }));
});

function run(source: string, ctx: Context, variableValues?: Record<string, unknown>) {
  return graphql({ schema, source, contextValue: ctx, variableValues });
}

const UPDATE_NOTE = `
  mutation ($id: ID!, $userId: ID!, $body: String!) {
    updateNote(id: $id, userId: $userId, body: $body) { id body }
  }
`;

describe('permissions middleware against an executable schema', () => {
  it('rejects unauthenticated reads with "Not authenticated"', async () => {
    const ctx = {};

    const result = await run('{ notes { id } }', ctx);
    // notes is non-null ([Note!]!), so the error bubbles up and nulls all data.
    expect(result.data).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Not authenticated');
  });

  it('allows any authenticated caller to read all notes (no row-level filtering)', async () => {
    const ctx = { userId: 'alice' };

    const result = await run('{ notes { id userId } }', ctx);
    expect(result.errors).toBeUndefined();
    expect(result.data?.notes).toHaveLength(2);
  });

  it('returns the caller for an authenticated me query', async () => {
    const ctx = { userId: 'alice' };

    const result = await run('{ me { id } }', ctx);
    expect(result.errors).toBeUndefined();
    expect(result.data?.me).toEqual({ id: 'alice' });
  });

  it('rejects an unauthenticated me query with "Not authenticated"', async () => {
    const ctx = {};

    const result = await run('{ me { id } }', ctx);
    // me is nullable (User), so only the field nulls out rather than bubbling.
    expect(result.data?.me).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Not authenticated');
  });

  it('always denies a field guarded by deny', async () => {
    const ctx = { userId: 'alice' };

    const result = await run('{ secret }', ctx);
    expect(result.data?.secret).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Forbidden');
  });

  it('allows updating your own note (conditions match)', async () => {
    const ctx = { userId: 'alice' };
    const variables = { id: 'n1', userId: 'alice', body: 'edited' };

    const result = await run(UPDATE_NOTE, ctx, variables);
    expect(result.errors).toBeUndefined();
    expect(result.data?.updateNote).toMatchObject({ id: 'n1', body: 'edited' });
  });

  it('forbids updating someone else’s note (conditions fail)', async () => {
    const ctx = { userId: 'alice' };
    const variables = { id: 'n2', userId: 'bob', body: 'hijacked' };

    const result = await run(UPDATE_NOTE, ctx, variables);
    expect(result.data?.updateNote).toBeNull();
    expect(result.errors?.[0]?.message).toBe('Forbidden');
    // the resolver never ran, so bob's note is untouched
    expect(NOTES.find((n) => n.id === 'n2')?.body).toBe('bob note');
  });

  it('runs a field guarded by accept without an auth check', async () => {
    const ctx = {};

    const result = await run('mutation { deleteNote(id: "n1") }', ctx);
    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteNote).toBe(true);
  });
});
