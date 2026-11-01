/**
 * Every rule agent-lint adds on top of the repo's own gate, with where it
 * comes from. The README table and the "Covered by agent-lint" sections are
 * generated from this list, and test/registry.test.ts keeps it in step with
 * the Biome config, the ESLint config and the compiler flags.
 */
export type RuleEntry = {
  /** The id agent-lint reports, e.g. `lint/style/noNestedTernary`. */
  readonly id: string
  /** What the rule holds, in plain words. */
  readonly what: string
  /** Wiki sources as `page › heading` under standards/engineering. */
  readonly wiki: ReadonlyArray<string>
  /** STYLEGUIDE.md sources as `section › heading`. */
  readonly styleguide: ReadonlyArray<string>
  /** Rule ids in .greptile/config.json that review the same thing. */
  readonly greptile: ReadonlyArray<string>
  /** Where it applies, when not everywhere. */
  readonly scope?: string
}

const rule = (
  id: string,
  what: string,
  sources: {
    readonly wiki?: ReadonlyArray<string>
    readonly styleguide?: ReadonlyArray<string>
    readonly greptile?: ReadonlyArray<string>
    readonly scope?: string
  } = {},
): RuleEntry => ({
  id,
  what,
  wiki: sources.wiki ?? [],
  styleguide: sources.styleguide ?? [],
  greptile: sources.greptile ?? [],
  ...(sources.scope === undefined ? {} : { scope: sources.scope }),
})

const TOOL_ENFORCED = 'typescript/README.md › Tool-enforced'
const NOT_TESTS = 'non-test files'

