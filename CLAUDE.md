# ENS Apps Monorepo - Development Guidelines

## Core Design Principles

### 1. Code Co-location

**Principle**: Code should be co-located next to where it is used, not grouped by technical type.

**Guidelines**:
- ✅ **DO**: Place code files next to the single file that uses them
- ❌ **DON'T**: Create shared folders (`helpers/`, `utils/`, `services/`) for single-use code
- ✅ **DO**: Only use shared folders when code is used by **2 or more files**
- ❌ **DON'T**: Prematurely abstract code into shared locations "just in case"

**Why This Matters**:
1. **Easier to find**: Code is where you expect it to be
2. **Easier to change**: Changes are localized, no unexpected side effects
3. **Easier to delete**: When removing a feature, all related code is together
4. **Clearer dependencies**: It's obvious what code depends on what

**Examples**:

```typescript
// ❌ AVOID: Single-use helper in shared folder
src/
├── helpers/
│   └── formatUserName.ts  // Only used by UserProfile.tsx
└── components/
    └── UserProfile.tsx

// ✅ CORRECT: Co-located next to usage
src/
└── components/
    ├── UserProfile.tsx
    └── UserProfile.helpers.ts  // formatUserName lives here
```

```typescript
// ✅ CORRECT: Shared helper used by multiple files
src/
├── helpers/
│   └── formatCurrency.ts  // Used by 5+ components
└── components/
    ├── InvoiceList.tsx
    ├── PaymentForm.tsx
    └── Dashboard.tsx
```

**Folder Structure Guidelines**:
- `helpers/` - Only for code used by 2+ files
- `utils/` - Only for code used by 2+ files
- `services/` - Only for code used by 2+ files
- Otherwise, keep code next to its single usage point

---

### 2. Business Logic Outside React Components

**General Principle**: Business logic should live **outside** React components, not embedded within them. Components should primarily contain UI state and rendering logic.

**Business logic can live in**:
- ✅ **State machines** (for complex multi-step flows with state transitions)
- ✅ **Pure functions** (helpers, utilities, validators)
- ✅ **Click handler functions** (external functions called from inline handlers)
- ✅ **Services/API clients** (data fetching, transformations)
- ✅ **Custom hooks** (for reusable logic with React lifecycle)

**Why This Matters**:
1. **Testability**: Business logic can be unit tested without React
2. **Reusability**: Same logic works in web, mobile, CLI, or tests
3. **Maintainability**: Clear separation between business rules and UI concerns
4. **Type Safety**: All dependencies are explicit parameters

**Example - Extract Handler to Pure Function**:

```typescript
// ❌ AVOID: Business logic embedded in component
function MyComponent() {
  const [name, setName] = useState('')
  const { publicClient, walletClient } = useClients()

  const handleSubmit = async () => {
    if (!name) {
      alert('Please enter a name')
      return
    }

    try {
      const result = await prepareTransaction(name, publicClient, walletClient)
      // ... complex business logic here
    } catch (error) {
      alert(error.message)
    }
  }

  return <button onClick={handleSubmit}>Submit</button>
}
```

```typescript
// ✅ CORRECT: Business logic in external pure function
// helpers/submission.helpers.ts
export async function handleSubmission(
  formData: { name: string },
  params: { publicClient: PublicClient; walletClient: WalletClient },
  handlers: {
    onSuccess: (data: TransactionData) => void
    onError: (error: Error) => void
    onValidationError: (message: string) => void
  }
): Promise<void> {
  // Validation
  if (!formData.name) {
    handlers.onValidationError('Please enter a name')
    return
  }

  // Business logic
  const result = await prepareTransaction(
    formData.name,
    params.publicClient,
    params.walletClient
  )

  // Handle result
  if (result.isOk()) {
    handlers.onSuccess(result.value)
  } else {
    handlers.onError(result.error)
  }
}

// MyComponent.tsx
function MyComponent() {
  const [name, setName] = useState('')
  const { publicClient, walletClient } = useClients()

  const handleSubmit = () => {
    handleSubmission(
      { name },
      { publicClient, walletClient },
      {
        onSuccess: (data) => console.log('Success', data),
        onError: (error) => alert(error.message),
        onValidationError: (msg) => alert(msg),
      }
    )
  }

  return <button onClick={handleSubmit}>Submit</button>
}
```

