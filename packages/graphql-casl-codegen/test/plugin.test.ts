import type { Types } from '@graphql-codegen/plugin-helpers';
import { buildSchema } from 'graphql';
import { describe, expect, it } from 'vitest';
import { plugin, validate } from '../src/index.js';

const schema = buildSchema(`
  type Query { me: User, notes: [Note!]! }
  type Mutation { updateNote(id: ID!): Note }
  type User { id: ID! }
  type Note { id: ID!, userId: ID! }
  type Org { id: ID! }
`);

async function run(config: Parameters<typeof plugin>[2]) {
  const out = (await plugin(schema, [], config)) as Types.ComplexPluginOutput;
  return { prepend: out.prepend ?? [], content: out.content ?? '' };
}

describe('graphql-casl codegen plugin', () => {
  it('emits subject bindings for object types only', async () => {
    const { prepend, content } = await run({});

    expect(prepend).toContain(
      "import { createGraphQLAbility, createSubjects, createTyped, type SubjectMap } from '@vantreeseba/graphql-casl';",
    );
    expect(content).toContain('export type AppSubjectMap = SubjectMap<Resolvers, ResolversTypes>;');
    // object types, sorted; root + introspection types excluded
    expect(content).toMatch(/Note: 'Note',/);
    expect(content).toMatch(/Org: 'Org',/);
    expect(content).toMatch(/User: 'User',/);
    expect(content).not.toMatch(/Query:/);
    expect(content).not.toMatch(/Mutation:/);
    expect(content).toContain('export const typed = createTyped<AppSubjectMap>();');
    expect(content).toContain(
      'export const ability = () => createGraphQLAbility<AppSubjectMap>();',
    );
  });

  it('includes interface and union subjects (matching SubjectMap) but not scalars/enums/inputs', async () => {
    // typescript-resolvers emits Resolvers entries for interfaces & unions, so
    // SubjectMap includes them — the Subject const must too, or it won't compile.
    const withComposites = buildSchema(`
      scalar DateTime
      enum Role { ADMIN USER }
      input NoteFilter { q: String }
      interface Node { id: ID! }
      type User implements Node { id: ID!, role: Role }
      type Note implements Node { id: ID! }
      union SearchResult = User | Note
      type Query { node(id: ID!): Node, search(f: NoteFilter): [SearchResult!]! }
    `);
    const out = (await plugin(withComposites, [], {})) as Types.ComplexPluginOutput;
    const content = out.content ?? '';

    expect(content).toMatch(/Node: 'Node',/); // interface
    expect(content).toMatch(/SearchResult: 'SearchResult',/); // union
    expect(content).toMatch(/User: 'User',/);
    expect(content).toMatch(/Note: 'Note',/);
    // scalars, enums, and input types are not subjects
    expect(content).not.toMatch(/DateTime:/);
    expect(content).not.toMatch(/Role:/);
    expect(content).not.toMatch(/NoteFilter:/);
  });

  it('honors config overrides', async () => {
    const { prepend, content } = await run({
      importPath: '#auth',
      subjectMapTypeName: 'SubjectsMap',
      subjectConstName: 'S',
      abilityName: 'makeAbility',
    });

    expect(prepend[0]).toContain("from '#auth'");
    expect(content).toContain('export type SubjectsMap = SubjectMap<Resolvers, ResolversTypes>;');
    expect(content).toContain('export const S = createSubjects<SubjectsMap>()(');
    expect(content).toContain(
      'export const makeAbility = () => createGraphQLAbility<SubjectsMap>();',
    );
  });

  it('emits an empty subject map for a schema with no object types', async () => {
    // only a root type exists, so no subjects are listed
    const minimal = buildSchema('type Query { ok: Boolean }');
    const out = (await plugin(minimal, [], {})) as Types.ComplexPluginOutput;
    expect(out.content).toContain('createSubjects<AppSubjectMap>()({} as const)');
  });

  it('validate accepts valid (string / undefined / absent) config', async () => {
    await expect(
      validate(schema, [], { subjectConstName: 'S', importPath: undefined }, 'out.ts', []),
    ).resolves.toBeUndefined();
    await expect(validate(schema, [], {}, 'out.ts', [])).resolves.toBeUndefined();
    await expect(validate(schema, [], undefined as never, 'out.ts', [])).resolves.toBeUndefined();
  });

  it('validate rejects non-string config values', async () => {
    await expect(validate(schema, [], { subjectConstName: 123 }, 'out.ts', [])).rejects.toThrow(
      /must be a string/,
    );
  });
});
