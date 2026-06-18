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
