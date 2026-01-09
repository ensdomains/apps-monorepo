# ENS Portal App Style Guide

A comprehensive guide for writing clean, maintainable, and type-safe code for the ENS Portal application.

> **Note for Contributors**: This guide is opinionated by design to maintain consistency across the codebase. When in doubt, follow existing patterns and favor clarity. Reasonable exceptions are allowed when justified—see the **Rule Severity** section for guidance on when rules are mandatory vs. preferred.

## Breaking the Rules

**Every rule can and will be broken in certain cases.** When you deviate from these guidelines:

1. ✅ **Leave a comment in the code** explaining why
2. ✅ **Make it intentional** - not accidental
3. ✅ **Document the trade-off** - what you gained vs what you gave up

```typescript
// ✅ GOOD - Rule break is documented
function processLargeDataset(data: any) { // Using 'any' because third-party library has no types
  return transform(data)
}

// ❌ BAD - Silent rule break
function processLargeDataset(data: any) {
  return transform(data)
}
```

**Rule breaks should always be intentional, not accidental.**

## 📚 Guide Navigation

**Start here:** Read this README for core principles, rule severity, and the decision framework.

### By Role/Task

**Writing TypeScript or general code?** → [TYPESCRIPT-AND-CODE-QUALITY.md](./TYPESCRIPT-AND-CODE-QUALITY.md)
- File organization, naming conventions
- TypeScript best practices
- Functional programming principles
- General coding guidelines

**Working on React components or UI?** → [REACT-AND-UI.md](./REACT-AND-UI.md)
- React patterns and component structure
- Composition patterns
- Styling with Tailwind and Shadcn
- Routing with TanStack Router
- Accessibility

**Managing state or fetching data?** → [STATE-AND-DATA.md](./STATE-AND-DATA.md)
- State complexity ladder (useState → XState)
- Error handling with neverthrow
- Data fetching with TanStack Query
- Performance optimization
- Error boundaries

**Integrating with blockchain/smart contracts?** → [WEB3.md](./WEB3.md)
- Contract interaction patterns
- wagmi & viem best practices
- ENS-specific patterns
- BigInt and Address handling

**Setting up testing or tooling?** → [TESTING-AND-TOOLING.md](./TESTING-AND-TOOLING.md)
- Testing strategy and pyramid
- Writing testable code
- Unit and component tests
- Biome configuration

### By Technology

- **TypeScript, general coding** → [TYPESCRIPT-AND-CODE-QUALITY.md](./TYPESCRIPT-AND-CODE-QUALITY.md)
- **React 19** → [REACT-AND-UI.md](./REACT-AND-UI.md)
- **neverthrow** → [STATE-AND-DATA.md](./STATE-AND-DATA.md)
- **TanStack Query** → [STATE-AND-DATA.md](./STATE-AND-DATA.md)
- **XState** → [STATE-AND-DATA.md](./STATE-AND-DATA.md)
- **TanStack Router** → [REACT-AND-UI.md](./REACT-AND-UI.md)
- **Tailwind, Shadcn** → [REACT-AND-UI.md](./REACT-AND-UI.md)
- **wagmi, viem, ENSjs** → [WEB3.md](./WEB3.md)
- **Vitest, Testing Library** → [TESTING-AND-TOOLING.md](./TESTING-AND-TOOLING.md)
- **Biome** → [TESTING-AND-TOOLING.md](./TESTING-AND-TOOLING.md)

## Core Principles

The ENS Portal codebase is built on these fundamental principles:

### 1. Thin React Layer

**Keep React components focused on presentation and user interaction, not business logic.**

Components should:
- Render UI based on props and state
- Handle user events by calling external functions
- Manage simple UI state (modals, form inputs)

Components should NOT:
- Contain complex business logic
- Directly manipulate blockchain state
- Include data transformation logic

### 2. Code Co-location

**Place code next to where it's used, not grouped by technical type.**

✅ **DO**: Place helper files next to the single component that uses them
❌ **DON'T**: Create shared folders for single-use code
✅ **DO**: Only use shared folders when code is used by 2+ files

### 3. Explicit Over Implicit

**Make data flow visible and dependencies clear.**

- Use pattern matching over conditional operators
- Pass dependencies as explicit parameters
- Avoid hiding complexity in abstractions

### 4. Functional-Light Programming

**Embrace functional programming principles pragmatically:**