### 3. Pattern Matching Over Conditional Operators

**Principle**: Use `ts-pattern` for conditional rendering instead of `&&` operators or ternaries. This provides type-safe, explicit, and composable conditional logic.

**Why This Matters**:
1. **Type Safety**: Exhaustive checks catch missing cases at compile time
2. **Explicit**: All possible states are visible and documented
3. **Composable**: Easy to nest and combine patterns
4. **Maintainable**: Clear intent and easier to refactor

**Example - Conditional Rendering**:

```typescript
// ❌ AVOID: && operators
{isConnected && <ConnectedContent />}
{!isConnected && <PleaseConnect />}
{renewalPrice && <div>Price: {formatEther(renewalPrice)}</div>}

// ✅ CORRECT: ts-pattern with exhaustive checks
import { match } from 'ts-pattern'
import { P } from 'ts-pattern'

{match({ isConnected })
  .with({ isConnected: false }, () => <PleaseConnect />)
  .with({ isConnected: true }, () => <ConnectedContent />)
  .exhaustive()}

{match({ renewalPrice })
  .with({ renewalPrice: P.not(P.nullish) }, ({ renewalPrice }) => (
    <div>Price: {formatEther(renewalPrice!)}</div>
  ))
  .otherwise(() => null)}
```

### 4. State Machines for Complex Flows

**Principle**: Use XState for managing complex multi-step flows, especially those involving async operations, retries, or state dependencies.

**When to use state machines**:
- ✅ Multi-step workflows (transactions, onboarding)
- ✅ Complex state dependencies
- ✅ Retry/fallback logic
- ✅ Audit trails needed

**When NOT to use state machines**:
- ❌ Simple UI state (modals, dropdowns)
- ❌ Derived/computed state
- ❌ State already managed by parent machine

See `packages/transaction-manager/TRANSACTION_FLOW.md` for a complete example.

### 5. Component Organization: Extract Static Values and Side Effects

**Principle**: React components should be clean and focused on rendering. Extract static values, pure functions, and complex side effects outside the component body.

**What to Extract**:
1. **Static constants** → Module-level constants
2. **Pure helper functions** → Module-level functions
3. **Complex useEffect logic** → Custom hooks

**Why This Matters**:
1. **Performance**: Static values aren't recreated on every render
2. **Clarity**: Component body shows only UI-relevant logic
3. **Testability**: Extracted functions/hooks are easier to test
4. **Reusability**: Custom hooks can be shared across components

#### Extract Static Constants

```typescript
// ❌ AVOID: Static values recreated on every render
function MyComponent() {
  const config = {
    chain: sepolia,
    apiKey: import.meta.env.VITE_API_KEY,
  }

  const YEAR_IN_SECONDS = 31536000n

  return <div>...</div>
}

// ✅ CORRECT: Static values outside component
const YEAR_IN_SECONDS = 31536000n

const appConfig = {
  chain: sepolia,
  apiKey: import.meta.env.VITE_API_KEY,
}

function MyComponent() {
  return <div>...</div>
}
```

#### Extract Pure Helper Functions

```typescript
// ❌ AVOID: Helper function recreated on every render
function MyComponent({ isConnected, publicClient }) {
  const getLoadingState = () => {
    return match({ isConnected })
      .with({ isConnected: false }, () => ({
        message: 'Please connect wallet',
        canRender: false,
      }))
      .otherwise(() => ({ message: '', canRender: true }))
  }

  const loadingState = getLoadingState()
  return <div>{loadingState.message}</div>
}

// ✅ CORRECT: Pure function outside component
function getLoadingState(params: {
  isConnected: boolean
  publicClient: any
}) {
  return match(params)
    .with({ isConnected: false }, () => ({
      message: 'Please connect wallet',
      canRender: false,
    }))
    .otherwise(() => ({ message: '', canRender: true }))
}

function MyComponent({ isConnected, publicClient }) {
  const loadingState = getLoadingState({ isConnected, publicClient })
  return <div>{loadingState.message}</div>
}
```

