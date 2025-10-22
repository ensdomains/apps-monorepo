# ENS Apps Monorepo - Development Guidelines

## Core Design Principles

### 1. Business Logic Outside React Components

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

### 2. Pattern Matching Over Conditional Operators

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

### 3. State Machines for Complex Flows

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

### Error Handling
- Use `neverthrow` Result types for all async operations
- Create specific error classes extending `TaggedError`
- Always handle both success and error cases explicitly

### TypeScript
- Strict mode is enabled
- Avoid `any` types
- Use proper type inference where possible
- Type cast only when necessary with clear intent

### Code Style
- Follow existing patterns in neighboring files
- Use the project's established utilities and helpers
- Check imports from existing files before adding new dependencies