- **Immutability**: Transform data, don't mutate it (🔴 Must)
- **Pure functions**: Same input → same output, no side effects (🟡 Default)
- **Composition**: Build complex operations from simple ones (🟡 Default)
- **Prefer array methods**: Use `map`, `filter`, `reduce` over loops (🟢 Guideline)
  - Loops are allowed when: Early exit is required, performance is critical, or readability is improved

### 5. Type Safety First

**Leverage TypeScript to catch errors at compile time:**

- Strict mode enabled
- Explicit type annotations for function signatures
- No `any` types (use `unknown` if needed)
- Use discriminated unions for state management

## Rule Severity

Not all rules are equally important. Use these tiers to guide your decisions:

### 🔴 Must (Violations require strong justification)

These rules protect against bugs, security issues, or severe maintainability problems:

- **Thin React Layer** - Business logic must be extracted from components
- **Use neverthrow for Result types** - Never mix Result with try-catch
- **Type safety** - No `any` types, use `unknown` + type guards (use `Record<string, unknown>` for objects)
- **BigInt for blockchain values** - All numeric blockchain values use BigInt
- **Immutability** - Don't mutate data structures
- **Never use useEffect for data fetching** - Always use TanStack Query

### 🟡 Default (Follow unless there is a clear reason not to)

These rules represent best practices but allow pragmatic exceptions:

- **TanStack Query for async data** - Don't manually manage loading/error states with useState
- **Extract useEffect** - Effects should be in custom hooks (≤5 lines can stay inline)
- **Avoid query waterfalls** - Split dependent queries into separate components
- **Handle query states independently** - Don't group loading/error states with `||`
- **Use useQueries for parallel queries** - More concise than multiple useQuery calls
- **Use generics to preserve types** - Don't lose type information in utility functions
- **Pattern matching over conditionals** - Use ts-pattern for complex conditions
- **Readonly modifiers** - Mark data as readonly when it won't change
- **Custom hooks for logic** - Avoid custom hooks for business logic (use for DOM/framework APIs)
- **Pure functions** - Extract testable logic to pure functions

### 🟢 Guideline (Preferable, not mandatory)

These rules improve code quality but are stylistic preferences:

- **Array methods over loops** - Prefer `map`/`filter`/`reduce` (loops OK for performance/clarity)
- **Component size** - Keep components under 80 lines (flexible based on complexity)
- **Co-location** - Place code next to usage (balance with reusability)
- **Explaining variables** - Extract complex expressions (use judgment)

**When in doubt**: Follow existing patterns and prioritize clarity over dogma. If a rule seems wrong for your case, document why and discuss with the team.

## Tech Stack Overview

The Portal app uses modern web and Web3 technologies:

### Core Framework
- **React 19** - UI framework with modern hooks and concurrent features
- **TypeScript 5.9** - Type-safe JavaScript with strict mode
- **Vite 7** - Fast build tool with HMR

### State & Data Management
- **TanStack Query 5** - Server state management and caching
- **TanStack Router 1** - Type-safe routing with code splitting
- **XState 5** - State machines for complex workflows
- **neverthrow 8** - Functional error handling with Result types

### Web3 Stack
- **wagmi 3** - React hooks for Ethereum
- **viem 2** - TypeScript Ethereum library
- **@ensdomains/ensjs** - ENS protocol interactions
- **RainbowKit 2** - Wallet connection UI

### UI & Styling
- **Tailwind CSS 4** - Utility-first CSS framework
- **Shadcn UI** - Beautifully designed components built on Radix UI (in `components/ui/`)
- **Radix UI** - Unstyled, accessible component primitives
- **class-variance-authority** - Type-safe variant styling
- **Lucide React** - Icon library (Temporary until icons are provided by UX team)

### Testing & Quality
- **Vitest** - Unit testing framework
- **Biome** - Fast formatter and linter
- **Testing Library** - Component testing utilities

## Summary

### Golden Rules

#### Architecture & Design

1. **Keep React thin** - Components for UI, not business logic (🔴 Must)
2. **Co-locate code** - Keep files next to their usage (🟢 Guideline)
3. **Be explicit** - Make data flow and dependencies clear (🟡 Default)
4. **Separation of concerns** - Business logic separate from presentation (🔴 Must)
5. **File naming conventions** - Use `*.handlers.ts`, `*.machine.ts`, `*.mock.ts` (🟡 Default)
6. **Mock data policy** - All mocks in `*.mock.ts` files, gated by dev flags (🟡 Default)

#### TypeScript & Code Quality

