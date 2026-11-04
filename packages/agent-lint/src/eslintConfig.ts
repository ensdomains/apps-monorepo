import eslintReact from '@eslint-react/eslint-plugin'
import query from '@tanstack/eslint-plugin-query'
import type { ESLint, Linter } from 'eslint'
import testingLibrary from 'eslint-plugin-testing-library'
import tseslint from 'typescript-eslint'
import { agentPlugin } from '../rules/index.ts'
import { TEST_LIKE_GLOBS } from './testLike.ts'

const TYPED_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']
const TEST_FILES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
]

/**
 * The plugins type their rules with their own RuleModule types, which ESLint
 * 10's Plugin type does not accept although ESLint runs them unchanged.
 */
const asPlugin = (plugin: unknown): ESLint.Plugin =>
  // eslint-disable-next-line agent/no-unchecked-cast -- the published plugin types and ESLint 10's Plugin type disagree; ESLint accepts these plugins at run time
  plugin as ESLint.Plugin

/**
 * The workspace packages that can import invariant: utils itself and every
 * package that depends on @ens-apps/utils. test/config.test.ts keeps the list
 * equal to the package.json files.
 */
export const INVARIANT_PACKAGES: ReadonlyArray<string> = [
  'apps/manager',
  'apps/portal',
  'packages/dev-migration-tool',
  'packages/dev-time-travel',
  'packages/indexer',
  'packages/migration',
  'packages/smart-account',
  'packages/transaction-manager',
  'packages/utils',
  'packages/weave-loader',
  'workers/api-worker',
]

const BOOLEAN_NAME =
  '^(?:(?:is|has|should|can|cannot)[A-Z0-9]|(?:IS|HAS|SHOULD|CAN)_[A-Z0-9_]+$)'

/**
 * The ESLint half of agent-lint: only rules that need type information or
 * scope analysis, which Biome cannot express. Everything Biome can check
 * lives in biome/agent.jsonc.
 */
export const eslintConfig = (root: string): ReadonlyArray<Linter.Config> => [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.wrangler/**',
      '**/*.gen.ts',
      '**/*.gen.d.ts',
      '**/worker-configuration.d.ts',
      '**/packages/agent-lint/fixtures/**',
      '**/packages/agent-lint/test/rule-fixtures/**',
    ],
  },
  {
    files: TYPED_FILES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: root,
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
      reportUnusedInlineConfigs: 'off',
    },
    plugins: {
      '@typescript-eslint': asPlugin(tseslint.plugin),
      '@eslint-react': asPlugin(eslintReact),
      '@tanstack/query': asPlugin(query),
      agent: asPlugin(agentPlugin),
      'testing-library': asPlugin(testingLibrary),
    },
  },
  {
    // Source code: test-like files are exempt from these.
    files: TYPED_FILES,
    ignores: [...TEST_LIKE_GLOBS],
    rules: {
      // core.md "No unchecked casts around a type error" (Must).
      'agent/no-unchecked-cast': 'error',
      // TypeScript README: booleans are prefixed is, has, should or can.
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: ['variable', 'parameter'],
          types: ['boolean'],
          format: null,
          custom: { regex: BOOLEAN_NAME, match: true },
          // An underscore name marks a value deliberately left unused.
          filter: { regex: '^_', match: false },
        },
        {
          // A destructured name is the source object's, such as a prop.
          selector: ['variable', 'parameter'],
          modifiers: ['destructured'],
          types: ['boolean'],
          format: null,
          filter: { regex: '^_', match: false },
        },
      ],
      // react.md: no && whose left side can render 0, '' or 0n.
      '@eslint-react/no-leaked-conditional-rendering': 'error',
      // core.md and the TypeScript README: never mutate shared state.
      'agent/no-shared-mutation': 'error',
      // react.md: helpers that use nothing from their component live at module scope.
      'agent/hoist-pure-helpers': 'error',
      // tanstack-query.md: each resource is an options factory.
      '@tanstack/query/prefer-query-options': 'error',
      // neverthrow.md and core.md: never discard a failure Result.
      'agent/must-use-result': 'error',
      // web3.md: on-chain quantities stay bigint.
      'agent/no-number-on-bigint': 'error',
      // styling.md: size icons with size-* classes.
      'agent/icon-size-classes': 'error',
    },
  },
  {
    // core.md "Errors as values": test helpers such as e2e stand-ins are held
    // to it too, since a dropped failure there hides a broken test.
    files: TYPED_FILES,
    ignores: [
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      '**/_fixtures/**',
      '**/*.mock.ts',
      '**/*.mock.tsx',
      '**/*.stories.tsx',
      '**/.storybook/**',
    ],
    rules: { 'agent/no-silent-fallback': 'error' },
  },
  {
    // core.md "Errors as values": a throw is an invariant or what a library
    // expects, in the packages that can import invariant. Tests, e2e code,
    // test helpers, build config and scripts may throw, and so may the
    // helpers that throw for everyone else: invariant and the Result adapters
    // for neverthrow, TanStack Query and XState.
    files: INVARIANT_PACKAGES.map((dir) => `**/${dir}/**/*.{ts,tsx,mts,cts}`),
    ignores: [
      ...TEST_LIKE_GLOBS,
      '**/*.test-d.ts',
      '**/*.mocks.ts',
      '**/*.fixture.ts',
      '**/fixtures/**',
      '**/*TestKit.ts',
      '**/scripts/**',
      '**/*.config.*',
      '**/packages/agent-lint/**',
      // A standalone debug app inside the Manager, not shipped code.
      '**/apps/manager/rhinestone-browser-debug/**',
      '**/packages/utils/src/invariant.ts',
      '**/packages/utils/src/neverthrow/**',
      '**/packages/utils/src/tanstack-query/neverthrow/**',
      '**/packages/utils/src/xstate/**',
    ],
    rules: { 'agent/no-throw': 'error' },
  },
  {
    // STYLEGUIDE "Accessibility", Greptile button-type-attr: the shadcn Button
    // renders a native button with no default type. shadcn's own components
    // in components/ui are left as generated.
    files: ['**/*.tsx'],
    ignores: [...TEST_LIKE_GLOBS, '**/components/ui/**'],
    rules: { 'agent/button-type': 'error' },
  },
  {
    files: TEST_FILES,
    rules: {
      // testing.md: query the way a user does, and wait with findBy.
      'agent/no-foreign-testid': 'error',
      'testing-library/prefer-find-by': 'error',
    },
  },
  {
    // testing.md: drive interaction with userEvent. Only the Explorer has
    // @testing-library/user-event installed.
    files: ['**/apps/portal/**/*.test.ts', '**/apps/portal/**/*.test.tsx'],
    rules: { 'testing-library/prefer-user-event': 'error' },
  },
]

/** The rules above that read types, so they need a tsconfig that covers the file. */
const TYPED_RULES: ReadonlyArray<string> = [
  'agent/no-unchecked-cast',
  '@typescript-eslint/naming-convention',
  '@eslint-react/no-leaked-conditional-rendering',
  'agent/no-shared-mutation',
  'agent/must-use-result',
  'agent/no-number-on-bigint',
  'agent/no-throw',
]

/**
 * `eslintConfig` for a file that no tsconfig covers: parsed without a project,
 * and with the rules that read types switched off.
 */
export const untypedEslintConfig = (
  root: string,
): ReadonlyArray<Linter.Config> => [
  ...eslintConfig(root),
  {
    files: TYPED_FILES,
    languageOptions: { parserOptions: { projectService: false } },
    rules: Object.fromEntries(TYPED_RULES.map((id) => [id, 'off'] as const)),
  },
]
