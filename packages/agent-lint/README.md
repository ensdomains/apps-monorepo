# agent-lint

A stricter check for the code AI agents write. It is not a requirement: it is good when an agent's change passes it, and an agent pipeline can use it as a gate. Humans' hooks and CI do not run it.

It looks only at what a change adds: existing code that breaks a rule never blocks it. That is what lets the rules be stricter than the repo's own gate, which has to pass on all the code already there.

## Running it

From the repo root:

```sh
pnpm lint:agent
```

It compares the working tree, committed or not, with the point where the branch left `origin/main`. Pass `--base <branch or commit>` to measure from somewhere else, `--repo <path>` to check another checkout, and `--json` for machine-readable output. It exits 0 when the change adds no problems, 1 when it does, and 2 when a checker could not run.

A problem counts as the change's own when:

- it is on a line the change added or modified;
- it comes from a whole-file rule, such as file naming, on a file the change added or renamed;
- it is elsewhere in a changed file, but that file now has more problems of that rule than it had at the base (deleting the last use of an import leaves the import unused, on a line the change never touched).

## What it runs

1. **Biome** with [biome/agent.jsonc](./biome/agent.jsonc): every rule the repo's own Biome configs enforce, raised to error everywhere, plus the rules below and the GritQL plugins in [biome/plugins](./biome/plugins). Biome takes every rule it can express.
2. **ESLint**, only for rules Biome cannot express because they need type information or scope analysis ([src/eslintConfig.ts](./src/eslintConfig.ts), custom rules in [rules](./rules)). It reads types with TypeScript 6.0, because typescript-eslint does not support the repo's TypeScript 7 yet. A file that no `tsconfig.json` covers (its include lists do not name it and no listed file imports it) has no types to read, and the project service rebuilds every program it holds before it gives up on such a file, so ESLint lints it in a second pass without type information: the rules that read types do not run on it, the others do (`untypedEslintConfig` in [src/eslintConfig.ts](./src/eslintConfig.ts)). The run reports how many files it linted that way and in which folders (`untyped` in the `--json` output).
3. **The TypeScript compiler** with stricter settings for every touched package, keeping only the errors those settings add ([src/tsc.ts](./src/tsc.ts)). It compiles with the strict flags first, and a second time with the package's own settings only when the first finds an error on a changed line. A package whose tsconfig already sets the flags is not compiled.

## Suppressing a finding

Fix the finding where you can. Where the rule is wrong for this case, suppress it on the line above with the reason; a suppression without a reason is itself a violation of the wiki's rule on documenting deviations.

```ts
// biome-ignore lint/style/noNestedTernary: <reason>
// biome-ignore lint/plugin: <reason>
// eslint-disable-next-line agent/no-shared-mutation -- <reason>
```

## Adding a rule

1. Prefer Biome. A stock rule goes in `biome/agent.jsonc`. A rule Biome lacks but syntax can decide becomes a GritQL plugin in `biome/plugins/<id>.grit`, with a message that starts with `[<id>]` and a fixture folder `fixtures/<id>/` whose lines carry `// expect: <id>` where the plugin must report.
2. Use ESLint only when the rule needs types or scope: a plugin rule in `src/eslintConfig.ts`, or a custom rule in `rules/` with tests in `test/rules.test.ts`. A rule that reads types also goes in `TYPED_RULES` in `src/eslintConfig.ts`, so that files outside every `tsconfig.json`, which have no types, do not run it.
3. Register it in `src/registry.ts` with its sources, then run `pnpm --filter @ens-apps/agent-lint run docs:rules` to refresh the table below and `pnpm --filter @ens-apps/agent-lint test:run`. The tests fail if a rule is switched on but not registered, or registered but not switched on.

## Rules

Besides Biome's recommended set, which the repo's gate already enforces:

