# Signer Abstraction Refactor Plan

## Overview
Separate account management from transaction management by introducing a `Signer` abstraction.

## Current Architecture Problems
1. **Tight Coupling**: TransactionActorManagerProvider knows about Rhinestone accounts
2. **Mixed Concerns**: AccountProvider handles both wallet connection AND Rhinestone initialization
3. **Hard to Extend**: Adding Privy, Safe, or other account types requires modifying transaction manager

## New Architecture

### 1. Signer Types (`signer.types.ts`) ✅ DONE
```typescript
type Signer =
  | { type: 'eoa'; walletClient: WalletClient }
  | { type: 'rhinestone'; account: RhinestoneAccount; publicClient: PublicClient; config: RhinestoneConfig }
  | { type: 'erc4337'; userOpClient: any; account: any }
  | { type: 'privy'; privyClient: any; walletClient: WalletClient }
  | { type: 'safe'; safeClient: any; walletClient: WalletClient }
```

### 2. Transaction Manager Changes

#### TransactionActorManagerProvider
```typescript
// OLD
interface Props {
  children: ReactNode
}

startTransaction(
  request: TransactionRequest,
  options: TransactionOptions & {
    publicClient: any
    walletClient?: any
    rhinestoneConfig?: any
    rhinestoneAccount?: any
  }
)

// NEW
interface Props {
  children: ReactNode
  publicClient: PublicClient
}

startTransaction(
  request: TransactionRequest,
  signer: Signer,
  options?: TransactionOptions
)
```

#### Transaction Machine Context
```typescript
// OLD
context: {
  publicClient: PublicClient
  walletClient?: WalletClient
  rhinestoneConfig?: RhinestoneConfig
  rhinestoneAccount?: any
  request?: TransactionRequest
  options: TransactionOptions
  // ...
}

// NEW
context: {
  publicClient: PublicClient
  signer?: Signer
  request?: TransactionRequest
  options: TransactionOptions
  // ...
}
```

#### submitTransaction Actor
```typescript
// OLD - Routes based on request.type
switch (request.type) {
  case 'eoa':
    if (!walletClient) return errAsync(...)
    return submitEOATransaction({ request, walletClient })
  case 'rhinestone-intent':
    if (!rhinestoneAccount) return errAsync(...)
    return submitRhinestoneTransaction({ request, rhinestoneAccount, publicClient, rhinestoneConfig })
}

// NEW - Routes based on signer.type
switch (signer.type) {
  case 'eoa':
    return submitEOATransaction({ request, signer })
  case 'rhinestone':
    return submitRhinestoneTransaction({ request, signer, publicClient })
}
```

### 3. Transport Actor Changes

#### EOA Transport
```typescript
// OLD
export function submitEOATransaction(input: {
  request: EOATransactionRequest
  walletClient: WalletClient
}): ResultAsync<Hash, TransactionSubmissionError>

// NEW
export function submitEOATransaction(input: {
  request: TransactionRequest
  signer: EOASigner
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { walletClient } = signer
  // ... rest stays the same
}
```

#### Rhinestone Transport
```typescript
// OLD
export function submitRhinestoneTransaction(input: {
  request: TransactionRequest
  rhinestoneAccount: any
  publicClient: PublicClient
  rhinestoneConfig: RhinestoneConfig
}): ResultAsync<Hash, TransactionSubmissionError>

// NEW
export function submitRhinestoneTransaction(input: {
  request: TransactionRequest
  signer: RhinestoneSigner
  publicClient: PublicClient
}): ResultAsync<Hash, TransactionSubmissionError> {
  const { account, config } = signer
  // ... rest stays the same
}
```

### 4. Account Management (Keep Separate)

AccountProvider stays as-is but becomes **optional** - only needed for Rhinestone accounts.

```typescript
// App.tsx
function App() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // Optional: Only if using Rhinestone
  const { rhinestoneAccount } = useRhinestoneAccount()

  return (
    <TransactionManagerProvider publicClient={publicClient}>
      <MyComponent />
    </TransactionManagerProvider>
  )
}
```

### 5. Example App Usage

```typescript
// Component using transaction manager
function ENSRenewalExample() {
  const { startTransaction } = useTransactionManager()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { rhinestoneAccount } = useRhinestoneAccount() // Optional

  const [useSmartAccount, setUseSmartAccount] = useState(false)

  const handleRenewal = async () => {
    const request: TransactionRequest = {
      type: useSmartAccount ? 'rhinestone-intent' : 'eoa',
      from: address,
      to: ENS_CONTRACT,
      value: renewalPrice,
      rhinestoneParams: useSmartAccount ? { name, duration } : undefined,
      // ...
    }

    const signer: Signer = useSmartAccount && rhinestoneAccount
      ? {
          type: 'rhinestone',
          account: rhinestoneAccount,
          publicClient,
          config: rhinestoneConfig
        }
      : {
          type: 'eoa',
          walletClient: walletClient!
        }

    startTransaction(request, signer, {
      confirmations: 1,
      timeout: 60000
    })
  }

  return <button onClick={handleRenewal}>Renew</button>
}
```

## Benefits

1. **Separation of Concerns**: Transaction manager doesn't know about Rhinestone
2. **Pluggable Signers**: Easy to add Privy, Safe, Turnkey, etc.
3. **Independent Evolution**: Can update Rhinestone SDK without touching transaction manager
4. **Better Testing**: Mock signers easily
5. **Tree-shaking**: Don't bundle Rhinestone SDK if not used

## Migration Path

### Phase 1: Create Signer Types ✅
- [x] Create `signer.types.ts` with all signer types
- [x] Export from index.ts

### Phase 2: Update Transaction Manager
- [ ] Update TransactionActorManagerProvider interface
- [ ] Update transaction.machine context/input
- [ ] Update submitTransaction actor to route by signer.type

### Phase 3: Update Transport Actors
- [ ] Update eoa-transport.actor.ts to accept EOASigner
- [ ] Update rhinestone-transport.actor.ts to accept RhinestoneSigner

### Phase 4: Update Example App
- [ ] Update App.tsx to pass publicClient to TransactionManagerProvider
- [ ] Update ENSRenewalExample to create Signer objects
- [ ] Update renewal.helpers.ts to accept Signer

### Phase 5: Testing
- [ ] Test EOA transaction flow
- [ ] Test Rhinestone transaction flow
- [ ] Verify backward compatibility

### Phase 6: Documentation
- [ ] Update README with new API
- [ ] Add migration guide
- [ ] Document how to add new signer types

## Files to Modify

1. `/packages/transaction-manager/src/types/signer.types.ts` ✅
2. `/packages/transaction-manager/src/providers/TransactionActorManagerProvider.tsx`
3. `/packages/transaction-manager/src/machines/transaction.machine.ts`
4. `/packages/transaction-manager/src/actors/eoa-transport.actor.ts`
5. `/packages/transaction-manager/src/actors/rhinestone-transport.actor.ts`
6. `/packages/transaction-manager/src/index.ts`
7. `/packages/transaction-manager-example/src/App.tsx`
8. `/packages/transaction-manager-example/src/ENSRenewalExample.tsx`
9. `/packages/transaction-manager-example/src/helpers/renewal.helpers.ts`

## Notes

- Keep AccountProvider separate - it's for Rhinestone account management only
- TransactionManagerProvider should be agnostic to account types
- Signer abstraction allows ANY signing method (EOA, AA, MPC, etc.)
