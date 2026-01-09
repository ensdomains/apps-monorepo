# TypeScript and Code Quality

Guidelines for writing clean, type-safe TypeScript code with proper file organization and naming conventions.

> **See also**: [README.md](./README.md) for core principles and navigation.

## Table of Contents

- [File Structure \& Organization](#file-structure--organization)
- [Naming Conventions](#naming-conventions)
- [TypeScript Usage](#typescript-usage)
- [General TypeScript/JavaScript Coding Guidelines](#general-typescriptjavascript-coding-guidelines)

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
- **Handlers**: `*.handlers.ts` (e.g., `ProfileEdit.handlers.ts`)
- **State Machines**: `*.machine.ts` (e.g., `registration.machine.ts`)
- **Mock Data**: `*.mock.ts` or `MOCK.ts` (e.g., `profile.mock.ts`)
- **Test Files**: `*.test.ts(x)` (e.g., `UserProfile.test.tsx`)
- **Route Files**: TanStack Router conventions (e.g., `$name.tsx`)

**Co-location with handlers:**

```
features/profile/components/
├── ProfileEdit.tsx
├── ProfileEdit.handlers.ts    # Event handlers for ProfileEdit
└── ProfileEdit.test.tsx
```

**Benefits of `*.handlers.ts`:**
- ✅ Clear separation of UI from logic
- ✅ Easy to test handlers independently
- ✅ Co-located with the component that uses them

### Mock Data Policy 🟡 Default

**All mock data must live in `*.mock.ts` or `MOCK.ts` files and be gated by dev flags.**

```typescript
// ❌ AVOID - Mock data in production code
export const ProfileCard = ({ userId }: Props) => {
  const mockUser = { id: 1, name: 'Test User' } // Don't do this
  const user = userId ? fetchUser(userId) : mockUser
  return <div>{user.name}</div>
}

// ✅ CORRECT - Mock data in separate file, dev-only
// profile.mock.ts
export const mockUser = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
}

export const mockUsers = [mockUser, /* ... */]

// ProfileCard.tsx
import { mockUser } from './profile.mock'

export const ProfileCard = ({ userId }: Props) => {
  const user = import.meta.env.DEV 
    ? mockUser 
    : fetchUser(userId)
  
  return <div>{user.name}</div>
}
```

**Benefits:**
- ✅ **No mock data in production** - Gated by dev flags
- ✅ **Easy to find** - All mocks in `*.mock.ts` files
- ✅ **Reusable** - Share mocks across tests and dev mode
- ✅ **Type-safe** - Mocks match real data structures

**Dev flag options:**
- `import.meta.env.DEV` - Vite dev mode
- `process.env.NODE_ENV === 'development'` - Node/general
- Feature flags - For gradual rollout

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

### Avoid `any`, Use `unknown` 🔴 Must

```typescript
// ❌ AVOID - any bypasses type checks
function parseData(data: any) {
  return data.value
}

// ✅ CORRECT - unknown with type guard
function parseData(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String(data.value)
  }
  throw new Error('Invalid data')
}

// ✅ CORRECT - Record for unknown object shapes
function processConfig(config: Record<string, unknown>) {
  // Type-safe access to object properties
  const name = typeof config.name === 'string' ? config.name : 'default'
  return name
}

// ✅ ACCEPTABLE - Record<string, any> when structure is truly unknown
// Use sparingly, prefer Record<string, unknown> for stricter type safety
function processApiResponse(response: Record<string, any>) {
  // When you need flexibility but know it's an object
  return response
}
```

**Guidelines:**
- ✅ **Use `unknown`** - For values of unknown type (requires type guards)
- ✅ **Use `Record<string, unknown>`** - For objects with unknown shape (stricter)
- ⚠️ **Use `Record<string, any>`** - Only when you need flexibility and know it's an object
- ❌ **Never use `any`** - Bypasses all type safety

### Use Generics to Preserve Types 🟡 Default

When working with strongly typed objects, use generics to preserve type information:

```typescript
// ✅ CORRECT - Generic preserves type
function getObjectValue<T extends object, K extends keyof T>(
  obj: T,
  key: K
): T[K] {
  return obj[key]
}

// Usage - return type is automatically inferred
interface User {
  name: string
  age: number
}

const user: User = { name: 'Alice', age: 30 }
const userName = getObjectValue(user, 'name') // Type: string
const userAge = getObjectValue(user, 'age')   // Type: number

// ✅ CORRECT - Generic with constraints
function mapObject<T extends object, R>(
  obj: T,
  mapper: (value: T[keyof T], key: keyof T) => R
): R[] {
  return Object.entries(obj).map(([key, value]) => 
    mapper(value as T[keyof T], key as keyof T)
  )
}

// ❌ AVOID - Loses type information
function getObjectValue(obj: object, key: string): unknown {
  return (obj as any)[key] // No type safety
}
```

**Benefits:**
- ✅ **Type preservation** - Return types inferred from input types
- ✅ **IntelliSense support** - Better autocomplete
- ✅ **Compile-time safety** - Catch errors before runtime

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

---

> **Next**: See [REACT-AND-UI.md](./REACT-AND-UI.md) for React component patterns and styling guidelines.