7. **Type everything** - Leverage TypeScript's strict mode (🔴 Must)
8. **No `any` types** - Use `unknown` or `Record<string, unknown>` for type-safe handling (🔴 Must)
9. **Use generics** - Preserve type information in utility functions (🟡 Default)
10. **Use readonly** - Enforce immutability at type level (🟡 Default)
11. **Discriminated unions** - For state management and variants (🟡 Default)

#### Functional Programming

12. **Pure functions** - Same input → same output, no side effects (🟡 Default)
13. **Immutability** - Transform data, don't mutate (🔴 Must)
14. **Prefer array methods** - Use `map`, `filter`, `reduce` (🟢 Guideline)
15. **Composition** - Build complex operations from simple ones (🟡 Default)

#### Error Handling

16. **Use neverthrow** - Functional error handling with `Result` types (🔴 Must)
17. **TaggedError classes** - For discriminated error unions (🟡 Default)
18. **ResultFn generators** - For clean error composition (🟡 Default)
19. **Never mix Result with try-catch** - Choose one approach (🔴 Must)

#### React Patterns

20. **Never useEffect for data fetching** - Always use TanStack Query (🔴 Must)
21. **Extract effects** - Extract `useEffect` to custom hooks (🟡 Default, ≤5 lines OK)
22. **Pattern match** - Use ts-pattern over conditionals (🟡 Default)
23. **Custom hooks for APIs** - Only for DOM/framework APIs, not business logic (🟡 Default)
24. **Component composition** - Build flexible UIs with composition (🟢 Guideline)
25. **Avoid prop drilling** - Use hooks/context for app state, props for local data (🟡 Default)

#### State Management & Data Fetching

26. **React state for UI** - Forms, toggles, simple caching
27. **XState for workflows** - Complex multi-step flows
28. **TanStack Query for async data** - Don't reinvent loading/error states with useState (🟡 Default)
29. **Avoid query waterfalls** - Split dependent queries into separate components (🟡 Default)
30. **Handle query states independently** - Don't group loading/error states with `||` (🟡 Default)
31. **Use useQueries for parallel queries** - More concise than multiple useQuery calls (🟡 Default)
32. **Object-based query keys** - Use singular object for params to enable partial invalidation (🟡 Default)

#### Web3 & Contracts

33. **Simple request builders** - For app-level contract helpers (🟡 Default)
34. **ENSjs two-part pattern** - For library-level contract functions (🟡 Default)
35. **Safe client access** - Use `safeGetClient` helper (🟡 Default)
36. **BigInt for blockchain values** - All numeric blockchain values (🔴 Must)
37. **Instantiate clients once** - Never create clients inside components (🔴 Must)
38. **Define contracts once** - Contract address + ABI in one place (🟡 Default)
39. **Use wagmi hooks for reads** - In React components, never call contracts directly (🟡 Default)

#### Testing & Quality

40. **Write testable code** - Pure functions with explicit dependencies (🟡 Default)
41. **Test business logic** - Unit test pure functions thoroughly (🟡 Default)
42. **Test user behavior** - Component tests from user perspective (🟡 Default)
43. **70/20/10 test distribution** - Unit/Integration/E2E (🟢 Guideline)

#### Performance & Reliability

44. **Measure before optimizing** - Use React DevTools Profiler (🟢 Guideline)
45. **Avoid premature memoization** - Only memoize when proven necessary (🟢 Guideline)
46. **Route-level error boundaries** - Catch rendering errors (🟡 Default)
47. **Result errors ≠ rendering errors** - Use both neverthrow and error boundaries (🟡 Default)

#### Styling & UI

48. **Choose one class helper** - Use `cn` or `tw` consistently (🟡 Default)
49. **Avoid arbitrary values** - Use design tokens, not `w-[37px]` (🟡 Default)

#### Code Formatting

50. **Use Biome** - Format and lint with one tool (🔴 Must)
51. **Single quotes** - For string literals (🟢 Guideline)
52. **2-space indentation** - Consistent formatting (🟢 Guideline)
53. **Organize imports** - Let Biome handle import sorting (🟢 Guideline)

### Decision Framework

Ask yourself these questions when writing code:

#### Separation of Concerns
- Can this logic work outside React? → **Extract to helper function**
- Does this have side effects? → **Use `useEffect` in custom hook**
- Is this testable in isolation? → **Extract to pure function**

