# Testing and Tooling

Guidelines for testing strategy, writing testable code, and configuring development tools.

> **See also**: [README.md](./README.md) for core principles | [STATE-AND-DATA.md](./STATE-AND-DATA.md) for testing neverthrow code.

## Table of Contents

- [Testing Strategy](#testing-strategy)
- [Code Formatting \& Linting with Biome](#code-formatting--linting-with-biome)

## Testing Strategy

### Testing Philosophy

Write code that is easy to test by design:

1. **Pure functions** - Same inputs always produce same outputs
2. **Explicit dependencies** - Pass dependencies as parameters  
3. **Separation of concerns** - Business logic separate from UI
4. **Small, focused functions** - Each function does one thing

### The Testing Pyramid

**Test Distribution:**
- **70% Unit Tests** - Fast, isolated, test pure functions
- **20% Integration Tests** - Test module interactions
- **10% E2E Tests** - Test critical user flows

### Writing Testable Code

**Extract business logic to testable functions:**

```typescript
// ❌ Hard to test - Logic in component
export const RegistrationForm = () => {
  const handleSubmit = async () => {
    if (!email || !email.includes('@')) { alert('Invalid email'); return }
    // Mixed validation, API calls, UI updates...
  }
  return <form onSubmit={handleSubmit}>...</form>
}

// ✅ Testable - Logic extracted
// helpers/registration.helpers.ts
export function validateRegistration(data: { email: string; name: string }): Result<...> {
  if (!data.email || !data.email.includes('@')) {
    return err(new ValidationError({ message: 'Invalid email', field: 'email' }))
  }
  return ok(data)
}

export const registerUser = ResultFn(async function* (data) {
  const validated = yield* validateRegistration(data)
  const user = yield* ResultAsync.fromPromise(api.register(validated), ...)
  return ok(user)
})

// Component is now thin
export const RegistrationForm = () => {
  const handleSubmit = async () => {
    const result = await registerUser({ email, name })
    
    // Early return pattern (preferred)
    if (result.isErr()) {
      onError(result.error)
      return
    }
    
    onSuccess(result.value)
  }
  return <form onSubmit={handleSubmit}>...</form>
}
```

**Test in isolation:**

```typescript
describe('validateRegistration', () => {
  it('should validate correct data', () => {
    const result = validateRegistration({ email: 'john@example.com', name: 'John' })
    assert(result.isOk())
  })
  
  it('should reject invalid email', () => {
    const result = validateRegistration({ email: 'invalid', name: 'John' })
    assert(result.isErr())
    expect(result.error.field).toBe('email')
  })
})
```

**Dependency Injection** - Pass dependencies as parameters for easy mocking:

```typescript
// ✅ Easy to test
async function getUser(id: string, deps: { database: Database; cache: Cache }) {
  const cached = deps.cache.get(`user:${id}`)
  if (cached) return ok(cached)
  return ResultAsync.fromPromise(deps.database.users.findById(id), ...)
}

// Test with mocks
it('should return cached user', async () => {
  const mockCache = { get: vi.fn().mockReturnValue({ id: '1' }), set: vi.fn() }
  const result = await getUser('1', { database: mockDb, cache: mockCache })
  assert(result.isOk())
})
```

### Test Examples

**Unit Tests** - Test pure functions with Result types:

```typescript
describe('calculateRenewalPrice', () => {
  it('should calculate price for 1 year', async () => {
    const result = await calculateRenewalPrice('vitalik.eth', YEAR_IN_SECONDS)
    assert(result.isOk())
    expect(result.value).toBeGreaterThan(0n)
  })
  
  it('should handle invalid names', async () => {
    const result = await calculateRenewalPrice('', YEAR_IN_SECONDS)
    assert(result.isErr())
    expect(result.error).toBeInstanceOf(InvalidNameError)
  })
})
```

**Component Tests** - Test from user's perspective:

```typescript
describe('ProfileCard', () => {
  it('should display profile information', async () => {
    render(<ProfileCard name="vitalik.eth" />)
    await waitFor(() => expect(screen.getByText('vitalik.eth')).toBeInTheDocument())
  })
  
  it('should handle edit button click', async () => {
    const onEdit = vi.fn()
    render(<ProfileCard name="vitalik.eth" onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })
})
```

### What to Test

**✅ DO Test:**
- Business logic (pure functions, calculations)
- Error handling (all error paths with neverthrow)
- Edge cases (empty arrays, null/undefined, boundaries)
- User interactions (clicks, form submissions)
- State transitions (XState machines)

**❌ DON'T Test:**
- Third-party libraries
- Implementation details
- Styling/visual appearance
- Constants
- Type checking (TypeScript does this)

## Code Formatting & Linting with Biome

### Why Biome?

Biome is a fast, unified toolchain for formatting and linting. It replaces ESLint and Prettier with a single tool:

- **Fast**: Written in Rust, 10-100x faster than ESLint
- **Unified**: One tool for formatting and linting
- **Zero config**: Works out of the box with sensible defaults
- **Import sorting**: Built-in `organizeImports` feature
- **IDE support**: First-class support in VSCode/Cursor

### Biome Configuration

Project uses Biome for formatting and linting. See `biome.jsonc` in the root.

**Key Settings:**
- **Formatter**: 2 spaces, single quotes, semicolons as needed
- **Linter**: All recommended rules + custom a11y rules
- **Auto-organize imports**: Enabled

### Formatting Rules

- **Indentation**: 2 spaces
- **Quotes**: Single quotes
- **Semicolons**: As needed (ASI-safe)
- **Import Organization**: Automatic (type imports → external → internal)

```typescript
// Format example
const name = 'vitalik.eth'
const config = { timeout: 5000, retries: 3 }

// Imports auto-organized
import type { Address } from 'viem'
import { formatEther } from 'viem'
import { useAccount } from 'wagmi'

import { Button } from '@/components/ui/button'
```

### Key Linting Rules

| Rule | Purpose | Fix |
|------|---------|-----|
| `noExplicitAny` | Avoid `any` types | Use `unknown` + type guards |
| `noNonNullAssertion` | Avoid `!` operator | Use `?.` or type guards |
| `useButtonType` | Explicit button types | Add `type="button"` |
| `useKeyWithClickEvents` | Keyboard accessibility | Add `onKeyDown` or use `<button>` |
| `noNestedComponentDefinitions` | Don't nest components | Define outside parent |

### Running Biome

```bash
pnpm biome check --write .  # Format + lint + fix
pnpm biome format --write . # Format only
```

### IDE Setup

Install Biome extension and set as default formatter. Enable format-on-save and organize imports.

### Ignoring Biome Rules

Use sparingly for legitimate cases:

```typescript
// Ignore specific line
// biome-ignore lint/suspicious/noExplicitAny: Third-party types unavailable
const data: any = externalLibrary.getData()
```

**When to ignore**: Third-party type issues, generated files, documented edge cases  
**When NOT to ignore**: To avoid fixing real issues, skip proper typing, suppress a11y warnings

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


---

*This style guide is a living document. As the ENS Portal evolves, so should these guidelines. When in doubt, follow existing patterns in the codebase and prioritize clarity and maintainability.*