export const RULES: ReadonlyArray<RuleEntry> = [
  // Biome: stock rules raised to error everywhere.
  rule(
    'lint/suspicious/noExplicitAny',
    'No `any`; use `unknown` with a type guard.',
    {
      wiki: [
        'core.md › Type-safety first',
        'typescript/README.md › Type-safety: strict and no holes',
      ],
      styleguide: ['TypeScript Usage › Avoid `any`, Use `unknown`'],
      greptile: ['no-any'],
    },
  ),
  rule(
    'lint/style/noNonNullAssertion',
    'No non-null assertion (`!`) to silence the compiler.',
    {
      wiki: ['typescript/README.md › Type-safety: strict and no holes'],
      styleguide: ['Code Formatting & Linting with Biome › Key Linting Rules'],
      greptile: ['no-non-null-assertion'],
    },
  ),
  rule(
    'lint/style/useConst',
    'Use `const` for bindings that are never reassigned.',
    {
      wiki: ['typescript/README.md › Immutability constructs'],
    },
  ),
  rule(
    'lint/style/noNestedTernary',
    'No nested ternaries; use a lookup, early returns or ts-pattern.',
    {
      wiki: [
        'typescript/README.md › Explicit data flow and branching',
        'libraries/react.md › Pattern-match conditional rendering; no leaky `&&` (Default)',
      ],
      styleguide: [
        'React Patterns › Pattern Matching for Conditional Rendering',
      ],
      greptile: ['pattern-match-complex-conditionals'],
    },
  ),
  rule(
    'lint/style/noNegationElse',
    'Invert a negated condition instead of writing an else after it.',
    {
      wiki: [TOOL_ENFORCED],
    },
  ),
  rule('lint/style/noUselessElse', 'No else after a branch that returns.', {
    wiki: [TOOL_ENFORCED],
  }),
  rule(
    'lint/style/noUnusedTemplateLiteral',
    'No template literal without interpolation.',
    {
      wiki: [TOOL_ENFORCED],
    },
  ),
  rule(
    'lint/style/useFilenamingConvention',
    'Name files in camelCase, PascalCase or after their export; not kebab-case.',
    {
      styleguide: ['File Structure & Organization › File Naming Conventions'],
      greptile: ['file-naming-conventions'],
      scope: 'new and renamed files',
    },
  ),
  rule(
    'lint/style/noRestrictedImports',
    'No raw TanStack queryOptions (use resultQueryOptions), no CSS-in-JS or CSS Modules.',
    {
      wiki: [
        'libraries/tanstack-query.md › Wrap fallible query functions so the Result is unwrapped at the boundary',
        'libraries/styling.md › Utility-first markup',
      ],
      styleguide: ['Data Fetching with TanStack Query › Query Structure'],
      greptile: ['resultQueryOptions-factories'],
    },
  ),
  rule(
    'lint/complexity/noForEach',
    'Use `for...of` or array methods, not `forEach`.',
    {
      wiki: [TOOL_ENFORCED],
      styleguide: ['Code Formatting & Linting with Biome › Key Linting Rules'],
    },
  ),
  rule(
    'lint/complexity/noUselessFragments',
    'No fragments that wrap a single child or nothing.',
    {
      wiki: [TOOL_ENFORCED],
    },
  ),
  rule(
    'lint/complexity/noExcessiveCognitiveComplexity',
    'Keep functions small enough to follow; split complex ones.',
    {
      wiki: ['core.md › Composition over ad-hoc control flow'],
      styleguide: ['React Patterns › Component Size and Complexity'],
    },
  ),
  rule('lint/correctness/noUnusedImports', 'No unused imports.', {
    wiki: [TOOL_ENFORCED],
  }),
  rule('lint/correctness/noUnusedVariables', 'No unused variables.', {
    wiki: [TOOL_ENFORCED],
  }),
  rule(
    'lint/correctness/noNestedComponentDefinitions',
    'Define components at module scope, never inside another component.',
    {
      wiki: [TOOL_ENFORCED],
      styleguide: ['Code Formatting & Linting with Biome › Key Linting Rules'],
    },
  ),
  rule(
    'lint/a11y/noStaticElementInteractions',
    'Use semantic elements, not a div or span with a click handler.',
    {
      wiki: [
        'libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)',
      ],
      styleguide: ['Accessibility › Semantic HTML'],
      greptile: ['div-click-needs-keyboard'],
    },
  ),
  rule(
    'lint/a11y/useKeyWithClickEvents',
    'Every clickable element is keyboard-operable.',
    {
      wiki: [
        'libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)',
      ],
      styleguide: ['Accessibility › Keyboard Navigation'],
      greptile: ['div-click-needs-keyboard'],
    },
  ),
  rule(
    'lint/a11y/noLabelWithoutControl',
    'Pair every label with its control.',
    {
      wiki: [
        'libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)',
      ],
      greptile: ['label-input-association'],
    },
  ),
  rule('lint/a11y/useButtonType', 'Give every button an explicit `type`.', {
    styleguide: ['Code Formatting & Linting with Biome › Key Linting Rules'],
    greptile: ['button-type-attr'],
  }),
  rule(
    'agent/button-type',
    'Give every shadcn Button an explicit `type`; it renders a native button that submits by default.',
    {
      styleguide: ['Code Formatting & Linting with Biome › Key Linting Rules'],
      greptile: ['button-type-attr'],
      scope: '.tsx files outside components/ui',
    },
  ),
  rule(
    'lint/nursery/useSortedClasses',
    "Keep utility classes in the sorter's order, including inside cn, cva and clsx.",
    {
      wiki: ['libraries/styling.md › Sorted classes'],
    },
  ),
  rule(
    'lint/nursery/useReactFunctionComponentDefinition',
    'Define components as arrow-function consts; route components are exempt.',
    {
      wiki: [
        'libraries/react.md › Define components as arrow functions (Default)',
      ],
      styleguide: ['React Patterns › Component Definition'],
      greptile: ['arrow-function-components'],
      scope: 'files outside apps/*/src/routes',
    },
  ),
  rule(
    'lint/nursery/noJsRestrictedProperties',
    'Import `fromPromise` from neverthrow instead of `ResultAsync.fromPromise`.',
    {
      styleguide: ['Web3 & Blockchain Patterns › Working with ENS'],
    },
  ),
  rule(
    'lint/nursery/noRestrictedDependencies',
    'Prefer the lean or native alternative to a flagged dependency.',
  ),

  // Biome: GritQL plugins.
  rule(
    'plugin/no-empty-catch',
    'Never swallow an error: no empty catch, no `.catch` that returns nothing while its result is thrown away.',
    {
      wiki: ['core.md › Errors as values'],
      styleguide: ['Error Boundaries › Best Practices'],
    },
  ),
  rule(
    'plugin/no-yield-await',
    'Never write `yield* await` in a ResultFn generator.',
    {
      wiki: [
        'libraries/neverthrow.md › Compose with ResultFn generators and yield*',
      ],
      styleguide: ['Error Handling with neverthrow › Quick Reference'],
      greptile: ['no-yield-await'],
    },
  ),
  rule(
    'plugin/no-throw-result-error',
    'Never `throw result.error` to bridge a Result into a throwing channel.',
    {
      wiki: ['libraries/neverthrow.md › Never mix Result with try-catch'],
      styleguide: ['Error Handling with neverthrow › Critical Anti-Patterns'],
      greptile: ['no-manual-result-unwrap-throw'],
    },
  ),
  rule(
    'plugin/no-try-in-resultfn',
    'No try/catch inside a ResultFn generator.',
    {
      wiki: ['libraries/neverthrow.md › Never mix Result with try-catch'],
      styleguide: ['Error Handling with neverthrow › Critical Anti-Patterns'],
      greptile: ['no-mix-result-trycatch'],
    },
  ),
  rule(
    'plugin/no-bare-error-value',
    'Carry a failure as a TaggedError class, not a bare `Error` or a string: in `err`, an error mapper or a `.catch` that resolves with it.',
    {
      wiki: [
        'libraries/neverthrow.md › Specific error classes built from TaggedError',
      ],
      styleguide: ['Error Handling with neverthrow › Core Principles'],
      greptile: ['tagged-error-classes'],
      scope:
        'non-test files, test helpers included, except build and tool configs',
    },
  ),
  rule(
    'plugin/no-json-parse-in-try',
    'Parse JSON with fromThrowable or fromSync, not in a try block whose catch carries on.',
    {
      wiki: [
        'libraries/neverthrow.md › Lift throwing code in with fromSync, fromThrowable, fromPromise',
      ],
      greptile: ['fromSync-not-trycatch'],
      scope: 'non-test files, test helpers included',
    },
  ),
  rule(
    'agent/no-silent-fallback',
    "A catch that drops its error and carries on with an empty value says why: inside it, above it or in its function's doc.",
    {
      wiki: ['core.md › Errors as values'],
      styleguide: ['Error Boundaries › Best Practices'],
      scope: 'non-test files, test helpers included',
    },
  ),
  rule(
    'agent/no-throw',
    'Throw only a TaggedError inside a function a library expects to throw; assert a state only a bug can reach with invariant() and return other failures as values.',
    {
      wiki: [
        'core.md › Errors as values',
        'typescript/README.md › Errors as values: neverthrow',
        'libraries/neverthrow.md › Result for sync, ResultAsync for async',
      ],
      styleguide: ['Error Handling with neverthrow › Core Principles'],
      scope:
        'packages that can import invariant (the two apps, the API worker and the packages that depend on utils), outside tests, test helpers, build config, scripts, the debug harness inside the Manager and the helpers that throw for everyone (invariant and the Result adapters); only where packages/utils/src/invariant.ts exists',
    },
  ),
  rule(
    'plugin/no-try-catch-into-result',
    'Do not turn a throw into a Result with try/catch; use fromSync, fromThrowable or fromPromise.',
    {
      wiki: [
        'core.md › Errors as values',
        'libraries/neverthrow.md › Never mix Result with try-catch',
      ],
      styleguide: ['Error Handling with neverthrow › Critical Anti-Patterns'],
      greptile: ['fromSync-not-trycatch', 'no-mix-result-trycatch'],
      scope: NOT_TESTS,
    },
  ),
  rule(
    'plugin/tagged-errors',
    'A Result carries a specific TaggedError class as its error, not a bare Error or string.',
    {
      wiki: [
        'libraries/neverthrow.md › Specific error classes built from TaggedError',
      ],
      styleguide: ['Error Handling with neverthrow › Core Principles'],
      greptile: ['tagged-error-classes'],
      scope: NOT_TESTS,
    },
  ),
  rule(
    'plugin/no-effect-data-fetching',
    'Never fetch data in useEffect; use TanStack Query.',
    {
      wiki: [
        'libraries/react.md › Never use useEffect for data fetching (Must)',
        'libraries/tanstack-query.md › TanStack Query owns all server and async state',
      ],
      styleguide: ['React Patterns › Never Use useEffect for Data Fetching'],
      greptile: ['no-effect-data-fetching'],
    },
  ),
  rule(
    'plugin/effect-in-named-hook',
    'An effect longer than five lines or async moves into a named use* hook.',
    {
      wiki: [
        'libraries/react.md › Extract non-trivial effects into named hooks (Default)',
      ],
      styleguide: ['React Patterns › useEffect Usage Policy'],
      greptile: ['extract-effect-to-hook'],
      scope: 'component files (.tsx), not tests',
    },
  ),
  rule(
    'plugin/no-effect-transactions',
    'Never start or submit a transaction from useEffect.',
    {
      wiki: ['libraries/xstate.md › Never chain transactions with useEffect'],
      styleguide: [
        'State Management › Multi-Step Transaction Orchestration Anti-Pattern',
      ],
      greptile: ['no-effect-transaction-chaining'],
    },
  ),
  rule(
    'plugin/no-copied-mutation-state',
    "Read a mutation's isPending, isSuccess, data or error directly; never copy it.",
    {
      styleguide: ['State Management › Single Transaction Pattern'],
      greptile: ['mutation-isPending-direct'],
    },
  ),
  rule(
    'plugin/no-or-grouped-query-states',
    "Render each query's loading and error state on its own; never combine them with `||`.",
    {
      wiki: [
        "libraries/tanstack-query.md › Handle each query's loading and error states independently",
      ],
      styleguide: [
        'Data Fetching with TanStack Query › Handle Query States Independently',
      ],
      greptile: ['independent-query-states'],
    },
  ),
  rule(
    'plugin/no-literal-query-keys',
    'Build query keys with createQueryKey and a named params object, not an array literal.',
    {
      wiki: [
        'libraries/tanstack-query.md › Build query keys with the object-param key factory',
      ],
      styleguide: ['Data Fetching with TanStack Query › Query Key Patterns'],
      greptile: ['object-based-query-keys'],
    },
  ),
  rule(
    'plugin/no-try-in-query-fn',
    'Never wrap a queryFn in try/catch; return a Result through resultQueryOptions.',
    {
      wiki: [
        'libraries/tanstack-query.md › Wrap fallible query functions so the Result is unwrapped at the boundary',
      ],
    },
  ),
  rule(
    'plugin/no-raw-request-reads',
    'Route handlers read `c.req.valid(...)`, never the raw request.',
    {
      wiki: [
        'libraries/valibot.md › Validate inbound HTTP bodies with vValidator at the boundary',
      ],
      scope: 'route files',
    },
  ),
  rule(
    'plugin/no-throwing-parse',
    'No throwing `v.parse` at non-HTTP boundaries; use safeParse and a Result.',
    {
      wiki: [
        'libraries/valibot.md › Lift parse failures into a Result, never let them throw at non-HTTP boundaries',
      ],
      scope: NOT_TESTS,
    },
  ),
  rule(
    'plugin/picklist-over-literal-union',
    'Model a closed set with `v.picklist`, not a union of `v.literal`.',
    {
      wiki: [
        'libraries/valibot.md › Model closed string enums with v.picklist and derive the union from it',
      ],
    },
  ),
  rule(
    'plugin/address-type',
    "Type an address as viem's `Address`, not `string`.",
    {
      wiki: [
        'libraries/web3.md › Use the Address type and validate at the boundary with isAddress',
      ],
      styleguide: ['Web3 & Blockchain Patterns › Address Type Safety'],
      scope: NOT_TESTS,
    },
  ),
  rule(
    'plugin/no-client-in-function',
    'Create viem clients once at module scope, never inside a function or component.',
    {
      wiki: [
        'libraries/web3.md › Instantiate clients once; access them through a safe accessor',
      ],
      styleguide: ['Summary › Golden Rules'],
      greptile: ['clients-instantiated-once'],
      scope: NOT_TESTS,
    },
  ),
  rule(
    'plugin/jsonb-needs-type',
    'Every jsonb column carries `.$type<...>()`.',
    {
      wiki: [
        'libraries/drizzle.md › Type enum-like and JSON columns with `.$type<>()` against shared-schema unions',
      ],
    },
  ),
  rule(
    'plugin/tables-with-relations',
    'A schema file that declares pgTable also declares its relations().',
    {
      wiki: [
        'libraries/drizzle.md › Express identity and relations on the table, not in queries',
      ],
      scope: 'database schema files',
    },
  ),
  rule(
    'plugin/no-getdatabase-in-routes',
    'Route handlers take the database from injectDb (`c.var.db`), not getDatabase().',
    {
      wiki: [
        'libraries/drizzle.md › Inject the db through `injectDb`; read it from `c.var.db`, never ambient state',
      ],
      scope: 'api-worker route files',
    },
  ),
  rule(
    'plugin/no-vite-secret-env',
    'No secret-looking `VITE_` variable: it ships to the browser.',
    {
      wiki: [
        'libraries/tanstack-start.md › Choose a server function for RPC, a server route for a fixed HTTP URL',
      ],
    },
  ),
  rule(
    'plugin/readonly-members',
    'Fields of interfaces and object types are readonly; array parameters take readonly arrays.',
    {
      wiki: [
        'typescript/README.md › Immutability constructs',
        'libraries/react.md › Name and co-locate props types (Default)',
      ],
      styleguide: ['TypeScript Usage › Use Readonly for Immutability'],
      greptile: ['readonly-immutable-types'],
      scope: 'files other than .d.ts',
    },
  ),
  rule(
    'plugin/constants-upper-snake',
    'Name a module-level number, bigint or address constant in UPPER_SNAKE_CASE.',
    {
      wiki: ['typescript/README.md › Naming conventions'],
      styleguide: ['Naming Conventions › Constants'],
      greptile: ['constants-upper-snake'],
      scope: NOT_TESTS,
    },
  ),
  rule(
    'plugin/no-bare-outline-none',
    'Pair `outline-none` with a `focus-visible:` style.',
    {
      wiki: [
        'libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)',
      ],
      styleguide: ['Accessibility › WCAG 2 Examples'],
      greptile: ['focus-visible-rings'],
    },
  ),
  rule('plugin/no-emoji', 'No emojis in source code.', {
    greptile: ['no-emojis-in-code'],
  }),

  rule(
    'plugin/no-arbitrary-tailwind',
    'Use a design token, not a bracketed pixel or hex value; calc(), var(), grids and [property:value] are allowed.',
    {
      wiki: ['libraries/styling.md › Design tokens over arbitrary values'],
      styleguide: ['Styling with Tailwind CSS › Avoid Arbitrary Values'],
      greptile: ['no-arbitrary-tailwind'],
      scope: 'non-test files',
    },
  ),
  rule(
    'plugin/no-skipped-tests',
    'No skipped test or suite in committed code; a runtime guard with a reason is fine.',
    {
      wiki: ['libraries/testing.md › Tool-enforced'],
      scope: 'test files',
    },
  ),

  // ESLint: rules that need type information or scope analysis.
  rule(
    'agent/no-unchecked-cast',
    'No cast that narrows a type without a check; error mappers, type placeholders and widening casts are fine.',
    {
      wiki: [
        'core.md › Type-safety first',
        'typescript/README.md › Type-safety: strict and no holes',
      ],
      scope: 'non-test files',
    },
  ),
  rule(
    'agent/no-shared-mutation',
    'Never mutate what a function does not own: a parameter, import, module-level value, captured variable or `this`.',
    {
      wiki: [
        'core.md › Minimal mutation',
        'typescript/README.md › Immutability constructs',
      ],
      styleguide: ['Core Principles › 4. Functional-Light Programming'],
      greptile: ['no-mutation'],
      scope: 'non-test files',
    },
  ),
  rule(
    'agent/hoist-pure-helpers',
    'A helper inside a component or hook that uses nothing from it lives at module scope.',
    {
      wiki: [
        'libraries/react.md › Hoist static values and pure functions out of the body (Default)',
      ],
      styleguide: ['React Patterns › Extract Static Values and Pure Functions'],
      scope: 'non-test files',
    },
  ),
  rule(
    'agent/no-foreign-testid',
    'Query by role, label or text, not by a test id the test does not render itself.',
    {
      wiki: ["libraries/testing.md › Test from the user's perspective"],
      styleguide: ['Testing Strategy › Test Examples'],
      scope: 'test files',
    },
  ),
  rule(
    'testing-library/prefer-user-event',
    'Drive interaction with userEvent, not fireEvent.',
    {
      wiki: ["libraries/testing.md › Test from the user's perspective"],
      scope: 'Explorer test files (the only app with user-event installed)',
    },
  ),
  rule(
    '@typescript-eslint/naming-convention',
    'Boolean variables and parameters start with is, has, should or can.',
    {
      wiki: ['typescript/README.md › Naming conventions'],
      styleguide: ['Naming Conventions › Boolean Naming'],
      greptile: ['boolean-prefixes'],
    },
  ),
  rule(
    '@eslint-react/no-leaked-conditional-rendering',
    "No `&&` whose left side can render 0, '' or 0n.",
    {
      wiki: [
        'libraries/react.md › Pattern-match conditional rendering; no leaky `&&` (Default)',
      ],
      styleguide: [
        'React Patterns › Pattern Matching for Conditional Rendering',
      ],
      greptile: ['pattern-match-complex-conditionals'],
    },
  ),
  rule(
    '@tanstack/query/prefer-query-options',
    'Express each resource as a query-options factory.',
    {
      wiki: [
        'libraries/tanstack-query.md › Define data as query-options factories, not custom hook wrappers',
      ],
      styleguide: ['Data Fetching with TanStack Query › Query Structure'],
      greptile: ['resultQueryOptions-factories'],
    },
  ),
  rule(
    'agent/must-use-result',
    'Never discard a neverthrow Result or ResultAsync.',
    {
      wiki: [
        'core.md › Errors as values',
        'typescript/README.md › Errors as values: neverthrow',
        'libraries/neverthrow.md › Always handle both ok and err',
      ],
      styleguide: ['Error Handling with neverthrow › Core Principles'],
    },
  ),
  rule(
    'agent/no-number-on-bigint',
    'Chain quantities stay bigint; no `Number()` on a bigint.',
    {
      wiki: [
        'libraries/web3.md › Use BigInt for every blockchain numeric value',
      ],
      styleguide: ['Web3 & Blockchain Patterns › BigInt Handling'],
      greptile: ['bigint-blockchain-values'],
    },
  ),
  rule(
    'agent/icon-size-classes',
    'Size lucide icons with size-* classes, not size, width or height props.',
    {
      wiki: ['libraries/styling.md › Icon sizing through size utilities'],
      styleguide: ['Styling with Tailwind CSS › Icon Sizing with Lucide'],
      greptile: ['lucide-size-class'],
    },
  ),
  rule(
    'testing-library/prefer-find-by',
    'Wait with findBy, not waitFor around a getBy.',
    {
      wiki: ["libraries/testing.md › Test from the user's perspective"],
      scope: 'test files',
    },
  ),

  // Text checks: comments, which no linter reads.
  rule(
    'text/no-a11y-suppression',
    'Never suppress an accessibility rule; fix the markup.',
    {
      styleguide: [
        'Code Formatting & Linting with Biome › Ignoring Biome Rules',
      ],
    },
  ),
  rule(
    'text/eslint-disable-reason',
    'Every eslint-disable carries its reason after `--`.',
    {
      wiki: ['core.md › Documenting deviations'],
    },
  ),

  // Compiler.
  rule(
    'tsc/noUncheckedIndexedAccess',
    'Index access may be undefined; handle it.',
    {
      wiki: ['typescript/README.md › Type-safety: strict and no holes'],
    },
  ),
]
