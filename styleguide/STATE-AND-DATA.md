# State and Data Management

Guidelines for managing state, handling errors, and fetching data in the ENS Portal app.

> **See also**: [README.md](./README.md) for core principles | [REACT-AND-UI.md](./REACT-AND-UI.md) for React patterns.

## Table of Contents

- [State Management](#state-management)
- [Business Logic Extraction](#business-logic-extraction)
- [Error Handling with neverthrow](#error-handling-with-neverthrow)
- [Data Fetching with TanStack Query](#data-fetching-with-tanstack-query)
- [Performance Guidelines](#performance-guidelines)
- [Error Boundaries](#error-boundaries)
- [Advanced neverthrow Patterns](#advanced-neverthrow-patterns)

### Avoid Prop Drilling 🟡 Default

**Don't pass props through intermediate components just to reach a deeply nested child.** Use hooks or context to access data where it's needed.

```typescript
// ❌ AVOID - Prop drilling
function Page() {
  const user = useUser()
  return <Sidebar user={user} />
}

function Sidebar({ user }: { user: User }) {
  return (
    <div>
      <Navigation />
      <ProfileCard user={user} />
    </div>
  )
}

function ProfileCard({ user }: { user: User }) {
  return <div>{user.name}</div>
}

// ✅ CORRECT - Access data where needed
function Page() {
  return <Sidebar />
}

function Sidebar() {
  return (
    <div>
      <Navigation />
      <ProfileCard />
    </div>
  )
}

function ProfileCard() {
  const user = useUser() // Get data directly
  return <div>{user.name}</div>
}
```

**When to use each approach:**

✅ **Use hooks/context for app state:**
- User authentication
- Theme/locale
- Global feature flags
- Data used in multiple places

✅ **Pass props for component-specific data:**
- Direct parent-child communication
- Props that configure component behavior
- Data that flows naturally down one level

❌ **Don't prop drill:**
- Through 3+ component levels
- For data that's not used by intermediate components
- For global app state

**Benefits:**
- ✅ **Less coupling** - Components don't depend on parent structure
- ✅ **Easier refactoring** - Move components without updating props
- ✅ **Clearer intent** - Each component declares what it needs
- ✅ **Better composition** - Intermediate components stay simple

## State Management

### The State Complexity Ladder 🟢 Guideline

As state management needs grow, follow this progression:

```typescript
// 1️⃣ Simple: One or two useState
export const Modal = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  return <Dialog open={isOpen} onOpenChange={setIsOpen}>...</Dialog>
}

// 2️⃣ More complex: useReducer
type State = { count: number; status: 'idle' | 'loading' | 'error'; data: Data | null }
type Action = 
  | { type: 'increment' }
  | { type: 'fetch_start' }
  | { type: 'fetch_success'; data: Data }
  | { type: 'fetch_error' }

export const Counter = () => {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <button onClick={() => dispatch({ type: 'increment' })}>{state.count}</button>
}

// 3️⃣ Even more complex: XState store (context/global state)
import { createStore } from '@xstate/store'

const userStore = createStore({
  context: { user: null, isAuthenticated: false },
  on: {
    login: (context, event) => ({ user: event.user, isAuthenticated: true }),
    logout: () => ({ user: null, isAuthenticated: false }),
  }
})

// 4️⃣ Most complex: XState state machines (workflows with transitions)
const registrationMachine = createMachine({
  initial: 'idle',
  states: {
    idle: { on: { START: 'validating' } },
    validating: { on: { VALID: 'submitting', INVALID: 'error' } },
    submitting: { on: { SUCCESS: 'success', FAILURE: 'error' } },
    success: { type: 'final' },
    error: { on: { RETRY: 'validating' } },
  }
})
```

**When to move up the ladder:**
- **useState → useReducer**: When you have 3+ related state values or complex update logic
- **useReducer → XState Store**: When you need global state or subscriptions
- **XState Store → State Machine**: When you have complex workflows with state transitions, guards, or side effects

**When to stay put:**
- Don't over-engineer - simple state should stay simple
- Most components only need useState
- State machines are for complex multi-step flows (transactions, wizards, onboarding)

### Use React State for Simple UI State

```typescript
// Good - Simple UI state
export const SearchBar = () => {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && <SearchResults query={query} />}
    </div>
  )
}
```

### Use XState for Complex Workflows

Use XState machines for:
- Multi-step transactions
- Complex state transitions
- Retry logic and error recovery
- State that needs audit trails

```typescript
import { useMachine } from '@xstate/react'
import { registrationMachine } from '@/machines/registration.machine'

export const RegistrationFlow = ({ name }: { name: string }) => {
  const [state, send] = useMachine(registrationMachine, {
    input: { name },
  })
  
  // Direct state matching
  const isRegistering = state.matches('registering')
  const registrationHash = state.context.transactionHash
  
  // Direct event sending
  const handleRegister = () => {
    send({ type: 'REGISTER', duration: YEAR_IN_SECONDS })
  }
  
  return match(state.value)
    .with('idle', () => (
      <button onClick={handleRegister}>Register</button>
    ))
    .with('registering', () => (
      <LoadingState hash={registrationHash} />
    ))
    .with('success', () => (
      <SuccessMessage />
    ))
    .exhaustive()
}
```

### Use TanStack Query for Server State 🟡 Default

**Always use TanStack Query for async data fetching**—don't reinvent the wheel with manual `useState`, loading, and error state management.

```typescript
// ❌ AVOID: Manual state management for async data
export const ProfilePage = ({ name }: { name: string }) => {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  
  useEffect(() => {
    setLoading(true)
    fetchProfile(name)
      .then(setProfile)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [name])
  
  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} />
  return <ProfileView profile={profile} />
}

// ✅ CORRECT: Use TanStack Query
export const ProfilePage = ({ name }: { name: string }) => {
  const { data: profile, isLoading, error } = useQuery(getProfileQueryOptions(name))
  
  if (isLoading) return <LoadingState />
  if (error) return <ErrorState error={error} />
  return <ProfileView profile={profile} />
}
```

**Benefits of TanStack Query:**
- ✅ **Automatic caching** - No duplicate requests
- ✅ **Background refetching** - Keep data fresh
- ✅ **Error handling** - Built-in retry logic
- ✅ **Loading states** - `isLoading`, `isFetching`, `isError`
- ✅ **Optimistic updates** - Better UX for mutations
- ✅ **Devtools** - Debug queries and cache

See the **Data Fetching with TanStack Query** section for complete patterns and integration with `neverthrow`.
## Business Logic Extraction

### Pure Functions Over Custom Hooks

Extract business logic into pure helper functions, not custom hooks:

```typescript
// ❌ AVOID: Business logic in custom hook
function useENSRenewal(name: string) {
  const [state, setState] = useState<RenewalState>('idle')
  
  const renew = useCallback(async (duration: bigint) => {
    setState('preparing')
    // 50+ lines of business logic
  }, [name])
  
  return { renew, state }
}

// ✅ CORRECT: Pure helper function
// helpers/ens-renewal.helpers.ts
export function prepareENSRenewal(
  params: PrepareRenewalParams
): ResultAsync<RenewalData, RenewalError> {
  return ResultAsync.fromPromise(
    async () => {
      const price = await calculateRenewalPrice(params.name, params.duration)
      const data = encodeRenewFunction(params.name, params.duration)
      return { price, data, to: ENS_REGISTRAR_ADDRESS }
    },
    (error) => new RenewalError({ cause: error })
  )
}

// Component uses helper directly
export const RenewalButton = ({ name }: { name: string }) => {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync } = useWriteContract()
  const [isPending, setIsPending] = useState(false)
  
  const handleRenew = async () => {
    if (!walletClient) return
    
    setIsPending(true)
    try {
      const result = await prepareENSRenewal({
        name,
        duration: YEAR_IN_SECONDS,
        publicClient,
        walletClient,
      })
      
      // If helper returns Result, check for errors
      if (result.isErr()) {
        console.error('Failed to prepare renewal:', result.error.message)
        return
      }
      
      // Use the prepared data
      const hash = await writeContractAsync(result.value)
      console.log('Transaction sent:', hash)
    } catch (error) {
      console.error('Failed to renew:', error)
    } finally {
      setIsPending(false)
    }
  }
  
  return (
    <button onClick={handleRenew} disabled={isPending}>
      {isPending ? 'Renewing...' : 'Renew'}
    </button>
  )
}
```

### When to Use a Custom Hook (🟡 Default)

**The core problem with custom hooks for business logic**: Hooks are triggered by React's render cycle, but business logic should be triggered by user actions (clicks, form submits, page loads).

**This is a fundamental mismatch:**
- ❌ **React renders** → Run hook → Execute business logic (wrong trigger)
- ✅ **User action** → Call pure function → Execute business logic (correct trigger)

Custom hooks make you carefully manage _when they run_ (dependencies, conditionals) because they're running at the wrong time. Pure functions called from event handlers run exactly when you want them to.

**Use a custom hook when:**

- ✅ **Wrapping framework or browser APIs** - DOM access, localStorage, Web3 hooks
- ✅ **Integrating third-party hooks** - wagmi, TanStack Query, XState
- ✅ **Managing reusable UI state** - Modal disclosure, toggle patterns, form state
- ✅ **Extracting `useEffect` logic** - See useEffect Usage Policy above

**Do NOT use a custom hook when:**

- ❌ **It primarily performs business logic** - Use pure functions instead
- ❌ **Business logic is triggered by user actions** - Call pure function from event handler
- ❌ **It hides domain rules** - Business rules should be explicit
- ❌ **It mixes IO, state, and transformations** - Separate concerns

```typescript
// ✅ Good: Framework/Browser API wrapper
const { address } = useAccount()
const publicClient = usePublicClient()
const [value, setValue] = useLocalStorageState('theme', { defaultValue: 'dark' })

// ✅ Good: XState integration
const [state, send] = useMachine(transactionMachine)

// ❌ Bad: Business logic in hook
function useENSRenewal(name: string) {
  // 50+ lines of validation, pricing, encoding...
  // This should be pure functions!
}

// ✅ Good: Pure functions + thin hook
function calculateRenewalPrice(name: string, duration: bigint): Result<bigint, Error> {
  // Pure business logic
}

function useENSRenewalMutation() {
  // Just wraps wagmi's useMutation
  return useMutation({ mutationFn: calculateRenewalPrice })
}
```

### Helper Function Structure

```typescript
// Good helper structure
import { ResultAsync, errAsync, okAsync } from 'neverthrow'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'

export class RenewalPriceError extends TaggedError('RenewalPriceError')<{
  cause: unknown
}> {}

export const calculateRenewalPrice = ResultFn(async function* (
  name: string,
  duration: bigint
) {
  const client = yield* safeGetClient()
  
  const price = yield* ResultAsync.fromPromise(
    getRenewalPrice(client, { name, duration }),
    (error) => new RenewalPriceError({ cause: error })
  )
  
  return okAsync(price)
})
```
## Error Handling with neverthrow

The codebase uses `neverthrow` for functional error handling with `Result` types.

### Core Principles

1. Use `Result<T, E>` for sync operations, `ResultAsync<T, E>` for async
2. Create specific error classes extending `TaggedError`
3. Always handle both success and error cases explicitly
4. **NEVER mix Result with try-catch**

### Creating Result Functions

```typescript
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { ok, err, ResultAsync } from 'neverthrow'

// Define specific error types
export class ProfileNotFoundError extends TaggedError('ProfileNotFoundError')<{
  name: string
}> {}

export class ProfileFetchError extends TaggedError('ProfileFetchError')<{
  cause: unknown
}> {}

// Use ResultFn for generator-based composition
export const getProfile = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  
  const profile = yield* ResultAsync.fromPromise(
    fetchProfile(client, name),
    (error) => new ProfileFetchError({ cause: error })
  )
  
  if (!profile) {
    yield* new ProfileNotFoundError({ name })
  }
  
  return ok(profile)
})
```

### Consuming Results

**With TanStack Query** (most common in components):

The `resultQueryOptions` wrapper automatically unwraps Results, so you use standard TanStack Query patterns:

```typescript
// ✅ Standard pattern with TanStack Query
export const ProfileCard = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(getProfileQueryOptions(name))

  if (isLoading) return <LoadingMessage />

  if (error) {
    // error is the TaggedError instance
    const message = error.cause?.message || error.message || 'Could not load profile'
    return <ErrorMessage title="Profile unavailable" description={message} />
  }

  if (!data) {
    return <ErrorMessage title="Profile unavailable" />
  }

  // data is already unwrapped - use directly!
  return <ProfileView records={data.records} />
}
```

**How `resultQueryOptions` works**:

```typescript
// Internally, resultQueryOptions calls .match() for you:
queryFn: (context) =>
  rawQueryFn(context).match(
    (value) => value,        // Returns unwrapped value → becomes `data`
    (error) => { throw error } // Throws error → becomes `error`
  )
```

**Outside TanStack Query** (in helper functions):

When composing Results in helper functions, use chaining:

```typescript
// ✅ Chaining operations
const finalResult = await getProfile('vitalik.eth')
  .andThen((profile) => validateProfile(profile))
  .andThen((validProfile) => saveProfile(validProfile))
  .map((savedProfile) => formatProfile(savedProfile))

// ✅ Using .match() for final handling
finalResult.match(
  (profile) => console.log('Success:', profile),
  (error) => console.error('Failed:', error.message)
)

// ✅ Early return pattern
if (result.isErr()) {
  console.error('Error:', result.error.message)
  return null
}
const profile = result.value
```

**Checking Result types manually** (rare, when not using TanStack Query):

```typescript
// Only needed outside TanStack Query
const result = yield* getProfile('vitalik.eth')

if (result.isOk()) {
  const canEdit = yield* canEditRecords(result.value)
  return ok(canEdit)
}
```

**In event handlers and mutations** (prefer early returns over `.match()`):

```typescript
// ✅ PREFERRED: Early return pattern
const handleSubmit = async () => {
  const result = await registerUser({ email, name })
  
  if (result.isErr()) {
    console.error('Registration failed:', result.error.message)
    return
  }
  
  console.log('Success:', result.value)
  navigate('/dashboard')
}

// ⚠️ AVOID: .match() in event handlers (feels awkward)
const handleSubmit = async () => {
  const result = await registerUser({ email, name })
  
  result.match(
    (user) => {
      console.log('Success:', user)
      navigate('/dashboard')
    },
    (error) => console.error('Failed:', error)
  )
}

// ✅ ALSO GOOD: try-catch when helper throws
const handleSubmit = async () => {
  try {
    await sendTransaction(params)
    console.log('Success')
  } catch (error) {
    console.error('Failed:', error)
  }
}
```

> **Why avoid `.match()` in handlers?** Early returns and try-catch are more idiomatic for imperative control flow in event handlers. Reserve `.match()` for functional composition in helpers.

### Critical Anti-Patterns

```typescript
// ❌ NEVER manually unwrap Results with throw
ResultAsync.fromPromise(
  helper(...).then((result) => {
    if (result.isErr()) throw result.error  // BAD!
    return result.value
  }),
  (error) => error
)

// ✅ CORRECT - Chain Results directly
return helper(...)  // Just return the ResultAsync

// ❌ NEVER mix try-catch with ResultAsync
try {
  const data = processSync()
  return ResultAsync.fromSafePromise(Promise.resolve(data))
} catch (error) {
} catch (error) {
  return errAsync(new Error(String(error)))
}

// ✅ CORRECT - Use fromSync for synchronous code that might throw
import { fromSync } from '@ens-apps/utils/neverthrow'

return fromSync(
  () => processSync(),
  (error) => new ProcessError({ cause: error })
)

// ✅ Also correct - Use fromThrowable for reusable sync wrappers
import { fromThrowable } from 'neverthrow'

const safeJsonParse = fromThrowable(
  JSON.parse,
  (error) => new ParseError({ cause: error })
)

const result = safeJsonParse('{"valid": true}') // Result<any, ParseError>

// ✅ Real-world example with fromSync
import { normalize } from 'viem/ens'
import { fromSync } from '@ens-apps/utils/neverthrow'

class NormalizationError extends TaggedError('NormalizationError')<{
  cause: unknown
}> {}

export function normalizeEnsName(name: string): Result<string, NormalizationError> {
  return fromSync(
    () => normalize(name),
    (error) => new NormalizationError({ cause: error })
  )
}
```

### Quick Reference

**Creating Results:**
- `ok(value)` / `err(error)` → for `Result<T, E>` (sync)
- `okAsync(value)` / `errAsync(error)` → for `ResultAsync<T, E>` (async)
- `fromPromise(promise, errorFn)` → wrap async code that might throw
- `fromSync(() => fn(), errorFn)` → wrap sync code that might throw (from `@ens-apps/utils`)
- `fromThrowable(fn, errorFn)` → create reusable sync wrapper (from `neverthrow`)

**Transforming Results:**
- `.andThen(fn)` → chain Results (flatMap)
- `.map(fn)` / `.mapErr(fn)` → transform values/errors
- `.match(onOk, onErr)` → handle both cases

**Advanced Composition:**
- `ResultFn(function* ...)` → generator-based composition with `yield*`
- `yield* new TaggedError(...)` → early error return in ResultFn generators (no need for `return err(...)`)
- `yield* resultFn()` → unwrap Results (no `await` needed, `yield*` handles async)

**Important**: Use `yield*` for Results, not `yield* await`. The `yield*` operator already handles async operations:

```typescript
// ✅ CORRECT - yield* handles async
const profile = yield* ResultAsync.fromPromise(fetchData(), errorFn)
const records = yield* getRecords(params)

// ❌ WRONG - redundant await
const profile = yield* await ResultAsync.fromPromise(fetchData(), errorFn)
```

## Data Fetching with TanStack Query

The codebase uses TanStack Query with a custom `resultQueryOptions` wrapper for `neverthrow` integration.

### Query Structure

```typescript
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'

// 1. Define error types
export class GetProfileError extends TaggedError('GetProfileError')<{
  cause: unknown
}> {}

// 2. Create the data fetching function
export const getProfile = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()
  
  const profile = yield* ResultAsync.fromPromise(
    fetchProfile(client, { name }),
    (error) => new GetProfileError({ cause: error })
  )
  
  return ok(profile)
})

// 3. Create query key
export const profileQueryKey = createQueryKey<
  'profile',
  { name: string }
>('profile')

// 4. Create query options factory
export const getProfileQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: profileQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getProfile(name),
  })
```

**Why no custom hook wrapper?**
- ✅ **Works with all query hooks** - `useQuery`, `useSuspenseQuery`, `useQueries`
- ✅ **Preloading in router loaders** - Can use options directly in `loader`
- ✅ **Customizable per use case** - Add `staleTime`, `enabled`, etc. in component
- ✅ **Simpler types** - No need to handle custom option overrides

### Query Key Patterns 🟡 Default

**Use `createQueryKey` helper for type-safe, invalidation-friendly keys:**

```typescript
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'

// Define query key factory with typed variables
export const profileQueryKey = createQueryKey<
  'profile',
  { name: string }
>('profile')

// Usage
const key = profileQueryKey({ name: 'vitalik.eth' })
// Returns: ['profile', { name: 'vitalik.eth' }] as const
```

**Why object-based params?**

Using a **singular object for query key parameters** enables powerful **partial matching for invalidation**:

```typescript
// Invalidate ALL profile queries
queryClient.invalidateQueries({ queryKey: ['profile'] })

// Invalidate specific profile
queryClient.invalidateQueries({ 
  queryKey: ['profile', { name: 'vitalik.eth' }] 
})

// Partial match - invalidate all profiles on a specific network
queryClient.invalidateQueries({
  predicate: (query) => {
    const [key, params] = query.queryKey as ['profile', { network?: string }]
    return key === 'profile' && params?.network === 'mainnet'
  }
})
```

**Query Key Best Practices:**

1. ✅ **Use `createQueryKey` helper** - Type-safe and consistent ([see implementation](https://github.com/ensdomains/apps-monorepo/blob/main/packages/utils/src/tanstack-query/queryKey.ts))
2. ✅ **Object for params** - Enables partial matching for invalidation
3. ✅ **Named properties** - `{ name }` not just `name`
4. ✅ **Consider scope-based keys** - Group related queries for easier invalidation

```typescript
// ✅ Good - Type-safe, invalidation-friendly
export const recordsQueryKey = createQueryKey<
  'records',
  GetRecordsParameters
>('records')

const key = recordsQueryKey({ name: 'vitalik.eth', texts: true })
// ['records', { name: 'vitalik.eth', texts: true }]

// ❌ Avoid - Positional params, hard to invalidate partially
queryKey: ['records', name, texts]

// ❌ Avoid - Reversed order
queryKey: [name, 'records']
```

> **⚠️ Standardization In Progress**: Query key structure is evolving toward better standardization with scope-based invalidation patterns (e.g., `$qk({ $scope: 'wallet' })` to invalidate all wallet-related queries). The `createQueryKey` helper is the current recommended approach, but standardized key structures and common scopes are being defined to make cross-feature invalidations easier. When defining new query keys, consider how they might be grouped with related queries for bulk invalidation.

### Using Queries in Components

**Standard pattern** - `data` is already unwrapped, use directly:

```typescript
// ✅ Basic usage - data is unwrapped, error is TaggedError
export const ProfileCard = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery(getProfileQueryOptions(name))
  
  if (isLoading) return <LoadingMessage />
  
  if (error) {
    // error is the TaggedError instance
    const message = error.cause?.message || error.message || 'Could not load profile'
    return <ErrorMessage title="Profile unavailable" description={message} />
  }
  
  if (!data) {
    return <ErrorMessage title="Profile unavailable" description="No data returned" />
  }
  
  // data is already unwrapped - use directly!
  return <ProfileDetails records={data.records} />
}

// ✅ With custom options
export const LiveProfileCard = ({ name }: { name: string }) => {
  const { data, isLoading, error } = useQuery({
    ...getProfileQueryOptions(name),
    staleTime: 5000, // Refetch every 5s
    refetchInterval: 5000,
  })
  
  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage title="Error" description={error.message} />
  if (!data) return null
  
  return <ProfileDetails records={data.records} />
}

// ✅ With suspense
export const SuspenseProfileCard = ({ name }: { name: string }) => {
  const { data, error } = useSuspenseQuery(getProfileQueryOptions(name))
  // No loading state needed - suspense handles it
  
  if (error) return <ErrorMessage error={error} />
  if (!data) return null
  
  return <ProfileDetails records={data.records} />
}

// ✅ Multiple queries with useQueries
export const MultiProfileCard = ({ names }: { names: string[] }) => {
  const queries = useQueries({
    queries: names.map(name => getProfileQueryOptions(name)),
  })
  
  return (
    <div>
      {queries.map((q, i) => {
        if (q.isLoading) return <LoadingSpinner key={names[i]} />
        if (q.error) return <ErrorMessage key={names[i]} error={q.error} />
        if (!q.data) return null
        return <ProfileCard key={names[i]} data={q.data} />
      })}
    </div>
  )
}

// ✅ Preloading in router loader
export const Route = createFileRoute('/$name/records')({
  loader: ({ context: { queryClient }, params: { name } }) => {
    return queryClient.prefetchQuery(getProfileQueryOptions(name))
  },
  component: ProfilePage,
})
```

**Key points**:
- ✅ `data` is the **unwrapped value** (not a Result)
- ✅ `error` is the **TaggedError instance** thrown by the query
- ✅ Always check `isLoading`, `error`, and `!data` before using `data`
- ✅ Access error details via `error.cause?.message` or `error.message`

### Avoid Query Waterfalls 🟡 Default

**Don't run dependent queries in the same component** - move them to separate components.

```typescript
// ❌ AVOID - Waterfall queries in same component
export const ProfilePage = ({ name }: { name: string }) => {
  const { data: profile, isLoading: isLoadingProfile, error: profileError } = 
    useQuery(getProfileQueryOptions(name))
  
  // This waits for profile to load before fetching
  const { data: records, isLoading: isLoadingRecords, error: recordsError } = 
    useQuery({
      ...getRecordsQueryOptions(profile?.address),
      enabled: !!profile?.address, // Dependent query
    })
  
  // Now you have 4 states to manage: 2 loading, 2 errors
  if (isLoadingProfile || isLoadingRecords) return <LoadingSpinner />
  if (profileError || recordsError) return <ErrorMessage />
  
  return <div>{/* Complex state management */}</div>
}

// ✅ CORRECT - Split into separate components
export const ProfilePage = ({ name }: { name: string }) => {
  const { data: profile, isLoading, error } = useQuery(getProfileQueryOptions(name))
  
  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  if (!profile) return null
  
  // Pass profile to child component that handles records
  return <ProfileWithRecords profile={profile} />
}

export const ProfileWithRecords = ({ profile }: { profile: Profile }) => {
  const { data: records, isLoading, error } = useQuery(
    getRecordsQueryOptions(profile.address)
  )
  
  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  if (!records) return null
  
  return <RecordsView profile={profile} records={records} />
}
```

**Benefits of splitting**:
- ✅ **Clearer state management** - One query per component
- ✅ **Better loading UX** - Show profile while records load
- ✅ **Easier error handling** - Each error is specific to its data
- ✅ **Better composability** - Components are more reusable

### Handle Query States Independently 🟡 Default

**Don't group error or loading states** - handle each query separately.

```typescript
// ❌ AVOID - Grouped loading/error states
export const DashboardPage = () => {
  const { data: profile, isLoading: isLoadingProfile, error: profileError } = 
    useQuery(getProfileQueryOptions())
  const { data: names, isLoading: isLoadingNames, error: namesError } = 
    useQuery(getNamesQueryOptions())
  
  // This hides which data is loading/erroring
  if (isLoadingProfile || isLoadingNames) return <LoadingSpinner />
  if (profileError || namesError) return <ErrorMessage />
  
  return <Dashboard profile={profile} names={names} />
}

// ✅ CORRECT - Handle each query independently
export const DashboardPage = () => {
  const { data: profile, isLoading: isLoadingProfile, error: profileError } = 
    useQuery(getProfileQueryOptions())
  const { data: names, isLoading: isLoadingNames, error: namesError } = 
    useQuery(getNamesQueryOptions())
  
  return (
    <div>
      {/* Show profile section state independently */}
      {isLoadingProfile ? (
        <LoadingSpinner />
      ) : profileError ? (
        <ErrorMessage error={profileError} />
      ) : (
        <ProfileSection profile={profile} />
      )}
      
      {/* Show names section state independently */}
      {isLoadingNames ? (
        <LoadingSpinner />
      ) : namesError ? (
        <ErrorMessage error={namesError} />
      ) : (
        <NamesSection names={names} />
      )}
    </div>
  )
}
```

**Why this matters**:
- ✅ **Different errors mean different things** - Profile error ≠ names error
- ✅ **Show partial data** - Display profile even if names fails
- ✅ **Better UX** - User sees some content immediately
- ✅ **Specific error messages** - Tell user exactly what failed

### Use useQueries for Parallel Queries 🟡 Default

**For multiple parallel queries, use `useQueries`** - cleaner and more concise.

```typescript
// ❌ AVOID - Multiple parallel useQuery calls
export const MultiProfilePage = ({ names }: { names: string[] }) => {
  const profile1 = useQuery(getProfileQueryOptions(names[0]))
  const profile2 = useQuery(getProfileQueryOptions(names[1]))
  const profile3 = useQuery(getProfileQueryOptions(names[2]))
## Performance Guidelines

React 19 and our stack are fast by default. **Optimize only when proven necessary.**

### Philosophy (🟢 Guideline)

- **Measure before optimizing** - Use React DevTools Profiler to identify actual bottlenecks
- **Favor clarity over micro-optimizations** - Premature optimization obscures intent
- **Trust React's defaults** - React 19's concurrent features handle most scenarios
- **Optimize for bundle size first** - Smaller bundles → faster initial load

### When to Use Memoization

```typescript
// ❌ Premature optimization - No benefit
export const Button = ({ label }: { label: string }) => {
  const text = useMemo(() => label.toUpperCase(), [label]) // Unnecessary
  return <button>{text}</button>
}

// ✅ Good - Expensive calculation
export const NameValidator = ({ name }: { name: string }) => {
  const isValid = useMemo(() => {
    // Expensive regex or normalization
    return validateENSName(name) // Only recompute when name changes
  }, [name])
  
  return <div>{isValid ? '✓' : '✗'}</div>
}

// ✅ Good - Referential stability for dependencies
export const UserList = () => {
  const filters = useMemo(() => ({ active: true, verified: true }), [])
  const users = useQuery(getUsersQueryOptions(filters)) // Prevents refetch on re-render
  return <div>...</div>
}
```

### When to Use useCallback

```typescript
// ❌ Unnecessary - Simple inline handler
<button onClick={() => setCount(c => c + 1)}>Increment</button>

// ✅ Good - Passed to memoized child
const MemoizedChild = memo(Child)

export const Parent = () => {
  const handleSave = useCallback((data: FormData) => {
    // Save logic
  }, [])
  
  return <MemoizedChild onSave={handleSave} />
}
```

### Performance Checklist

Before optimizing, check these first:

1. **Code splitting** - Use route-based lazy loading with TanStack Router
2. **Bundle analysis** - Remove unused dependencies (`pnpm why <package>`)
3. **Image optimization** - Use WebP, lazy loading, proper sizing
4. **Query management** - Set appropriate `staleTime` and `gcTime` for TanStack Query
5. **Avoid prop drilling** - Use composition instead of passing props through many layers

### Measuring Performance

```typescript
// Use React DevTools Profiler
import { Profiler } from 'react'

<Profiler id="UserList" onRender={(id, phase, actualDuration) => {
  console.log(`${id} (${phase}) took ${actualDuration}ms`)
}}>
  <UserList />
</Profiler>
```

**Key metrics:**
- **Initial render** - Should be < 100ms for most components
- **Re-render time** - Should be < 16ms (60fps)
- **Bundle size** - Keep route chunks under 200KB (gzipped)

## Error Boundaries
## Advanced neverthrow Patterns

### Using ResultFn with Generators

The `ResultFn` wrapper enables generator-based composition with automatic error propagation:

```typescript
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'

class ValidationError extends TaggedError('VALIDATION_ERROR')<{ field?: string }> {}
class NetworkError extends TaggedError('NETWORK_ERROR')<{ cause?: unknown }> {}

const processUserRegistration = ResultFn(async function* (userData: { email: string; name: string }) {
  // Early error return - TaggedErrors can be yielded directly
  if (!userData.email) {
    yield* new ValidationError({ message: 'Email is required', field: 'email' })
  }
  
  // yield* automatically unwraps Results and propagates errors
  const existingUser = yield* ResultAsync.fromPromise(
    checkUserExists(userData.email),
    (error) => new NetworkError({ message: 'Failed to check user', cause: error })
  )
  
  if (existingUser) {
    yield* new ValidationError({ message: 'User already exists', field: 'email' })
  }
  
  const newUser = yield* ResultAsync.fromPromise(
    createUser(userData),
    (error) => new NetworkError({ message: 'Failed to create user', cause: error })
  )


---

> **Next**: See [WEB3.md](./WEB3.md) for blockchain and smart contract patterns.
