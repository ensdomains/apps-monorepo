# ENS Portal App Style Guide

A comprehensive guide for writing clean, maintainable, and type-safe code for the ENS Portal application.

> **Note for Contributors**: This guide is opinionated by design to maintain consistency across the codebase. When in doubt, follow existing patterns and favor clarity. Reasonable exceptions are allowed when justified—see the **Rule Severity** section for guidance on when rules are mandatory vs. preferred.

## Table of Contents

- [Core Principles](#core-principles)
- [Rule Severity](#rule-severity)
- [Tech Stack Overview](#tech-stack-overview)
- [File Structure \& Organization](#file-structure--organization)
- [Naming Conventions](#naming-conventions)
- [TypeScript Usage](#typescript-usage)
- [React Patterns](#react-patterns)
- [State Management](#state-management)
- [Business Logic Extraction](#business-logic-extraction)
- [Error Handling with neverthrow](#error-handling-with-neverthrow)
- [Data Fetching with TanStack Query](#data-fetching-with-tanstack-query)
- [Web3 \& Blockchain Patterns](#web3--blockchain-patterns)
- [Component Composition](#component-composition)
- [Performance Guidelines](#performance-guidelines)
- [Error Boundaries](#error-boundaries)
- [Styling with Tailwind CSS](#styling-with-tailwind-css)
- [Routing with TanStack Router](#routing-with-tanstack-router)
- [Accessibility](#accessibility)
- [General TypeScript/JavaScript Coding Guidelines](#general-typescriptjavascript-coding-guidelines)
- [Advanced neverthrow Patterns](#advanced-neverthrow-patterns)
- [Testing Strategy](#testing-strategy)
- [Code Formatting \& Linting with Biome](#code-formatting--linting-with-biome)
- [Summary](#summary)
- [References](#references)

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
- **Type safety** - No `any` types, use `unknown` + type guards
- **BigInt for blockchain values** - All numeric blockchain values use BigInt
- **Immutability** - Don't mutate data structures

### 🟡 Default (Follow unless there is a clear reason not to)

These rules represent best practices but allow pragmatic exceptions:

- **TanStack Query for async data** - Don't manually manage loading/error states with useState
- **Extract useEffect** - Effects should be in custom hooks (≤5 lines can stay inline)
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

## File Structure & Organization

### Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Shadcn UI components (built on Radix) - Base primitives
│   ├── molecules/      # Composed components (2-3 ui/* components combined)
│   └── organisms/      # Complex shared components (business logic + multiple molecules)
├── features/           # Feature-based modules
│   └── profile/
│       ├── components/ # Feature-specific components (not reused elsewhere)
│       ├── hooks/      # Feature-specific hooks
│       └── utils/      # Feature-specific utilities (2+ files)
├── hooks/              # Shared custom hooks (2+ files)
├── lib/                # Shared library code
│   ├── constants/      # App constants
│   ├── utils/          # Shared utilities
│   └── wagmi/          # Wagmi configuration
├── routes/             # TanStack Router route files
├── styles/             # Global styles
└── utils/              # Shared utility functions (2+ files)
```

**Component hierarchy**:
- **`ui/`** → Single-purpose primitives (Button, Input, Dialog)
- **`molecules/`** → Composition of 2-3 UI components, minimal logic (SearchBar = Input + Button, FormField = Label + Input + ErrorText)
- **`organisms/`** → Complex shared components with business logic, used across features (ConnectWalletModal, TransactionStatusCard)
- **`features/*/components/`** → Feature-specific components, any complexity, not reused outside the feature

### File Naming Conventions

- **React Components**: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- **Utility Files**: `camelCase.ts` (e.g., `formatEther.ts`)
- **Hooks**: `use*.ts` (e.g., `useProfile.ts`)
- **Types**: `*.types.ts` (e.g., `profile.types.ts`)
- **Test Files**: `*.test.ts(x)` (e.g., `UserProfile.test.tsx`)
- **Route Files**: TanStack Router conventions (e.g., `$name.tsx`)

### Co-location Examples

```typescript
// ❌ AVOID: Single-use helper in shared folder
src/
├── utils/
│   └── formatProfileName.ts  // Only used by ProfileCard.tsx
└── features/
    └── profile/
        └── components/
            └── ProfileCard.tsx

// ✅ CORRECT: Co-located next to usage
src/
└── features/
    └── profile/
        └── components/
            ├── ProfileCard.tsx
            └── ProfileCard.helpers.ts  // formatProfileName lives here
```

## Naming Conventions

### Variables and Functions

Use descriptive, intention-revealing names:

```typescript
// Good
const getUserProfile = (name: string): Promise<Profile> => { ... }
const isNameAvailable = (name: string): boolean => { ... }
const MAX_REGISTRATION_DURATION = 31536000n

// Avoid
const gUP = (n: string): Promise<Profile> => { ... }
const check = (n: string): boolean => { ... }
const x = 31536000n
```

### Boolean Naming

Prefix with `is`, `has`, `should`, or `can`:

```typescript
// Good
const isLoading = status === 'pending'
const hasResolver = !!resolverAddress
const canEditRecords = checkPermission(user, 'edit')
const shouldShowBanner = isExpiringSoon && !dismissed

// Avoid
const loading = status === 'pending'
const resolver = !!resolverAddress
const editRecords = checkPermission(user, 'edit')
```

### Type and Interface Naming

```typescript
// Use PascalCase for types and interfaces
interface UserProfile {
  name: string
  address: Address
}

type ProfileStatus = 'loading' | 'success' | 'error'

// Use descriptive names for generics
function getProperty<TObject, TKey extends keyof TObject>(
  obj: TObject,
  key: TKey
): TObject[TKey] {
  return obj[key]
}

// Props interfaces: <ComponentName>Props
interface ProfileCardProps {
  name: string
  address: Address
}
```

### Constants

Use `UPPER_SNAKE_CASE` for true constants:

```typescript
// Constants that represent fixed values
const MAX_NAME_LENGTH = 253
const SECONDS_PER_YEAR = 31536000n
const ENS_REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const

// Configuration objects use camelCase
const wagmiConfig = {
  chains: [mainnet, sepolia],
  transports: { ... }
}
```

## TypeScript Usage

### Strict Type Annotations

Always define types for function parameters and return values:

```typescript
// Good
interface GetProfileParams {
  readonly name: string
  readonly includeRecords?: boolean
}

function getProfile(params: GetProfileParams): ResultAsync<Profile, ProfileError> {
  // ...
}

// Avoid
function getProfile(params) {
  // ...
}
```

### Use Readonly for Immutability

```typescript
// Good
interface UserProfile {
  readonly name: string
  readonly addresses: readonly Address[]
}

const processAddresses = (addresses: readonly Address[]): readonly Address[] => {
  return addresses.filter(isValid)
}

// Avoid
interface UserProfile {
  name: string
  addresses: Address[]
}

const processAddresses = (addresses: Address[]): Address[] => {
  return addresses.filter(isValid)
}
```

### Type Narrowing

Use type guards and discriminated unions:

```typescript
// Good - Discriminated union
type TransactionState =
  | { status: 'idle' }
  | { status: 'pending'; hash: Hex }
  | { status: 'success'; hash: Hex; receipt: TransactionReceipt }
  | { status: 'error'; error: Error }

function handleTransaction(state: TransactionState) {
  if (state.status === 'success') {
    // TypeScript knows state.receipt exists
    console.log(state.receipt)
  }
}

// Type guard
function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}
```

### Avoid `any`, Use `unknown`

```typescript
// Avoid
function parseData(data: any) {
  return data.value
}

// Good
function parseData(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String(data.value)
  }
  throw new Error('Invalid data')
}
```

## React Patterns

### Component Definition

**Use arrow functions for React components:**

```typescript
// Good - Arrow function export (standard pattern)
export const ProfileCard = ({ name, address }: ProfileCardProps) => {
  return (
    <div>
      <h2>{name}</h2>
      <p>{address}</p>
    </div>
  )
}

// Good - Inline arrow function for router components
export const Route = createRootRoute({
  component: () => <Outlet />,
})

// Avoid - Function declaration for components (use for utilities only)
export function ProfileCard({ name, address }: ProfileCardProps) {
  return <div>...</div>
}

// Avoid - Function expression
export const ProfileCard = function({ name, address }: ProfileCardProps) {
  return <div>...</div>
}
```

**Note**: Function declarations (`function`) are reserved for utility functions and helpers, not React components.

### Component Props

Define props interfaces next to the component:

```typescript
// Good - Named interface with arrow function
interface ProfileCardProps {
  readonly name: string
  readonly address: Address
  readonly onEdit?: () => void
}

export const ProfileCard = ({ name, address, onEdit }: ProfileCardProps) => {
  return <div>...</div>
}

// Good - Inline type for simple components
export const Button = ({
  children,
  variant = 'default',
  ...props
}: React.ComponentProps<'button'> & { variant?: 'default' | 'outline' }) => {
  return <button {...props}>{children}</button>
}

// Good - Destructuring with type annotation
export const NameProfileCard = ({ name }: { name: string }) => {
  return <div>{name}</div>
}
```

### Pattern Matching for Conditional Rendering (🟡 Default)

Use `ts-pattern` for complex conditional logic over ternaries or `&&` operators:

> **Performance Note**: `ts-pattern` has some overhead due to JIT compilation ([benchmark details](https://github.com/bdbaraban/ts-pattern-benchmark/pull/1)). For simple conditions or hot paths, native conditionals may be faster. Measure if performance is critical (see [Performance Guidelines](#performance-guidelines)).

```typescript
import { match } from 'ts-pattern'
import { P } from 'ts-pattern'

// Good - Explicit pattern matching
export const ProfileStatus = ({ status }: { status: ProfileStatus }) => {
  return match(status)
    .with({ type: 'loading' }, () => <LoadingSpinner />)
    .with({ type: 'error', error: P.select() }, (error) => (
      <ErrorMessage error={error} />
    ))
    .with({ type: 'success', data: P.select() }, (data) => (
      <ProfileCard profile={data} />
    ))
    .exhaustive()
}

// Avoid - Nested ternaries
export const ProfileStatus = ({ status }) => {
  return status.type === 'loading' 
    ? <LoadingSpinner />
    : status.type === 'error'
    ? <ErrorMessage error={status.error} />
    : <ProfileCard profile={status.data} />
}

// Avoid - && operators with potential falsy bugs
export const ShowPrice = ({ price }) => {
  return price && <div>Price: {price}</div>  // Breaks if price is 0
}

// Good - Explicit nullish check
export const ShowPrice = ({ price }: { price: bigint | null }) => {
  return match({ price })
    .with({ price: P.not(P.nullish) }, ({ price }) => (
      <div>Price: {formatEther(price!)}</div>
    ))
    .otherwise(() => null)
}
```

### Extract Static Values and Pure Functions

Keep component bodies clean by extracting static values:

```typescript
// Avoid - Recreated on every render
export const RegistrationForm = () => {
  const YEAR_IN_SECONDS = 31536000n
  const config = {
    minDuration: YEAR_IN_SECONDS,
    maxDuration: YEAR_IN_SECONDS * 10n,
  }
  
  const calculatePrice = (duration: bigint) => {
    // calculation logic
  }
  
  return <form>...</form>
}

// Good - Extracted outside component
const YEAR_IN_SECONDS = 31536000n

const REGISTRATION_CONFIG = {
  minDuration: YEAR_IN_SECONDS,
  maxDuration: YEAR_IN_SECONDS * 10n,
} as const

function calculateRegistrationPrice(
  baseFee: bigint,
  duration: bigint
): bigint {
  return baseFee * duration / YEAR_IN_SECONDS
}

export const RegistrationForm = () => {
  return <form>...</form>
}
```

### useEffect Usage Policy (🟡 Default)

**Default rule**: Extract `useEffect` into a named custom hook to document intent and keep components readable.

```typescript
// ❌ AVOID: Naked useEffect in component
export const ProfilePage = ({ name }: { name: string }) => {
  const [profile, setProfile] = useState<Profile | null>(null)
  
  useEffect(() => {
    let cancelled = false
    
    async function fetchProfile() {
      const result = await getProfile(name)
      if (!cancelled && result.isOk()) {
        setProfile(result.value)
      }
    }
    
    fetchProfile()
    return () => { cancelled = true }
  }, [name])
  
  return <div>...</div>
}

// ✅ CORRECT: Extract into named hook
function useProfileData(name: string, onProfileChange: (profile: Profile | null) => void) {
  useEffect(() => {
    let cancelled = false
    
    async function fetchProfile() {
      const result = await getProfile(name)
      if (!cancelled && result.isOk()) {
        onProfileChange(result.value)
      }
    }
    
    fetchProfile()
    return () => { cancelled = true }
  }, [name, onProfileChange])
}

export const ProfilePage = ({ name }: { name: string }) => {
  const [profile, setProfile] = useState<Profile | null>(null)
  
  useProfileData(name, setProfile)
  
  return <div>...</div>
}
```

**Why extract effects?**
- Hook name documents the purpose
- Component body stays focused on rendering
- Effects are testable independently
- Easier to reuse across components

**Allowed exceptions** (must stay trivial):
- ≤ 5 lines of code
- No async logic
- No branching (if/switch)
- No external dependencies

```typescript
// ✅ Acceptable: Simple DOM sync effect
export const AutoFocusInput = () => {
  const ref = useRef<HTMLInputElement>(null)
  
  useEffect(() => {
    ref.current?.focus()
  }, [])
  
  return <input ref={ref} />
}
```

**If an effect grows beyond these constraints, extract it immediately.**

### Component Size and Complexity (🟢 Guideline)

**Split components based on complexity, not arbitrary line counts.**

**When to split:**
- ✅ Component has multiple concerns (data fetching + rendering + form logic)
- ✅ Logic is reusable across multiple parents
- ✅ Component is hard to understand due to complexity (not size)
- ✅ Different parts change for different reasons

**When NOT to split:**
- ❌ Component is mostly static JSX (navigation would take longer than reading)
- ❌ Split components are 50% type definitions and props drilling
- ❌ You're only splitting to hit a line count target

```typescript
// ❌ Over-split - Harder to follow, mostly definitions
const ProfileHeader = ({ name, avatar }: ProfileHeaderProps) => {
  return (
    <header className="flex items-center gap-4">
      <Avatar src={avatar} />
      <h1>{name}</h1>
    </header>
  )
}

// ✅ Good - Split when there's actual complexity
const ProfileRecordsEditor = ({ records, onChange }: Props) => {
  const [editMode, setEditMode] = useState(false)
  const { writeContractAsync } = useWriteContract()
  
  const handleSave = async () => {
    // 30+ lines of validation, encoding, transaction logic
  }
  
  return editMode ? <Editor /> : <Display />
}

const ProfilePage = ({ name }: ProfilePageProps) => {
  const { data: profile } = useQuery(getProfileQueryOptions(name))
  
  return (
    <div>
      {/* ✅ Static header stays inline - easy to read */}
      <header className="flex items-center gap-4">
        <Avatar src={profile.avatar} />
        <h1>{profile.name}</h1>
      </header>
      
      {/* ✅ Complex editor extracted - manages its own state and logic */}
      <ProfileRecordsEditor 
        records={profile.records}
        onChange={handleUpdate}
      />
    </div>
  )
}
```

**Rule of thumb**: If finding the split component takes longer than scanning the original, don't split it.

## State Management

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
  
  const handleRenew = async () => {
    const result = await prepareENSRenewal({
      name,
      duration: YEAR_IN_SECONDS,
      publicClient,
      walletClient,
    })
    
    result.match(
      (data) => console.log('Success:', data),
      (error) => console.error('Error:', error)
    )
  }
  
  return <button onClick={handleRenew}>Renew</button>
}
```

### When to Use a Custom Hook (🟡 Default)

Use a custom hook when:

- ✅ **Wrapping framework or browser APIs** - DOM access, localStorage, Web3 hooks
- ✅ **Integrating third-party hooks** - wagmi, TanStack Query, XState
- ✅ **Managing reusable UI state** - Modal disclosure, toggle patterns, form state
- ✅ **Extracting `useEffect` logic** - See useEffect Usage Policy above

Do NOT use a custom hook when:

- ❌ **It primarily performs business logic** - Use pure functions instead
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
  
  const price = yield* await ResultAsync.fromPromise(
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
  
  const profile = yield* await ResultAsync.fromPromise(
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

```typescript
// Good - Explicit handling
const result = await getProfile('vitalik.eth')

result.match(
  (profile) => {
    console.log('Success:', profile)
  },
  (error) => {
    if (error instanceof ProfileNotFoundError) {
      console.log('Profile not found:', error.name)
    } else {
      console.error('Unexpected error:', error)
    }
  }
)

// Good - Early return
if (result.isErr()) {
  return <ErrorMessage error={result.error} />
}

const profile = result.value

// Good - Chaining operations
const finalResult = await getProfile('vitalik.eth')
  .andThen((profile) => validateProfile(profile))
  .andThen((validProfile) => saveProfile(validProfile))
  .map((savedProfile) => formatProfile(savedProfile))
```

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
  
  const profile = yield* await ResultAsync.fromPromise(
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

```typescript
// Basic usage with useQuery
export const ProfileCard = ({ name }: { name: string }) => {
  const { data: result, isLoading } = useQuery(getProfileQueryOptions(name))
  
  // Pattern match on query state (see React Patterns for more examples)
  return match({ result, isLoading })
    .with({ isLoading: true }, () => <LoadingSpinner />)
    .with({ result: { isOk: () => true } }, ({ result }) => (
      <ProfileDetails profile={result._unsafeUnwrap()} />
    ))
    .with({ result: { isErr: () => true } }, ({ result }) => (
      <ErrorMessage error={result._unsafeUnwrapErr()} />
    ))
    .otherwise(() => null)
}

// With custom options
export const LiveProfileCard = ({ name }: { name: string }) => {
  const { data: result } = useQuery({
    ...getProfileQueryOptions(name),
    staleTime: 5000, // Refetch every 5s
    refetchInterval: 5000,
  })
  return <ProfileDetails profile={result} />
}

// With suspense
export const SuspenseProfileCard = ({ name }: { name: string }) => {
  const { data: result } = useSuspenseQuery(getProfileQueryOptions(name))
  // No loading state needed - suspense handles it
  return <ProfileDetails profile={result._unsafeUnwrap()} />
}

// Multiple queries with useQueries
export const MultiProfileCard = ({ names }: { names: string[] }) => {
  const queries = useQueries({
    queries: names.map(name => getProfileQueryOptions(name)),
  })
  return queries.map((q, i) => <ProfileCard key={names[i]} result={q.data} />)
}

// Preloading in router loader
export const Route = createFileRoute('/profile/$name')({
  loader: ({ context: { queryClient }, params: { name } }) => {
    queryClient.ensureQueryData(getProfileQueryOptions(name))
  },
  component: ProfilePage,
})
```

### File Organization for Queries

```
features/
└── profile/
    ├── hooks/
    │   ├── useProfile.ts       # getProfile + getProfileQueryOptions
    │   ├── useRecords.ts       # getRecords + getRecordsQueryOptions
    │   └── useSubnames.ts      # getSubnames + getSubnamesQueryOptions
    └── components/
        └── ProfileCard.tsx      # useQuery(getProfileQueryOptions(...))
```

**File naming**: Keep `use*.ts` convention even though they export query options, not hooks. This maintains consistency and groups query-related code in the `hooks/` folder.

## Web3 & Blockchain Patterns

### Contract Interaction Patterns

The codebase follows specific patterns for creating contract interaction helpers. There are two main patterns depending on where the helper lives:

#### Pattern 1: Simple Request Builders (App/Package Level)

For app-specific or package-level contract interactions, create pure functions that return typed request objects:

```typescript
// packages/l2-primary/src/utils/setReverseName.ts

// 1. Define the return type (union if multiple variants)
export type SetReverseNameRequest =
  | {
      address: Address
      abi: typeof l2ReverseRegistrarSetNameForAddrSnippet
      functionName: 'setNameForAddr'
      args: readonly [address: Address, name: string]
    }
  | {
      address: Address
      abi: typeof l2ReverseRegistrarSetNameSnippet
      functionName: 'setName'
      args: readonly [name: string]
    }

// 2. Create the builder function with JSDoc
/**
 * Creates contract call parameters for setting reverse resolution
 * @param params.name - The ENS name to set
 * @param params.reverseRegistrarChainId - The chain ID for the reverse registrar
 * @param params.chain - Optional chain object to determine network
 * @param params.targetAddress - Optional address to set the name for
 * @returns Contract parameters to pass to writeContract
 * @throws Error if no registrar is found for the coin type
 */
export function createSetReverseNameRequest({
  name,
  reverseRegistrarChainId,
  chain,
  targetAddress,
}: {
  name: string
  reverseRegistrarChainId: ReverseRegistrarChainId
  chain?: Chain
  targetAddress?: Address
}): SetReverseNameRequest {
  const network = resolveNetworkFromChain(chain)
  const registrarAddress = getRegistrarAddress(reverseRegistrarChainId, network)
  
  if (!registrarAddress) {
    throw new Error(
      `No registrar found for coin type ${reverseRegistrarChainId} on ${network}`
    )
  }
  
  if (targetAddress) {
    return {
      address: registrarAddress,
      abi: l2ReverseRegistrarSetNameForAddrSnippet,
      functionName: 'setNameForAddr',
      args: [targetAddress, name] as const,
    }
  }
  
  return {
    address: registrarAddress,
    abi: l2ReverseRegistrarSetNameSnippet,
    functionName: 'setName',
    args: [name] as const,
  }
}
```

**Key characteristics:**
- Pure function that returns typed request object
- Returns `{ address, abi, functionName, args }`
- Throws errors for invalid states
- JSDoc explains purpose and caller responsibilities
- Uses `as const` for args to preserve tuple types

#### Pattern 2: ENSjs Package Pattern

For the `@ensdomains/ensjs` package, follow this two-part pattern for writes and single function for reads:

**Read Operations:**

```typescript
// packages/ensjs/src/functions/public/getNameRegistry.ts

// 1. Export type aliases
export type GetNameRegistryAddressParameters = {
  /** The parent registry address */
  registryAddress: Address
  /** The label to look up */
  label: string
}

export type GetNameRegistryAddressReturnType = Address

export type GetNameRegistryAddressErrorType = ReadContractErrorType

// 2. Create the async function
/**
 * Gets the subregistry address from a parent registry.
 *
 * @param client - {@link Client}
 * @param parameters - {@link GetNameRegistryAddressParameters}
 * @returns Address of the subregistry. {@link GetNameRegistryAddressReturnType}
 *
 * @example
 * import { createPublicClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { getNameRegistryAddress } from '@ensdomains/ensjs/public'
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http(),
 * })
 * const address = await getNameRegistryAddress(client, {
 *   registryAddress: '0x...',
 *   label: 'flo',
 * })
 */
export async function getNameRegistryAddress(
  client: Client,
  { registryAddress, label }: GetNameRegistryAddressParameters
): Promise<GetNameRegistryAddressReturnType> {
  ASSERT_NO_TYPE_ERROR(client)
  
  const readContractAction = getAction(client, readContract, 'readContract')
  
  return readContractAction({
    address: registryAddress,
    abi: registryGetSubregistrySnippet,
    functionName: 'getSubregistry',
    args: [label],
  })
}
```

**Write Operations (Two-Part Pattern):**

```typescript
// packages/ensjs/src/functions/wallet/deploySubregistry.ts

// ================================
// Part 1: Write Parameters
// ================================

// 1. Export parameter types
export type DeploySubregistryWriteParametersParameters = {
  factoryAddress: Address
  implAddress: Address
  adminAddress?: Address
  roleBitmap?: bigint
  salt?: bigint
}

export type DeploySubregistryWriteParametersReturnType = ReturnType<
  typeof deploySubregistryWriteParameters
>

export type DeploySubregistryWriteParametersErrorType = 
  EncodeFunctionDataErrorType

// 2. Create the write parameters function
export const deploySubregistryWriteParameters = <
  chain extends Chain,
  account extends Account,
>(
  client: Client<Transport, chain, account>,
  {
    factoryAddress,
    implAddress,
    adminAddress,
    roleBitmap = DEFAULT_ROLE_BITMAP,
    salt = DEFAULT_SALT,
  }: DeploySubregistryWriteParametersParameters
) => {
  ASSERT_NO_TYPE_ERROR(client)
  
  const finalAdminAddress = adminAddress ?? client.account.address
  
  const callData = encodeFunctionData({
    abi: subregistryInitializeSnippet,
    functionName: 'initialize',
    args: [finalAdminAddress, roleBitmap],
  })
  
  return {
    address: factoryAddress,
    abi: verifiableFactoryDeployProxySnippet,
    functionName: 'deployProxy',
    args: [implAddress, salt, callData],
    chain: client.chain,
    account: client.account,
  } as const satisfies WriteContractParameters<
    typeof verifiableFactoryDeployProxySnippet
  >
}

// ================================
// Part 2: Action Function
// ================================

// 3. Export action types
export type DeploySubregistryParameters<
  chain extends Chain,
  account extends Account,
  chainOverride extends Chain | undefined,
> = Prettify<
  DeploySubregistryWriteParametersParameters &
    WriteTransactionParameters<chain, account, chainOverride>
>

export type DeploySubregistryReturnType = Hash

export type DeploySubregistryErrorType =
  | DeploySubregistryWriteParametersErrorType
  | ClientWithOverridesErrorType
  | WriteContractErrorType

// 4. Create the action function
/**
 * Deploys a subregistry contract via a verifiable proxy factory.
 * @param client - {@link Client}
 * @param options - {@link DeploySubregistryParameters}
 * @returns Transaction hash. {@link DeploySubregistryReturnType}
 *
 * @example
 * import { createWalletClient, custom } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { deploySubregistry } from '@ensdomains/ensjs/wallet'
 *
 * const wallet = createWalletClient({
 *   chain: mainnet,
 *   transport: custom(window.ethereum),
 * })
 * const hash = await deploySubregistry(wallet, {
 *   factoryAddress: '0x...',
 *   implAddress: '0x...',
 * })
 */
export async function deploySubregistry<
  chain extends Chain,
  account extends Account,
  chainOverride extends Chain | undefined,
>(
  client: Client<Transport, chain, account>,
  {
    factoryAddress,
    implAddress,
    adminAddress,
    roleBitmap,
    salt,
    ...txArgs
  }: DeploySubregistryParameters<chain, account, chainOverride>
): Promise<DeploySubregistryReturnType> {
  ASSERT_NO_TYPE_ERROR(client)
  
  const writeParameters = deploySubregistryWriteParameters(
    clientWithOverrides(client, txArgs),
    {
      factoryAddress,
      implAddress,
      adminAddress,
      roleBitmap,
      salt,
    }
  )
  
  const writeContractAction = getAction(client, writeContract, 'writeContract')
  return writeContractAction({
    ...writeParameters,
    ...txArgs,
  } as WriteContractParameters)
}
```

**Key characteristics for ENSjs:**
- Three type exports per function: `Parameters`, `ReturnType`, `ErrorType`
- Use `ASSERT_NO_TYPE_ERROR(client)` macro
- Use `getAction(client, action, 'actionName')` pattern
- Write operations split into:
  - `xWriteParameters` - Returns contract params
  - `x` - Executes the transaction
- Comprehensive JSDoc with examples
- Use `satisfies` for type validation

### Using Contract Helpers in Components

#### With wagmi's useWriteContract

```typescript
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { deploySubregistryWriteParameters } from '@ensdomains/ensjs/wallet'

export const DeployButton = () => {
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync, data: txHash, isPending } = useWriteContract()
  
  const { data: receipt, isLoading: isConfirming } = 
    useWaitForTransactionReceipt({ hash: txHash })
  
  const handleDeploy = async () => {
    if (!walletClient) return
    
    // Get contract parameters
    const params = deploySubregistryWriteParameters(walletClient, {
      factoryAddress: FACTORY_ADDRESS,
      implAddress: IMPL_ADDRESS,
    })
    
    // Execute transaction
    await writeContractAsync({
      address: params.address,
      abi: params.abi,
      functionName: params.functionName,
      args: params.args,
    })
  }
  
  return (
    <button onClick={handleDeploy} disabled={isPending || isConfirming}>
      {isPending ? 'Confirm in wallet...' : isConfirming ? 'Confirming...' : 'Deploy'}
    </button>
  )
}
```

#### With Simple Request Builders

```typescript
import { useWriteContract } from 'wagmi'
import { createSetReverseNameRequest } from '@ens-apps/l2-primary/utils'

export const SetPrimaryNameButton = ({ name }: { name: string }) => {
  const { chain } = useConnection()
  const { writeContractAsync } = useWriteContract()
  
  const handleSetPrimaryName = async () => {
    try {
      // Create request
      const request = createSetReverseNameRequest({
        name,
        reverseRegistrarChainId: 60, // ETH
        chain,
      })
      
      // Execute
      const hash = await writeContractAsync(request)
      console.log('Transaction hash:', hash)
    } catch (error) {
      console.error('Failed to set primary name:', error)
    }
  }
  
  return <button onClick={handleSetPrimaryName}>Set Primary Name</button>
}
```

#### Combining Multiple Requests

```typescript
export const SetPrimaryNameFlow = ({ name, address }: Props) => {
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync } = useWriteContract()
  const [reverseHash, setReverseHash] = useState<Hash>()
  const [forwardHash, setForwardHash] = useState<Hash>()
  
  // Step 1: Set reverse resolution
  const setReverse = async () => {
    const request = createSetReverseNameRequest({
      name,
      reverseRegistrarChainId: 60,
    })
    
    const hash = await writeContractAsync(request)
    setReverseHash(hash)
  }
  
  // Step 2: Set forward resolution
  const setForward = async () => {
    const request = createSetForwardResolutionRequest({
      name,
      reverseRegistrarChainId: 60,
      resolverAddress,
      targetAddress: address,
    })
    
    const hash = await writeContractAsync(request)
    setForwardHash(hash)
  }
  
  return (
    <div>
      <button onClick={setReverse}>1. Set Reverse</button>
      <button onClick={setForward} disabled={!reverseHash}>
        2. Set Forward
      </button>
    </div>
  )
}
```

### Contract Helper Pattern Summary

**When to use Simple Request Builders (Pattern 1):**
- ✅ App-specific contract interactions
- ✅ Package-level utilities (like `@ens-apps/l2-primary`)
- ✅ Simpler contracts with straightforward parameters
- ✅ When you need to compose multiple calls
- ✅ When the helper is consumed directly by components

**Example:** `createSetReverseNameRequest`, `createSetForwardResolutionRequest`

**When to use ENSjs Two-Part Pattern (Pattern 2):**
- ✅ Core ENS protocol interactions
- ✅ Functions in `@ensdomains/ensjs` package
- ✅ Operations that benefit from both "get params" and "execute" variants
- ✅ Complex parameter handling with overrides
- ✅ Functions consumed by external developers

**Example:** `deploySubregistryWriteParameters` + `deploySubregistry`

**Key Differences:**

| Aspect | Simple Builders | ENSjs Pattern |
|--------|----------------|---------------|
| **Structure** | Single function | Two functions (writeParameters + action) |
| **Returns** | Contract params object | writeParameters: params, action: Hash |
| **Client** | Not required | Required (uses `getAction`) |
| **Type safety** | `as const` for args | `satisfies WriteContractParameters` |
| **JSDoc** | Basic documentation | Comprehensive with examples |
| **Error handling** | Throws directly | Typed error unions |
| **Use case** | Direct component usage | Library API + component usage |

### Working with wagmi

```typescript
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { type Address } from 'viem'

export const TransactionButton = () => {
  // Get account info
  const { address, isConnected, chain } = useAccount()
  
  // Get clients
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  
  // Check connection
  if (!isConnected || !address) {
    return <ConnectWallet />
  }
  
  const handleTransaction = async () => {
    if (!walletClient) return
    
    const result = await prepareTransaction({
      address,
      publicClient,
      walletClient,
    })
    
    // Handle result
  }
  
  return <button onClick={handleTransaction}>Send Transaction</button>
}
```

### Safe Client Access

Use the `safeGetClient` helper for error handling:

```typescript
import { safeGetClient } from '@/lib/wagmi/helpers'
import { ResultFn } from '@ens-apps/utils/neverthrow'

export const getNameOwner = ResultFn(async function* (name: string) {
  // Safely get client with error handling
  const client = yield* safeGetClient()
  
  const owner = yield* await ResultAsync.fromPromise(
    getOwner(client, { name }),
    (error) => new GetOwnerError({ cause: error })
  )
  
  return ok(owner)
})
```

### Working with ENS

Always normalize ENS names and import types from ENSjs for proper error handling:

```typescript
import { normalize } from 'viem/ens'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import {
  getRecords as ensjs_getRecords,
  type GetRecordsErrorType,
  type GetRecordsParameters,
} from '@ensdomains/ensjs/public'
import { safeGetClient } from '@/lib/wagmi/helpers'

// Always normalize ENS names before using them
const normalizedName = normalize('vitalik.eth')

// Define error class with ENSjs error type
class RecordsError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType
}> {}

/**
 * Fetches ENS records for a given name.
 * Uses ENSjs types for parameters and errors.
 */
export const getRecords = ResultFn(async function* (
  params: GetRecordsParameters,
) {
  const client = yield* safeGetClient()
  
  // Use fromPromise with proper ENSjs error typing
  const records = yield* await fromPromise(
    ensjs_getRecords(client, params),
    (e) => new RecordsError({ cause: e as GetRecordsErrorType }),
  )
  
  return ok(records)
})
```

**Key patterns:**

1. **Import types from ENSjs** - Use `GetRecordsParameters` and `GetRecordsErrorType`
2. **Type error causes** - `TaggedError<{ cause: GetRecordsErrorType }>`
3. **Use `fromPromise`** - Direct import from `neverthrow`, not `ResultAsync.fromPromise`
4. **Alias ENSjs functions** - `getRecords as ensjs_getRecords` to avoid naming conflicts
5. **Always normalize** - Use `normalize()` from `viem/ens` for user input

**Complex example with multiple clients:**

```typescript
import {
  getNameRegistries as ensjsGetNameRegistries,
  type GetNameRegistriesErrorType,
} from '@ensdomains/ensjs/public/v2'

export class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType | GetEnsOwnerError
}> {}

/**
 * Discovers which registry (L1 or L2) a name exists on.
 * Shows working with multiple clients and conditional logic.
 */
export const getNameRegistries = ResultFn(async function* ({
  network,
  name,
}: GetNameRegistriesParameters) {
  const l1Client = yield* safeGetClient()
  const l2Client = yield* safeGetNamechainSepoliaClient()
  
  if (!network) return ok(null)
  
  if (network === 'sepolia') {
    const registries = yield* fromPromise(
      ensjsGetNameRegistries(l1Client, { name }),
      (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
    )
    return ok({
      registries,
      network: 'sepolia',
      protocolVersion: 'ENSv1',
    } as const)
  }
  
  // ... handle other networks
  return ok(null)
})
```

### BigInt Handling

```typescript
// Use BigInt for all blockchain numeric values
const YEAR_IN_SECONDS = 31536000n
const price = 100000000000000000n // Wei

// Format for display
import { formatEther, formatUnits, parseEther } from 'viem'

const displayPrice = formatEther(price) // "0.1 ETH"
const parsedAmount = parseEther('0.1') // 100000000000000000n

// Always use bigint arithmetic
const totalCost = price * duration / YEAR_IN_SECONDS
const withBuffer = (price * 105n) / 100n // Add 5% buffer
```

### Address Type Safety

```typescript
import { type Address, isAddress } from 'viem'

// Always use Address type
interface ProfileParams {
  address: Address
}

// Validate addresses
function validateAddress(value: string): value is Address {
  return isAddress(value)
}

// Type guard in use
function getProfile(address: string) {
  if (!validateAddress(address)) {
    return err(new InvalidAddressError({ address }))
  }
  
  // TypeScript knows address is Address here
  return fetchProfile(address)
}
```

## Component Composition

### Composition Over Configuration

Build flexible components through composition:

```typescript
// Good - Composition
export const ProfilePage = ({ name }: { name: string }) => {
  const { data: profile } = useQuery(getProfileQueryOptions(name))
  
  return (
    <Card>
      <CardHeader>
        <Avatar src={profile.avatar} />
        <h1>{profile.name}</h1>
      </CardHeader>
      <CardBody>
        <ProfileRecords records={profile.records} />
      </CardBody>
      <CardFooter>
        <Button onClick={handleEdit}>Edit</Button>
      </CardFooter>
    </Card>
  )
}

// Avoid - Configuration props
export const ProfileCard = ({
  profile,
  showAvatar,
  showRecords,
  showEditButton,
  onEdit,
}: ProfileCardProps) => {
  return (
    <div>
      {showAvatar && <Avatar />}
      {showRecords && <Records />}
      {showEditButton && <Button onClick={onEdit} />}
    </div>
  )
}
```

### Using Radix UI Primitives

```typescript
import * as Dialog from '@radix-ui/react-dialog'

// Good - Compose Radix primitives with custom styling
export const EditProfileDialog = ({ children }: { children: React.ReactNode }) => {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button>Edit Profile</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Dialog.Title>Edit Profile</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

### Render Props Pattern

```typescript
// Good - Render prop for flexibility
interface DataTableProps<T> {
  data: readonly T[]
  renderRow: (item: T) => React.ReactNode
  renderEmpty?: () => React.ReactNode
}

export const DataTable = <T,>({ data, renderRow, renderEmpty }: DataTableProps<T>) => {
  if (data.length === 0) {
    return renderEmpty?.() ?? <p>No data</p>
  }
  
  return (
    <table>
      <tbody>
        {data.map((item, index) => (
          <tr key={index}>{renderRow(item)}</tr>
        ))}
      </tbody>
    </table>
  )
}

// Usage
<DataTable
  data={profiles}
  renderRow={(profile) => (
    <>
      <td>{profile.name}</td>
      <td>{profile.address}</td>
    </>
  )}
/>
```

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

### When to Use Error Boundaries (🟡 Default)

Error boundaries catch rendering errors that escape your `Result` types. **They complement, not replace, `neverthrow`.**

```typescript
import { ErrorBoundary } from 'react-error-boundary'

// Route-level error boundary
export const Route = createFileRoute('/$name')({
  component: () => (
    <ErrorBoundary
      fallback={<ErrorFallback />}
      onError={(error, info) => {
        console.error('Rendering error:', error, info)
        // Optional: Send to error tracking service
      }}
    >
      <NamePage />
    </ErrorBoundary>
  ),
})
```

### Error Types

**Result errors (neverthrow) ≠ Rendering errors (Error Boundaries)**

| Error Type | Handling | Example |
|------------|----------|---------|
| **Data fetching errors** | `Result<T, E>` + pattern matching | API failure, validation error |
| **Business logic errors** | `Result<T, E>` + early returns | Invalid input, auth failure |
| **Rendering errors** | Error Boundary | Component crash, ref error |
| **Unexpected errors** | Error Boundary + logging | Third-party lib bugs |

### Error Boundary Implementation

```typescript
import { type FallbackProps } from 'react-error-boundary'

const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  return (
    <div role="alert" className="p-4">
      <h2>Something went wrong</h2>
      <pre className="text-sm">{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}

// Use at route or feature level
export const ProfilePage = () => {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <ProfileContent />
    </ErrorBoundary>
  )
}
```

### Best Practices

- ✅ **Use route-level boundaries** - Isolate errors to specific routes
- ✅ **Log errors** - Send to monitoring service (Sentry, LogRocket)
- ✅ **Provide recovery** - Give users a way to retry or navigate away
- ✅ **Never swallow errors** - Always log or display them
- ❌ **Don't use for control flow** - Use `Result` types for expected errors
- ❌ **Don't catch all errors globally** - Granular boundaries are better

## Styling with Tailwind CSS

### Utility-First Approach

```typescript
// Good - Utility classes
export const Button = ({ children }: { children: React.ReactNode }) => {
  return (
    <button className="rounded-sm bg-primary px-4 py-2 text-white hover:bg-primary/90">
      {children}
    </button>
  )
}
```

### Component Variants with CVA

Use `class-variance-authority` for type-safe variants:

```typescript
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-white hover:bg-primary/90',
        outline: 'border border-input bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface ButtonProps 
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {}

export const Button = ({ className, variant, size, ...props }: ButtonProps) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

> **Note**: For complex multi-part components (e.g., Card with separate Header, Body, Footer styles), consider [tailwind-variants](https://www.tailwind-variants.org/) which extends CVA with slots and built-in class merging. For single-part components, CVA + `cn()` is sufficient.

### Conditional Classes

Use the `cn` utility for conditional classes:

```typescript
import { cn } from '@/lib/utils'

export const Card = ({ isActive, className }: CardProps) => {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isActive && 'border-primary bg-primary/5',
        className
      )}
    >
      ...
    </div>
  )
}
```

### Icon Sizing with Lucide

```typescript
import { CalendarIcon } from 'lucide-react'

// Good - Use Tailwind size classes
<CalendarIcon className="size-4" />
<CalendarIcon className="size-3.5" />
<CalendarIcon className="size-6" />

// Avoid - Don't use props
<CalendarIcon width={16} height={16} />
<CalendarIcon size={16} />
```

## Routing with TanStack Router

### File-Based Routing

TanStack Router uses file-based routing:

```
routes/
├── __root.tsx              # Root layout
├── index.tsx               # / route
├── $name.tsx               # /:name route
└── $name/
    ├── records.tsx         # /:name/records
    └── history.tsx         # /:name/history
```

### Route Definition

```typescript
// routes/$name.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$name')({
  // Type-safe params
  validateSearch: (search) => ({
    tab: (search.tab as 'profile' | 'records') || 'profile',
  }),
  
  // Load data before rendering
  loader: async ({ params: { name } }) => {
    return await getProfile(name)
  },
  
  // Component
  component: function NamePage() {
    const { name } = Route.useParams()
    const { tab } = Route.useSearch()
    
    return <div>...</div>
  },
})
```

### Navigation

```typescript
import { Link, useNavigate } from '@tanstack/react-router'

export const Navigation = () => {
  const navigate = useNavigate()
  
  return (
    <nav>
      {/* Type-safe Link */}
      <Link to="/$name" params={{ name: 'vitalik.eth' }}>
        View Profile
      </Link>
      
      {/* Programmatic navigation */}
      <button
        onClick={() => {
          navigate({
            to: '/$name',
            params: { name: 'vitalik.eth' },
            search: { tab: 'records' },
          })
        }}
      >
        Go to Records
      </button>
    </nav>
  )
}
```

## Accessibility

### Semantic HTML

Use semantic HTML elements:

```typescript
// Good
<nav>
  <ul>
    <li><a href="/">Home</a></li>
  </ul>
</nav>

<main>
  <article>
    <h1>Title</h1>
    <p>Content</p>
  </article>
</main>

// Avoid
<div className="nav">
  <div className="nav-list">
    <div><span onClick={goHome}>Home</span></div>
  </div>
</div>
```

### ARIA Attributes

```typescript
// Good - Accessible button
<button
  type="button"
  aria-label="Close dialog"
  aria-pressed={isPressed}
>
  <XIcon className="size-4" />
</button>

// Good - Accessible form
<form>
  <label htmlFor="name-input">
    ENS Name
  </label>
  <input
    id="name-input"
    type="text"
    aria-describedby="name-help"
    aria-invalid={hasError}
  />
  <p id="name-help">Enter your ENS name</p>
</form>
```

### Keyboard Navigation

Ensure all interactive elements are keyboard accessible:

```typescript
export const MenuItem = ({ onClick }: { onClick: () => void }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      Menu Item
    </button>
  )
}
```

## General TypeScript/JavaScript Coding Guidelines

### Core Patterns

**Use Explaining Variables** - Extract complex expressions into named variables for clarity:

```typescript
// Good
const isEligible = user.age >= 18 && user.hasVerifiedEmail && !user.isBanned
if (isEligible) { /* ... */ }

// Avoid
if (user.age >= 18 && user.hasVerifiedEmail && !user.isBanned) { /* ... */ }
```

**Avoid Magic Values** - Replace magic numbers and strings with named constants:

```typescript
// Good
const SECONDS_PER_YEAR = 31536000n
const MIN_REGISTRATION_DURATION = SECONDS_PER_YEAR

// Avoid
if (duration < 31536000n) { /* ... */ }
```

**Prefer Array Methods** (🟢 Guideline) - Use `map`, `filter`, `reduce` for transformations:

```typescript
// Good - Declarative transformations
const activeUsers = users.filter(user => user.isActive)
const userNames = users.map(user => user.name)
const totalBalance = users.reduce((sum, user) => sum + user.balance, 0n)

// Also Good - Loop with early exit
function findFirstExpired(names: NameRecord[]): NameRecord | null {
  for (const record of names) {
    if (record.expiresAt < Date.now()) return record
  }
  return null
}
```

**Immutable Transformations** - Create new values instead of mutating:

```typescript
// Good
const addItem = <T,>(items: readonly T[], newItem: T) => [...items, newItem]
const updateItem = <T extends { id: string }>(items: readonly T[], id: string, updates: Partial<T>) =>
  items.map(item => item.id === id ? { ...item, ...updates } : item)

// Avoid mutation
items.push(newItem) // ❌
```

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
  const existingUser = yield* await ResultAsync.fromPromise(
    checkUserExists(userData.email),
    (error) => new NetworkError({ message: 'Failed to check user', cause: error })
  )
  
  if (existingUser) {
    yield* new ValidationError({ message: 'User already exists', field: 'email' })
  }
  
  const newUser = yield* await ResultAsync.fromPromise(
    createUser(userData),
    (error) => new NetworkError({ message: 'Failed to create user', cause: error })
  )
  
  return ok(newUser)
})
```

**Benefits**: Automatic error propagation, no manual chaining, type-safe, early returns.

**TaggedError yielding**: Since `TaggedError` extends [`YieldableError`](https://github.com/ensdomains/apps-monorepo/blob/main/packages/utils/src/neverthrow/error-classes.ts), you can yield errors directly in generator functions:

```typescript
// Inside ResultFn generators
if (!userData.email) {
  yield* new ValidationError({ message: 'Email is required' })
  // Immediately returns with error - no need for return err(...)
}

// In regular functions (not generators)
function validateData(data: unknown): Result<Data, ValidationError> {
  if (!data) {
    return err(new ValidationError({ message: 'Data is required' }))
    // Use return err() - yield* only works in generators
  }
  return ok(data as Data)
}
```

### Pattern Matching with Tagged Errors

```typescript
import { match } from 'ts-pattern'

const result = await processUserRegistration(userData)

result.match(
  (user) => console.log('Success:', user),
  (error) => match(error)
    .with({ _tag: 'VALIDATION_ERROR' }, (err) => 
      console.log(`Validation failed on ${err.field}: ${err.message}`)
    )
    .with({ _tag: 'NETWORK_ERROR' }, (err) => 
      console.log(`Network error: ${err.message}`)
    )
    .exhaustive()
)
```

### Testing with neverthrow

```typescript
import { assert } from 'vitest'

it('should return validation error for missing email', async () => {
  const result = await processUserRegistration({ email: '', name: 'John' })
  
  assert(result.isErr())
  expect(result.error._tag).toBe('VALIDATION_ERROR')
  expect(result.error.field).toBe('email')
})

it('should create user successfully', async () => {
  const result = await processUserRegistration({ email: 'john@example.com', name: 'John' })
  
  assert(result.isOk())
  expect(result.value.email).toBe('john@example.com')
})
```

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
  const user = yield* await ResultAsync.fromPromise(api.register(validated), ...)
  return ok(user)
})

// Component is now thin
export const RegistrationForm = () => {
  const handleSubmit = async () => {
    const result = await registerUser({ email, name })
    result.match(onSuccess, onError)
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

#### TypeScript & Code Quality

5. **Type everything** - Leverage TypeScript's strict mode (🔴 Must)
6. **No `any` types** - Use `unknown` for type-safe handling (🔴 Must)
7. **Use readonly** - Enforce immutability at type level (🟡 Default)
8. **Discriminated unions** - For state management and variants (🟡 Default)

#### Functional Programming

9. **Pure functions** - Same input → same output, no side effects (🟡 Default)
10. **Immutability** - Transform data, don't mutate (🔴 Must)
11. **Prefer array methods** - Use `map`, `filter`, `reduce` (🟢 Guideline)
12. **Composition** - Build complex operations from simple ones (🟡 Default)

#### Error Handling

13. **Use neverthrow** - Functional error handling with `Result` types (🔴 Must)
14. **TaggedError classes** - For discriminated error unions (🟡 Default)
15. **ResultFn generators** - For clean error composition (🟡 Default)
16. **Never mix Result with try-catch** - Choose one approach (🔴 Must)

#### React Patterns

17. **Extract effects** - Extract `useEffect` to custom hooks (🟡 Default, ≤5 lines OK)
18. **Pattern match** - Use ts-pattern over conditionals (🟡 Default)
19. **Custom hooks for APIs** - Only for DOM/framework APIs, not business logic (🟡 Default)
20. **Component composition** - Build flexible UIs with composition (🟢 Guideline)

#### State Management

21. **React state for UI** - Forms, toggles, simple caching
22. **XState for workflows** - Complex multi-step flows
23. **TanStack Query for async data** - Don't reinvent loading/error states with useState (🟡 Default)
24. **Object-based query keys** - Use singular object for params to enable partial invalidation (🟡 Default)

#### Web3 & Contracts

25. **Simple request builders** - For app-level contract helpers (🟡 Default)
26. **ENSjs two-part pattern** - For library-level contract functions (🟡 Default)
27. **Safe client access** - Use `safeGetClient` helper (🟡 Default)
28. **BigInt for blockchain values** - All numeric blockchain values (🔴 Must)

#### Testing & Quality

29. **Write testable code** - Pure functions with explicit dependencies (🟡 Default)
30. **Test business logic** - Unit test pure functions thoroughly (🟡 Default)
31. **Test user behavior** - Component tests from user perspective (🟡 Default)
32. **70/20/10 test distribution** - Unit/Integration/E2E (🟢 Guideline)

#### Performance & Reliability

33. **Measure before optimizing** - Use React DevTools Profiler (🟢 Guideline)
34. **Avoid premature memoization** - Only memoize when proven necessary (🟢 Guideline)
35. **Route-level error boundaries** - Catch rendering errors (🟡 Default)
36. **Result errors ≠ rendering errors** - Use both neverthrow and error boundaries (🟡 Default)

#### Code Formatting

37. **Use Biome** - Format and lint with one tool (🔴 Must)
38. **Single quotes** - For string literals (🟢 Guideline)
39. **2-space indentation** - Consistent formatting (🟢 Guideline)
40. **Organize imports** - Let Biome handle import sorting (🟢 Guideline)

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
2. **Naked `useEffect` in components** - Create custom hooks
3. **Using `any` type** - Use `unknown` or proper types
4. **Mutating data** - Use immutable transformations
5. **Mixing Result with try-catch** - Choose one approach
6. **Non-null assertions (`!`)** - Use type guards or optional chaining
7. **Complex nested conditionals** - Use pattern matching
8. **Magic numbers and strings** - Extract to named constants
9. **Direct dependency imports** - Use dependency injection
10. **Testing implementation details** - Test user behavior

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

