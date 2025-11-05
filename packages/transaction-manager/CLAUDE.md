# Transaction Manager - Claude Development Guidelines

This file contains Claude-specific instructions for working with the transaction manager package.

## Architecture Overview

The transaction manager uses XState v5 for state machine-based transaction orchestration with pluggable Signer abstractions for different account types.

## Key Documentation

When working on this package, consult these design documents:

### Core Architecture
- **[Transaction Flow](./docs/TRANSACTION_FLOW.md)** - Complete transaction lifecycle and state machine design
- **[Signer Architecture](./docs/SIGNER_ARCHITECTURE.md)** - How transaction preparation and signing works

### Migration & History
- **[Signer Refactor](./docs/SIGNER_REFACTOR.md)** - Migration from tightly coupled design to Signer abstraction

## Important Patterns

### 1. Signer Abstraction

The transaction manager receives **unsigned transactions** and a **Signer** (capability to sign), then orchestrates the signing process.

```typescript
// React prepares the unsigned transaction
const result = await prepareENSRenewal({
  publicClient,
  walletClient,
  name: 'leon',
  duration: 31536000n,
  chainId: 11155111,
  useSmartAccount: false,
})

// React creates a Signer (reference to signing capability)
const signer: Signer = {
  type: 'eoa',
  walletClient,
}

// Transaction manager handles signing through the Signer
const txId = startTransaction(result.value.request, signer, result.value.options)
```

**Key principle**: The Signer is NOT a signature - it's a reference to the capability to sign (wallet, account).

### 2. State Machine for Transaction Lifecycle

All transaction state must be managed by the XState machine, not ad-hoc state management.

**Why**:
- State transitions are explicit and auditable
- Impossible states are prevented
- Retry/fallback logic is centralized
- Business logic is documented by the machine graph

See [Transaction Flow](./docs/TRANSACTION_FLOW.md) for complete details.

### 3. Pure Actor Functions

Transport actors (eoa-transport.actor.ts, rhinestone-transport.actor.ts) are **pure functions** with no state:

```typescript
// ✅ Pure actor - all inputs are explicit parameters
export function submitEOATransaction(input: {
  request: TransactionRequest
  signer: EOASigner
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { request, signer } = input
  const { walletClient } = signer

  return fromPromiseNT(
    walletClient.sendTransaction({ ... }),
    (error) => new TransactionSubmissionError(request, error)
  )
}
```

**Benefits**:
- Easy to test in isolation
- No hidden state
- Clear dependencies
- Composable

### 4. neverthrow for Error Handling

All async operations return `Result` or `ResultAsync` types:

```typescript
import { Result, ResultAsync, ok, err, okAsync, errAsync } from 'neverthrow'

// Sync function
export function validateInput(input: string): Result<string, Error> {
  if (input.length > 0) return ok(input)
  return err(new Error('Empty input'))
}

// Async function
export function submitTransaction(...): ResultAsync<Hash, Error> {
  if (!client) {
    return errAsync(new Error('No client'))  // Use errAsync for ResultAsync
  }

  return fromPromise(
    client.sendTransaction({ ... }),
    (error) => new Error(error)
  )
}
```

