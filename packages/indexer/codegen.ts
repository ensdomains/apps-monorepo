import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  config: {
    inlineFragmentTypes: 'combine',
  },
  documents: './documents/**/*.graphql',
  generates: {
    // Schema types live in their own file: since codegen v7 the
    // `typescript-operations` plugin also emits the input types and enums its
    // operations reference, which collides with `typescript` when both write
    // to one file. `importSchemaTypesFrom` below is what turns that off.
    'schema.gen.ts': {
      config: {
        disableDescriptions: true,
        useTypeImports: true,
      },
      plugins: ['typescript'],
    },
    'graphql.gen.ts': {
      config: {
        addDocBlocks: false,
        disableDescriptions: true,
        useTypeImports: true,
        nameSuffix: 'Document',
        // Fragment consts default to the bare fragment name (`Domain`), which
        // shadows the same-named schema type re-exported from `./schema.gen`
        // and makes it un-importable (TS2749).
        fragmentSuffix: 'FragmentDoc',
        importSchemaTypesFrom: './schema.gen.ts',
        namespacedImportName: 'Types',
      },
      plugins: [
        // Keeps every generated type reachable from the package root, so
        // `importSchemaTypesFrom` stays an internal detail.
        { add: { content: "export * from './schema.gen'" } },
        'typescript-operations',
        'typescript-document-nodes',
      ],
    },
    'possible-types.ts': {
      plugins: ['fragment-matcher'],
    },
  },
  hooks: { afterAllFileWrite: ['biome format --write .'] },
  overwrite: true,
  schema: 'https://staging-graphql.ens.dev/',
}

export default config