<!-- agent-lint:rules:start -->
| Rule | What it holds | Sources |
| --- | --- | --- |
| `lint/suspicious/noExplicitAny` | No `any`; use `unknown` with a type guard. | wiki: core.md › Type-safety first<br>wiki: typescript/README.md › Type-safety: strict and no holes<br>STYLEGUIDE.md: TypeScript Usage › Avoid `any`, Use `unknown`<br>Greptile: `no-any` |
| `lint/style/noNonNullAssertion` | No non-null assertion (`!`) to silence the compiler. | wiki: typescript/README.md › Type-safety: strict and no holes<br>STYLEGUIDE.md: Code Formatting & Linting with Biome › Key Linting Rules<br>Greptile: `no-non-null-assertion` |
| `lint/style/useConst` | Use `const` for bindings that are never reassigned. | wiki: typescript/README.md › Immutability constructs |
| `lint/style/noNestedTernary` | No nested ternaries; use a lookup, early returns or ts-pattern. | wiki: typescript/README.md › Explicit data flow and branching<br>wiki: libraries/react.md › Pattern-match conditional rendering; no leaky `&&` (Default)<br>STYLEGUIDE.md: React Patterns › Pattern Matching for Conditional Rendering<br>Greptile: `pattern-match-complex-conditionals` |
| `lint/style/noNegationElse` | Invert a negated condition instead of writing an else after it. | wiki: typescript/README.md › Tool-enforced |
| `lint/style/noUselessElse` | No else after a branch that returns. | wiki: typescript/README.md › Tool-enforced |
| `lint/style/noUnusedTemplateLiteral` | No template literal without interpolation. | wiki: typescript/README.md › Tool-enforced |
| `lint/style/useFilenamingConvention` | Name files in camelCase, PascalCase or after their export; not kebab-case. Applies to new and renamed files. | STYLEGUIDE.md: File Structure & Organization › File Naming Conventions<br>Greptile: `file-naming-conventions` |
| `lint/style/noRestrictedImports` | No raw TanStack queryOptions (use resultQueryOptions), no CSS-in-JS or CSS Modules. | wiki: libraries/tanstack-query.md › Wrap fallible query functions so the Result is unwrapped at the boundary<br>wiki: libraries/styling.md › Utility-first markup<br>STYLEGUIDE.md: Data Fetching with TanStack Query › Query Structure<br>Greptile: `resultQueryOptions-factories` |
| `lint/complexity/noForEach` | Use `for...of` or array methods, not `forEach`. | wiki: typescript/README.md › Tool-enforced<br>STYLEGUIDE.md: Code Formatting & Linting with Biome › Key Linting Rules |
| `lint/complexity/noUselessFragments` | No fragments that wrap a single child or nothing. | wiki: typescript/README.md › Tool-enforced |
| `lint/complexity/noExcessiveCognitiveComplexity` | Keep functions small enough to follow; split complex ones. | wiki: core.md › Composition over ad-hoc control flow<br>STYLEGUIDE.md: React Patterns › Component Size and Complexity |
| `lint/correctness/noUnusedImports` | No unused imports. | wiki: typescript/README.md › Tool-enforced |
| `lint/correctness/noUnusedVariables` | No unused variables. | wiki: typescript/README.md › Tool-enforced |
| `lint/correctness/noNestedComponentDefinitions` | Define components at module scope, never inside another component. | wiki: typescript/README.md › Tool-enforced<br>STYLEGUIDE.md: Code Formatting & Linting with Biome › Key Linting Rules |
| `lint/a11y/noStaticElementInteractions` | Use semantic elements, not a div or span with a click handler. | wiki: libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)<br>STYLEGUIDE.md: Accessibility › Semantic HTML<br>Greptile: `div-click-needs-keyboard` |
| `lint/a11y/useKeyWithClickEvents` | Every clickable element is keyboard-operable. | wiki: libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)<br>STYLEGUIDE.md: Accessibility › Keyboard Navigation<br>Greptile: `div-click-needs-keyboard` |
| `lint/a11y/noLabelWithoutControl` | Pair every label with its control. | wiki: libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)<br>Greptile: `label-input-association` |
| `lint/a11y/useButtonType` | Give every button an explicit `type`. | STYLEGUIDE.md: Code Formatting & Linting with Biome › Key Linting Rules<br>Greptile: `button-type-attr` |
| `agent/button-type` | Give every shadcn Button an explicit `type`; it renders a native button that submits by default. Applies to .tsx files outside components/ui. | STYLEGUIDE.md: Code Formatting & Linting with Biome › Key Linting Rules<br>Greptile: `button-type-attr` |
| `lint/nursery/useSortedClasses` | Keep utility classes in the sorter's order, including inside cn, cva and clsx. | wiki: libraries/styling.md › Sorted classes |
| `lint/nursery/useReactFunctionComponentDefinition` | Define components as arrow-function consts; route components are exempt. Applies to files outside apps/*/src/routes. | wiki: libraries/react.md › Define components as arrow functions (Default)<br>STYLEGUIDE.md: React Patterns › Component Definition<br>Greptile: `arrow-function-components` |
| `lint/nursery/noJsRestrictedProperties` | Import `fromPromise` from neverthrow instead of `ResultAsync.fromPromise`. | STYLEGUIDE.md: Web3 & Blockchain Patterns › Working with ENS |
| `lint/nursery/noRestrictedDependencies` | Prefer the lean or native alternative to a flagged dependency. |  |
| `plugin/no-empty-catch` | Never swallow an error: no empty catch, no `.catch` that returns nothing while its result is thrown away. | wiki: core.md › Errors as values<br>STYLEGUIDE.md: Error Boundaries › Best Practices |
| `plugin/no-yield-await` | Never write `yield* await` in a ResultFn generator. | wiki: libraries/neverthrow.md › Compose with ResultFn generators and yield*<br>STYLEGUIDE.md: Error Handling with neverthrow › Quick Reference<br>Greptile: `no-yield-await` |
| `plugin/alias-xstate-from-promise` | Import XState's `fromPromise` as `fromPromiseXState`, so a bare `fromPromise` means neverthrow's. | STYLEGUIDE.md: Web3 & Blockchain Patterns › Working with ENS |
| `plugin/no-throw-result-error` | Never `throw result.error` to bridge a Result into a throwing channel. | wiki: libraries/neverthrow.md › Never mix Result with try-catch<br>STYLEGUIDE.md: Error Handling with neverthrow › Critical Anti-Patterns<br>Greptile: `no-manual-result-unwrap-throw` |
| `plugin/no-try-in-resultfn` | No try/catch inside a ResultFn generator. | wiki: libraries/neverthrow.md › Never mix Result with try-catch<br>STYLEGUIDE.md: Error Handling with neverthrow › Critical Anti-Patterns<br>Greptile: `no-mix-result-trycatch` |
| `plugin/no-bare-error-value` | Carry a failure as a TaggedError class, not a bare `Error` or a string: in `err`, an error mapper or a `.catch` that resolves with it. Applies to non-test files, test helpers included, except build and tool configs. | wiki: libraries/neverthrow.md › Specific error classes built from TaggedError<br>STYLEGUIDE.md: Error Handling with neverthrow › Core Principles<br>Greptile: `tagged-error-classes` |
| `plugin/no-json-parse-in-try` | Parse JSON with fromThrowable or fromSync, not in a try block whose catch carries on. Applies to non-test files, test helpers included. | wiki: libraries/neverthrow.md › Lift throwing code in with fromSync, fromThrowable, fromPromise<br>Greptile: `fromSync-not-trycatch` |
| `agent/no-silent-fallback` | A catch that drops its error and carries on with an empty value says why: inside it, above it or in its function's doc. Applies to non-test files, test helpers included. | wiki: core.md › Errors as values<br>STYLEGUIDE.md: Error Boundaries › Best Practices |
| `agent/no-throw` | Throw only a TaggedError inside a function a library expects to throw; assert a state only a bug can reach with invariant() and return other failures as values. Applies to packages that can import invariant (the two apps, the API worker and the packages that depend on utils), outside tests, test helpers, build config, scripts, the debug harness inside the Manager and the helpers that throw for everyone (invariant and the Result adapters); only where packages/utils/src/invariant.ts exists. | wiki: core.md › Errors as values<br>wiki: typescript/README.md › Errors as values: neverthrow<br>wiki: libraries/neverthrow.md › Result for sync, ResultAsync for async<br>STYLEGUIDE.md: Error Handling with neverthrow › Core Principles |
| `plugin/no-try-catch-into-result` | Do not turn a throw into a Result with try/catch; use fromSync, fromThrowable or fromPromise. Applies to non-test files. | wiki: core.md › Errors as values<br>wiki: libraries/neverthrow.md › Never mix Result with try-catch<br>STYLEGUIDE.md: Error Handling with neverthrow › Critical Anti-Patterns<br>Greptile: `fromSync-not-trycatch`<br>Greptile: `no-mix-result-trycatch` |
| `plugin/tagged-errors` | A Result carries a specific TaggedError class as its error, not a bare Error or string. Applies to non-test files. | wiki: libraries/neverthrow.md › Specific error classes built from TaggedError<br>STYLEGUIDE.md: Error Handling with neverthrow › Core Principles<br>Greptile: `tagged-error-classes` |
| `plugin/no-effect-data-fetching` | Never fetch data in useEffect; use TanStack Query. | wiki: libraries/react.md › Never use useEffect for data fetching (Must)<br>wiki: libraries/tanstack-query.md › TanStack Query owns all server and async state<br>STYLEGUIDE.md: React Patterns › Never Use useEffect for Data Fetching<br>Greptile: `no-effect-data-fetching` |
| `plugin/effect-in-named-hook` | An effect longer than five lines or async moves into a named use* hook. Applies to component files (.tsx), not tests. | wiki: libraries/react.md › Extract non-trivial effects into named hooks (Default)<br>STYLEGUIDE.md: React Patterns › useEffect Usage Policy<br>Greptile: `extract-effect-to-hook` |
| `plugin/no-effect-transactions` | Never start or submit a transaction from useEffect. | wiki: libraries/xstate.md › Never chain transactions with useEffect<br>STYLEGUIDE.md: State Management › Multi-Step Transaction Orchestration Anti-Pattern<br>Greptile: `no-effect-transaction-chaining` |
| `plugin/no-copied-mutation-state` | Read a mutation's isPending, isSuccess, data or error directly; never copy it. | STYLEGUIDE.md: State Management › Single Transaction Pattern<br>Greptile: `mutation-isPending-direct` |
| `plugin/no-or-grouped-query-states` | Render each query's loading and error state on its own; never combine them with `\|\|`. | wiki: libraries/tanstack-query.md › Handle each query's loading and error states independently<br>STYLEGUIDE.md: Data Fetching with TanStack Query › Handle Query States Independently<br>Greptile: `independent-query-states` |
| `plugin/no-literal-query-keys` | Build query keys with createQueryKey and a named params object, not an array literal. | wiki: libraries/tanstack-query.md › Build query keys with the object-param key factory<br>STYLEGUIDE.md: Data Fetching with TanStack Query › Query Key Patterns<br>Greptile: `object-based-query-keys` |
| `plugin/no-try-in-query-fn` | Never wrap a queryFn in try/catch; return a Result through resultQueryOptions. | wiki: libraries/tanstack-query.md › Wrap fallible query functions so the Result is unwrapped at the boundary |
| `plugin/no-raw-request-reads` | Route handlers read `c.req.valid(...)`, never the raw request. Applies to route files. | wiki: libraries/valibot.md › Validate inbound HTTP bodies with vValidator at the boundary |
| `plugin/no-throwing-parse` | No throwing `v.parse` at non-HTTP boundaries; use safeParse and a Result. Applies to non-test files. | wiki: libraries/valibot.md › Lift parse failures into a Result, never let them throw at non-HTTP boundaries |
| `plugin/picklist-over-literal-union` | Model a closed set with `v.picklist`, not a union of `v.literal`. | wiki: libraries/valibot.md › Model closed string enums with v.picklist and derive the union from it |
| `plugin/address-type` | Type an address as viem's `Address`, not `string`. Applies to non-test files. | wiki: libraries/web3.md › Use the Address type and validate at the boundary with isAddress<br>STYLEGUIDE.md: Web3 & Blockchain Patterns › Address Type Safety |
| `plugin/no-client-in-function` | Create viem clients once at module scope, never inside a function or component. Applies to non-test files. | wiki: libraries/web3.md › Instantiate clients once; access them through a safe accessor<br>STYLEGUIDE.md: Summary › Golden Rules<br>Greptile: `clients-instantiated-once` |
| `plugin/jsonb-needs-type` | Every jsonb column carries `.$type<...>()`. | wiki: libraries/drizzle.md › Type enum-like and JSON columns with `.$type<>()` against shared-schema unions |
| `plugin/tables-with-relations` | A schema file that declares pgTable also declares its relations(). Applies to database schema files. | wiki: libraries/drizzle.md › Express identity and relations on the table, not in queries |
| `plugin/no-getdatabase-in-routes` | Route handlers take the database from injectDb (`c.var.db`), not getDatabase(). Applies to api-worker route files. | wiki: libraries/drizzle.md › Inject the db through `injectDb`; read it from `c.var.db`, never ambient state |
| `plugin/no-vite-secret-env` | No secret-looking `VITE_` variable: it ships to the browser. | wiki: libraries/tanstack-start.md › Choose a server function for RPC, a server route for a fixed HTTP URL |
| `plugin/readonly-members` | Fields of interfaces and object types are readonly; array parameters take readonly arrays. Applies to files other than .d.ts. | wiki: typescript/README.md › Immutability constructs<br>wiki: libraries/react.md › Name and co-locate props types (Default)<br>STYLEGUIDE.md: TypeScript Usage › Use Readonly for Immutability<br>Greptile: `readonly-immutable-types` |
| `plugin/constants-upper-snake` | Name a module-level number, bigint or address constant in UPPER_SNAKE_CASE. Applies to non-test files. | wiki: typescript/README.md › Naming conventions<br>STYLEGUIDE.md: Naming Conventions › Constants<br>Greptile: `constants-upper-snake` |
| `plugin/no-bare-outline-none` | Pair `outline-none` with a `focus-visible:` style. | wiki: libraries/react.md › Build accessible, semantic, keyboard-operable UI (Default)<br>STYLEGUIDE.md: Accessibility › WCAG 2 Examples<br>Greptile: `focus-visible-rings` |
| `plugin/no-emoji` | No emojis in the arguments of console and logger calls; text a user reads (a Telegram message, interface copy) may keep them. Applies to non-test files. | Greptile: `no-emojis-in-code` |
| `plugin/no-arbitrary-tailwind` | Use a design token, not a bracketed pixel or hex value; calc(), var(), grids and [property:value] are allowed. Applies to non-test files. | wiki: libraries/styling.md › Design tokens over arbitrary values<br>STYLEGUIDE.md: Styling with Tailwind CSS › Avoid Arbitrary Values<br>Greptile: `no-arbitrary-tailwind` |
| `plugin/no-skipped-tests` | No skipped test or suite in committed code; a runtime guard with a reason is fine. Applies to test files. | wiki: libraries/testing.md › Tool-enforced |
| `agent/no-unchecked-cast` | No cast that narrows a type without a check; error mappers, type placeholders and widening casts are fine. Applies to non-test files. | wiki: core.md › Type-safety first<br>wiki: typescript/README.md › Type-safety: strict and no holes |
| `agent/no-shared-mutation` | Never mutate what a function does not own: a parameter, import, module-level value, captured variable or `this`. Applies to non-test files. | wiki: core.md › Minimal mutation<br>wiki: typescript/README.md › Immutability constructs<br>STYLEGUIDE.md: Core Principles › 4. Functional-Light Programming<br>Greptile: `no-mutation` |
| `agent/hoist-pure-helpers` | A helper inside a component or hook that uses nothing from it lives at module scope. Applies to non-test files. | wiki: libraries/react.md › Hoist static values and pure functions out of the body (Default)<br>STYLEGUIDE.md: React Patterns › Extract Static Values and Pure Functions |
| `agent/no-foreign-testid` | Query by role, label or text, not by a test id the test does not render itself. Applies to test files. | wiki: libraries/testing.md › Test from the user's perspective<br>STYLEGUIDE.md: Testing Strategy › Test Examples |
| `testing-library/prefer-user-event` | Drive interaction with userEvent, not fireEvent. Applies to Explorer test files (the only app with user-event installed). | wiki: libraries/testing.md › Test from the user's perspective |
| `@typescript-eslint/naming-convention` | Boolean variables and parameters start with is, has, should or can. | wiki: typescript/README.md › Naming conventions<br>STYLEGUIDE.md: Naming Conventions › Boolean Naming<br>Greptile: `boolean-prefixes` |
| `@eslint-react/no-leaked-conditional-rendering` | No `&&` whose left side can render 0, '' or 0n. | wiki: libraries/react.md › Pattern-match conditional rendering; no leaky `&&` (Default)<br>STYLEGUIDE.md: React Patterns › Pattern Matching for Conditional Rendering<br>Greptile: `pattern-match-complex-conditionals` |
| `@tanstack/query/prefer-query-options` | Express each resource as a query-options factory. | wiki: libraries/tanstack-query.md › Define data as query-options factories, not custom hook wrappers<br>STYLEGUIDE.md: Data Fetching with TanStack Query › Query Structure<br>Greptile: `resultQueryOptions-factories` |
| `agent/must-use-result` | Never discard a neverthrow Result or ResultAsync. | wiki: core.md › Errors as values<br>wiki: typescript/README.md › Errors as values: neverthrow<br>wiki: libraries/neverthrow.md › Always handle both ok and err<br>STYLEGUIDE.md: Error Handling with neverthrow › Core Principles |
| `agent/no-number-on-bigint` | Chain quantities stay bigint; no `Number()` on a bigint amount. A time, id, code or count (judged by its name), a difference, and an amount scaled by `10 ** decimals` into the unit a person reads pass. | wiki: libraries/web3.md › Use BigInt for every blockchain numeric value<br>STYLEGUIDE.md: Web3 & Blockchain Patterns › BigInt Handling<br>Greptile: `bigint-blockchain-values` |
| `agent/icon-size-classes` | Size lucide icons with size-* classes, not size, width or height props. | wiki: libraries/styling.md › Icon sizing through size utilities<br>STYLEGUIDE.md: Styling with Tailwind CSS › Icon Sizing with Lucide<br>Greptile: `lucide-size-class` |
| `testing-library/prefer-find-by` | Wait with findBy, not waitFor around a getBy. Applies to test files. | wiki: libraries/testing.md › Test from the user's perspective |
| `text/no-a11y-suppression` | Never suppress an accessibility rule; fix the markup. | STYLEGUIDE.md: Code Formatting & Linting with Biome › Ignoring Biome Rules |
| `text/eslint-disable-reason` | Every eslint-disable carries its reason after `--`. | wiki: core.md › Documenting deviations |
| `text/no-emoji-in-comments` | No emojis in comments. Applies to non-test files. | Greptile: `no-emojis-in-code` |
| `tsc/noUncheckedIndexedAccess` | Index access may be undefined; handle it. | wiki: typescript/README.md › Type-safety: strict and no holes |
<!-- agent-lint:rules:end -->