#### Extract useEffect Logic into Custom Hooks

**🚨 CRITICAL RULE: NO "NAKED" useEffect BLOCKS IN COMPONENTS**

ALL useEffect calls must be extracted into named custom hooks above the component. No exceptions.

**Principle**: There should be ZERO useEffect blocks inside component function bodies. ALL useEffect logic must be extracted into named custom hooks **above the component**.

**Why This Matters**:
- Component body shows **what** side effects occur, not **how** they work
- Side effects are named and self-documenting (the hook name describes the purpose)
- Hooks can be tested independently without React components
- Hooks can be reused in other components
- Easier to understand component dependencies at a glance
- No mental overhead deciding "is this simple enough to inline?"

**Example - Complex Effect:**

```typescript
// ❌ AVOID: Complex useEffect logic directly in component
function MyComponent() {
  const [price, setPrice] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchPrice = async () => {
      if (name && duration && publicClient) {
        if (!cancelled) {
          setLoading(true)
        }

        const result = await getPrice(publicClient, name, duration)

        if (!cancelled) {
          if (result.isOk()) {
            setPrice(result.value)
          } else {
            console.error(result.error)
          }
          setLoading(false)
        }
      }
    }

    fetchPrice()
    return () => { cancelled = true }
  }, [name, duration, publicClient])

  // More useEffect blocks...

  return <div>...</div>
}

// ✅ CORRECT: Extract into named custom hook above component
function useRenewalPrice(params: {
  name: string
  duration: string
  publicClient: any
  onPriceChange: (price: bigint) => void
  onLoadingChange: (loading: boolean) => void
}) {
  const { name, duration, publicClient, onPriceChange, onLoadingChange } = params

  useEffect(() => {
    let cancelled = false

    const fetchPrice = async () => {
      if (name && duration && publicClient) {
        if (!cancelled) {
          onLoadingChange(true)
        }

        const result = await getPrice(publicClient, name, duration)

        if (!cancelled) {
          if (result.isOk()) {
            onPriceChange(result.value)
          } else {
            console.error(result.error)
          }
          onLoadingChange(false)
        }
      }
    }

    fetchPrice()
    return () => { cancelled = true }
  }, [name, duration, publicClient, onPriceChange, onLoadingChange])
}

function MyComponent() {
  const [price, setPrice] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(false)

  // Clean, self-documenting hook usage
  useRenewalPrice({
    name: ui.name,
    duration: ui.duration,
    publicClient,
    onPriceChange: setPrice,
    onLoadingChange: setLoading,
  })

  return <div>...</div>
}
```

**Rule: Extract ALL useEffects**

No exceptions - every useEffect should be in a custom hook, even simple ones:

```typescript
// ❌ AVOID: "Naked" useEffect in component
function MyComponent() {
  useEffect(() => {
    setOpen(false)
  }, [userId])

  return <div>...</div>
}

// ✅ CORRECT: Extracted into named hook
function useResetOpenOnUserChange(userId: string, setOpen: (open: boolean) => void) {
  useEffect(() => {
    setOpen(false)
  }, [userId, setOpen])
}

function MyComponent() {
  const [open, setOpen] = useState(true)

  useResetOpenOnUserChange(userId, setOpen)

  return <div>...</div>
}
```

**Why extract even simple effects?**
- The hook name documents **why** the effect exists (`useResetOpenOnUserChange` is clearer than inline logic)
- Easy to add complexity later without touching component
- Consistent pattern - no judgment calls about "is this simple enough?"
- Component body stays focused on rendering

**Real-World Example**: See `packages/transaction-manager-example/src/ENSRenewalExample.tsx` for a complete example with:
- `useRenewalPrice` - Fetch ENS renewal price
- `useRhinestoneAccountInit` - Initialize smart account
- `useSmartAccountAddress` - Sync account address to UI
- `useClearAccountOnWalletChange` - Clear account on wallet change
- `useSmartAccountBalance` - Fetch and poll balance

## Package-Specific Documentation

When working in specific packages, consult these design documents:

### Transaction Manager
**Location**: `packages/transaction-manager/`
**Documentation**: `TRANSACTION_FLOW.md`