#### State Management
- Is this async data fetching? → **Use TanStack Query, not useState**
- Is this UI state or business state? → **React state vs XState**
- Does this need to be cached? → **Use TanStack Query**
- Is this a multi-step flow? → **Use XState machine**
- Creating a query key? → **Use `createQueryKey` with object params for easy invalidation**

#### Type Safety
- Am I using `any`? → **Use `unknown` or proper types**
- Can this fail? → **Return `Result` type**
- Are there multiple variants? → **Use discriminated union**

#### Code Clarity
- Am I hiding complexity? → **Make it explicit**
- Is the data flow clear? → **Add types and explaining variables**
- Will new developers understand this? → **Document intent with names**

#### Error Handling
- Can this operation fail? → **Return `Result` type**
- Do I need multiple error types? → **Use `TaggedError` classes**
- Am I composing multiple operations? → **Use `ResultFn` generator**

#### Testing
- Is this easy to test? → **Extract dependencies, use pure functions**
- What's the user impact? → **Focus tests on behavior**
- Can I mock this? → **Pass dependencies as parameters**

#### Accessibility
- Can keyboard users access this? → **Add keyboard handlers**
- Is this element semantic? → **Use proper HTML elements**
- Are labels associated? → **Connect labels to inputs**

### Common Pitfalls to Avoid

#### ❌ Anti-Patterns

1. **Business logic in components** - Extract to helpers
2. **Data fetching in useEffect** - Use TanStack Query
3. **Naked `useEffect` in components** - Create custom hooks
4. **Query waterfalls in one component** - Split into separate components
5. **Grouping query loading/error states** - Handle independently
6. **Using `any` type** - Use `unknown` or `Record<string, unknown>`
7. **Losing type information** - Use generics to preserve types
8. **Mutating data** - Use immutable transformations
9. **Mixing Result with try-catch** - Choose one approach
10. **Non-null assertions (`!`)** - Use type guards or optional chaining
11. **Complex nested conditionals** - Use pattern matching
12. **Magic numbers and strings** - Extract to named constants
13. **Direct dependency imports** - Use dependency injection
14. **Testing implementation details** - Test user behavior

#### ✅ Best Practices

1. **Pure, testable functions** - Explicit inputs and outputs
2. **Discriminated unions** - For type-safe state management
3. **ResultFn generators** - For error composition
4. **Pattern matching** - For conditional logic
5. **Component composition** - Build flexible UIs
6. **Explaining variables** - Clarify complex expressions
7. **readonly modifiers** - Enforce immutability
8. **Custom error classes** - Tagged errors for pattern matching
9. **Dependency injection** - Pass dependencies as parameters
10. **User-centric tests** - Test from user's perspective

## References

### Core Concepts

- **Functional-Light JS**: [GitHub - getify/Functional-Light-JS](https://github.com/getify/Functional-Light-JS)
- **Clean Code JavaScript**: [GitHub - ryanmcdermott/clean-code-javascript](https://github.com/ryanmcdermott/clean-code-javascript)
- **SOLID Principles in TypeScript**: [LogRocket Blog](https://blog.logrocket.com/applying-solid-principles-typescript/)

### Libraries & Tools

- **React 19**: [react.dev](https://react.dev)
- **TypeScript**: [typescriptlang.org](https://www.typescriptlang.org/)
- **TanStack Query**: [tanstack.com/query](https://tanstack.com/query/latest)
- **TanStack Router**: [tanstack.com/router](https://tanstack.com/router/latest)
- **XState**: [stately.ai/docs/xstate](https://stately.ai/docs/xstate)
- **neverthrow**: [github.com/supermacro/neverthrow](https://github.com/supermacro/neverthrow)
- **wagmi**: [wagmi.sh](https://wagmi.sh/)
- **viem**: [viem.sh](https://viem.sh/)
- **Tailwind CSS**: [tailwindcss.com](https://tailwindcss.com/)
- **Shadcn UI**: [ui.shadcn.com](https://ui.shadcn.com/)
- **Radix UI**: [radix-ui.com](https://www.radix-ui.com/)
- **Biome**: [biomejs.dev](https://biomejs.dev/)

### Internal Documentation

- `CLAUDE.md` - Main development guidelines
- `docs/CODING_GUIDELINES.md` - Coding philosophy
- `packages/transaction-manager/docs/` - Transaction flow architecture

---

*This style guide is a living document. As the ENS Portal evolves, so should these guidelines. When in doubt, follow existing patterns in the codebase and prioritize clarity and maintainability.*