**Important**: Never mix Result with try-catch. See [neverthrow guide](../../CLAUDE.md#neverthrow---functional-error-handling).

### 5. XState + neverthrow Integration

Use `fromResultAsync` helper to integrate ResultAsync with XState actors:

```typescript
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'

const machine = setup({
  actors: {
    submitTx: fromResultAsync(
      ({ request, signer }) => submitEOATransaction({ request, signer })
      // Returns ResultAsync directly - no unwrapping needed!
    )
  }
})

// Use in states
states: {
  submitting: {
    invoke: {
      src: 'submitTx',
      input: ({ context }) => ({ request: context.request, signer: context.signer }),
      onDone: { target: 'success' },
      onError: { target: 'error' }
    }
  }
}
```

**No try-catch needed** - `fromResultAsync` automatically unwraps the Result.

## File Structure

```
src/
├── types/
│   ├── transaction.types.ts    # Transaction request types
│   ├── signer.types.ts         # Signer abstraction types
│   └── audit.types.ts          # Audit trail types
├── actors/
│   ├── eoa-transport.actor.ts       # EOA signing implementation
│   └── rhinestone-transport.actor.ts # Rhinestone signing implementation
├── machines/
│   └── transaction.machine.ts  # Main transaction state machine
├── providers/
│   ├── TransactionActorManagerProvider.tsx  # Main provider
│   └── AccountProvider.tsx     # Account management (optional)
├── helpers/
│   ├── ens-renewal.helpers.ts       # Prepares unsigned transactions
│   ├── rhinestone-account.helpers.ts # Rhinestone account utilities
│   └── transaction-persistence.ts   # LocalStorage persistence
├── services/
│   └── audit-trail.service.ts  # Audit logging
└── components/
    ├── TransactionModal/       # Transaction UI components
    └── ...
```

## Adding a New Signer Type

To add support for a new account type (e.g., Privy, Safe):

1. **Add Signer type** (src/types/signer.types.ts):
```typescript
export interface PrivySigner {
  type: 'privy'
  privyClient: PrivyClient
  // ... other required fields
}

export type Signer = EOASigner | RhinestoneSigner | PrivySigner | ...
```

2. **Create transport actor** (src/actors/privy-transport.actor.ts):
```typescript
export function submitPrivyTransaction(input: {
  request: TransactionRequest
  signer: PrivySigner
}): ResultAsync<Hash, TransactionSubmissionError> {
  // Implementation
}
```

3. **Update machine routing** (src/machines/transaction.machine.ts):
```typescript
switch (signer.type) {
  case 'eoa': return submitEOATransaction({ request, signer })
  case 'rhinestone': return submitRhinestoneTransaction({ request, signer, publicClient })
  case 'privy': return submitPrivyTransaction({ request, signer })
}
```

4. **Export types** (src/index.ts):
```typescript
export type { PrivySigner } from './types/signer.types'
```

See [Signer Architecture](./docs/SIGNER_ARCHITECTURE.md#adding-a-new-signer-type) for complete details.

## Testing

### Unit Testing Transport Actors

```typescript
import { ok, err } from 'neverthrow'

describe('submitEOATransaction', () => {
  it('submits transaction successfully', async () => {
    const mockWalletClient = {
      sendTransaction: vi.fn().mockResolvedValue('0xhash...')
    }

    const signer: EOASigner = {
      type: 'eoa',
      walletClient: mockWalletClient as any
    }

    const result = await submitEOATransaction({
      request: mockRequest,
      signer
    })

    expect(result.isOk()).toBe(true)
    expect(result.value).toBe('0xhash...')
  })
})
```

### Integration Testing with State Machine

```typescript
import { createActor } from 'xstate'

describe('Transaction Machine', () => {
  it('transitions from idle → submitting → success', async () => {
    const actor = createActor(transactionMachine, {
      input: {
        request: mockRequest,
        signer: mockSigner,
        publicClient: mockPublicClient
      }
    })

    actor.start()

    // Assert state transitions
    expect(actor.getSnapshot().value).toBe('idle')
    actor.send({ type: 'SUBMIT' })
    expect(actor.getSnapshot().value).toBe('submitting')

    // Wait for completion
    await waitFor(() => {
      expect(actor.getSnapshot().value).toBe('success')
    })
  })
})
```

## Common Pitfalls

### ❌ Don't: Use err() for ResultAsync return types
```typescript
function submit(...): ResultAsync<Hash, Error> {
  if (!client) {
    return err(new Error('...'))  // Type error! err() returns Err<T, E>, not ResultAsync
  }
}
```

### ✅ Do: Use errAsync() for ResultAsync
```typescript
function submit(...): ResultAsync<Hash, Error> {
  if (!client) {
    return errAsync(new Error('...'))  // Correct!
  }
}
```

### ❌ Don't: Wrap sync code in Promise for ResultAsync
```typescript
export function importData(json: string): ResultAsync<void, Error> {
  return ResultAsync.fromPromise(
    Promise.resolve().then(() => {
      const data = JSON.parse(json)
      saveData(data)
    }),
    (error) => new Error(error)
  )
}
```

### ✅ Do: Use sync Result for sync operations
```typescript
export function importData(json: string): Result<void, Error> {
  try {
    const data = JSON.parse(json)
    saveData(data)
    return ok(undefined)
  } catch (error) {
    return err(new Error(error))
  }
}
```

## Related Documentation

- [Monorepo CLAUDE.md](../../CLAUDE.md) - General development guidelines
- [ENS CLAUDE.md](/Volumes/My Shared Files/ENS/CLAUDE.md) - ENS-specific references
