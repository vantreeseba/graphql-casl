/**
 * A GraphQL Code Generator plugin that emits `@vantreeseba/graphql-casl` subject
 * bindings derived from your schema, so you never hand-list domain type names.
 *
 * Run it after `typescript` + `typescript-resolvers` in the same output file (it
 * references the `Resolvers` / `ResolversTypes` they emit). It generates:
 *
 * - `AppSubjectMap` — `SubjectMap<Resolvers, ResolversTypes>`
 * - `Subject` — the subject-name const, auto-listed from the schema's object types
 * - `typed` — a `createTyped` tagger bound to `AppSubjectMap`
 * - `ability` — a `createGraphQLAbility` factory bound to `AppSubjectMap`
 *
 * @packageDocumentation
 */

import type { PluginFunction, PluginValidateFn } from '@graphql-codegen/plugin-helpers';
import { type GraphQLSchema, isObjectType } from 'graphql';

/** Configuration for the {@link plugin}. Every field has a sensible default. */
export interface GraphqlCaslPluginConfig {
  /** Import path for the runtime library. Default `@vantreeseba/graphql-casl`. */
  importPath?: string;
  /** Name of the generated subject-map type. Default `AppSubjectMap`. */
  subjectMapTypeName?: string;
  /** Name of the generated subject-name const. Default `Subject`. */
  subjectConstName?: string;
  /** Name of the generated `typed` tagger. Default `typed`. */
  typedName?: string;
  /** Name of the generated ability factory. Default `ability`. */
  abilityName?: string;
  /** Name of the `Resolvers` type emitted by `typescript-resolvers`. Default `Resolvers`. */
  resolversTypeName?: string;
  /** Name of the `ResolversTypes` type emitted by `typescript-resolvers`. Default `ResolversTypes`. */
  resolversTypesName?: string;
}

const DEFAULTS = {
  importPath: '@vantreeseba/graphql-casl',
  subjectMapTypeName: 'AppSubjectMap',
  subjectConstName: 'Subject',
  typedName: 'typed',
  abilityName: 'ability',
  resolversTypeName: 'Resolvers',
  resolversTypesName: 'ResolversTypes',
} satisfies Required<GraphqlCaslPluginConfig>;

/**
 * The schema's domain subject names: object types excluding the root operation
 * types (Query/Mutation/Subscription) and introspection types (`__*`), sorted for
 * deterministic output.
 */
function subjectNames(schema: GraphQLSchema): string[] {
  const roots = new Set(
    [schema.getQueryType(), schema.getMutationType(), schema.getSubscriptionType()]
      .filter((type): type is NonNullable<typeof type> => type != null)
      .map((type) => type.name),
  );
  const typeMap = schema.getTypeMap();
  return Object.keys(typeMap)
    .filter((name) => !name.startsWith('__') && !roots.has(name) && isObjectType(typeMap[name]))
    .sort();
}

export const plugin: PluginFunction<GraphqlCaslPluginConfig> = (schema, _documents, config) => {
  const opts = { ...DEFAULTS, ...config };
  const names = subjectNames(schema);

  const subjectEntries = names.map((name) => `  ${name}: '${name}',`).join('\n');
  const subjectBody = subjectEntries ? `{\n${subjectEntries}\n}` : '{}';

  const content = [
    `export type ${opts.subjectMapTypeName} = SubjectMap<${opts.resolversTypeName}, ${opts.resolversTypesName}>;`,
    '',
    `export const ${opts.subjectConstName} = createSubjects<${opts.subjectMapTypeName}>()(${subjectBody} as const);`,
    '',
    `export const ${opts.typedName} = createTyped<${opts.subjectMapTypeName}>();`,
    '',
    `export const ${opts.abilityName} = () => createGraphQLAbility<${opts.subjectMapTypeName}>();`,
    '',
  ].join('\n');

  return {
    prepend: [
      `import { createGraphQLAbility, createSubjects, createTyped, type SubjectMap } from '${opts.importPath}';`,
    ],
    content,
  };
};

export const validate: PluginValidateFn = async (_schema, _documents, config) => {
  for (const [key, value] of Object.entries(config ?? {})) {
    if (value !== undefined && typeof value !== 'string') {
      throw new Error(`graphql-casl-codegen: config option \`${key}\` must be a string.`);
    }
  }
};