**Key Concepts**:
- Complete transaction flow architecture
- XState machine handling transaction lifecycle
- Integration with Rhinestone smart accounts
- EOA vs ERC-4337 transaction flows
- Pattern matching for conditional rendering

**When to Consult**: When working on transaction submission, state management, or payment flows.

## TanStack Query Best Practices

This project uses TanStack Query with a custom `resultQueryOptions` wrapper that integrates with `neverthrow` for error handling. **ALWAYS** follow these patterns when working with queries:

### Query Key Patterns

1. **Use tuple format**: `[feature, params]` where:
   - First element is a string identifier for the query type
   - Second element is an object containing all parameters

2. **Always use `as const`** for better TypeScript inference:
   ```typescript
   queryKey: ['profile', { name }] as const
   ```

### File Organization

- **Services**: Place query options in service files (`*.service.ts`)
- **Hooks**: Create custom hooks that use the query options
- **Consistent naming**:
  - Query options: `get[Feature]QueryOptions`
  - Query keys: `[feature]QueryKey`
  - Service functions: Should return `Result` or `ResultAsync` from neverthrow

### Example Patterns in This Codebase

Reference these files for correct patterns:
- `/src/features/profile/hooks/useProfile.ts`
- `/src/features/profile/hooks/useEnsOwner.ts`
- `/src/hooks/useSupportsInterfaces.ts`

### Testing Queries

When testing components that use queries:
1. Mock the entire query options function
2. Ensure proper error states are tested using neverthrow's Result type
3. Test loading states appropriately

## Other Project Conventions

### Error Handling with neverthrow

**Core Requirements:**
- Use `neverthrow` Result types for all async operations
- Create specific error classes extending `TaggedError`
- Always handle both success and error cases explicitly
- **NEVER mix Result with try-catch** - choose one approach

**See [/Volumes/My Shared Files/ENS/CLAUDE.md](../../CLAUDE.md#neverthrow---functional-error-handling) for complete neverthrow patterns and API reference.**

#### Critical Anti-Patterns to Avoid

**❌ NEVER manually unwrap Results with throw:**
```typescript
// ❌ WRONG - defeats neverthrow's purpose
ResultAsync.fromPromise(
  helper(...).then((result) => {
    if (result.isErr()) throw result.error  // BAD!
    return result.value
  }),
  (error) => error
)

// ✅ CORRECT - chain Results directly
return helper(...)  // Just return the ResultAsync
```

**❌ NEVER mix try-catch with ResultAsync:**
```typescript
// ❌ WRONG
try {
  const data = processSync()
  return ResultAsync.fromSafePromise(Promise.resolve(data))
} catch (error) {
  return errAsync(new Error(error))
}

// ✅ CORRECT
return ResultAsync.fromSafePromise(
  Promise.resolve().then(() => processSync())
).mapErr((error) => new Error(error))
```

**❌ NEVER use try-catch in async helpers:**
```typescript
// ❌ WRONG
async function fetchData(): Promise<Result<Data, Error>> {
  try {
    const result = await api.fetch()
    return ok(result)
  } catch (error) {
    return err(new Error(error))
  }
}

// ✅ CORRECT
function fetchData(): ResultAsync<Data, Error> {
  return ResultAsync.fromPromise(
    api.fetch(),
    (error) => new Error(error)
  )
}
```

**Quick Reference:**
- `ok()` / `err()` → for `Result<T, E>` (sync)
- `okAsync()` / `errAsync()` → for `ResultAsync<T, E>` (async)
- `ResultAsync.fromPromise(promise, errorFn)` → wrap Promises
- `.andThen(fn)` → chain Results
- `.map(fn)` / `.mapErr(fn)` → transform values/errors
- `fromResultAsync(fn)` → integrate with XState actors (from `@ens-apps/utils/xstate/neverthrow`)

### TypeScript
- Strict mode is enabled
- Avoid `any` types
- Use proper type inference where possible
- Type cast only when necessary with clear intent

### Code Style
- Follow existing patterns in neighboring files
- Use the project's established utilities and helpers
- Check imports from existing files before adding new dependencies
