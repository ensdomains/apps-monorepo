# ENS Registration Refactoring Plan v2 (REVISED)

## Executive Summary

Refactor ENS registration to use a **centralized registration orchestration machine** in the `@ens-apps/transaction-manager` package, enabling both `apps/manager` and `apps/portal` to share the same registration logic.

**Current State**:
- Registration logic duplicated or inconsistent across apps
- Manager uses React useState + useEffect for flow control
- No shared registration infrastructure

**Target State**:
- Single registration machine in transaction-manager
- Both apps import and use same registration flow
- Proper XState-based architecture
- Complete audit trail and persistence

**Estimated Effort**: 4-6 days
**Risk Level**: Medium-Low (centralized = easier to maintain)

---

## Architecture Decision: Centralize in Transaction-Manager

### Why Move Registration to Transaction-Manager?

**Current Reality:**
```
apps/manager/     ← Needs ENS registration
apps/portal/      ← Also needs ENS registration
```

**Problem with App-Specific Implementation:**
- ❌ Duplicate code in both apps
- ❌ Inconsistent UX
- ❌ Bug fixes need to be applied twice
- ❌ Harder to maintain

**Solution: Centralize in transaction-manager**
- ✅ Single source of truth
- ✅ Consistent UX across apps
- ✅ Easier maintenance
- ✅ Transaction-manager already has ENS helpers
- ✅ Both apps become thin wrappers

### Precedent: Transaction-Manager Already Has ENS Features

Looking at existing code:
```typescript
// Already in transaction-manager!
import {
  getENSRenewalPrice,
  prepareENSRenewalTransaction,
  executeENSRenewal,
  initializeRhinestoneAccount
} from '@ens-apps/transaction-manager'
```

**This proves the pattern**: Transaction-manager already contains ENS-specific logic!

### Package Organization

```
packages/transaction-manager/src/
├── core/                              ← Generic (existing)
│   ├── machines/transaction.machine.ts
│   ├── transactionManager.ts
│   ├── types/
│   └── helpers/
│
└── ens/                               ← ENS-specific (NEW + existing)
    ├── machines/
    │   └── registration.machine.ts    ← NEW: Registration orchestration
    ├── actors/
    │   ├── commitment.actors.ts       ← NEW
    │   ├── approval.actors.ts         ← NEW
    │   └── registration.actors.ts     ← NEW
    ├── hooks/
    │   └── useENSRegistration.ts      ← NEW
    ├── helpers/
    │   ├── registration.helpers.ts    ← Refactor existing
    │   └── registration-persistence.ts ← NEW
    ├── components/                    ← NEW (optional)
    │   └── ENSRegistrationFlow/
    │       ├── PricingStep.tsx
    │       ├── CommitmentStep.tsx
    │       ├── ApprovalStep.tsx
    │       ├── RegistrationStep.tsx
    │       └── SuccessStep.tsx
    └── types/
        └── registration.types.ts      ← NEW
```

### App Structure (Becomes Thin)

```
apps/manager/src/features/register/
├── pages/
│   └── RegistrationPage.tsx           ← Simple wrapper (10-20 lines)
└── components/
    └── CustomBranding.tsx             ← App-specific customization (optional)

apps/portal/src/features/register/
├── pages/
│   └── RegistrationPage.tsx           ← Same simple wrapper
└── components/
    └── CustomBranding.tsx             ← Different branding (optional)
```

### Package Exports

```typescript
// packages/transaction-manager/package.json
{
  "exports": {
    ".": "./dist/index.js",                    // Generic exports
    "./ens": "./dist/ens/index.js",            // ENS-specific exports
    "./components": "./dist/components/index.js" // UI components
  }
}
```

**Usage in apps:**
```typescript
// Generic transaction features
import {
  transactionManager,
  useTransaction
} from '@ens-apps/transaction-manager'

// ENS registration features
import {
  useENSRegistration,
  ensRegistrationMachine
} from '@ens-apps/transaction-manager/ens'

// Optional pre-built UI
import {
  ENSRegistrationFlow
} from '@ens-apps/transaction-manager/components'
```

---

## Proposed Architecture

### Registration Flow

```
User clicks "Register"
  ↓
ensRegistrationMachine (in transaction-manager)
  ↓
├─→ collectingPaymentInfo
│   - User selects token, duration
│   ↓
├─→ preparingCommitment
│   - Generate commitment hash + secret
│   ↓
├─→ committingTransaction
│   - transactionManager.startTransaction(commitmentIntent, signer)
│   ↓
├─→ approvingToken
│   - transactionManager.startTransaction(approvalIntent, signer)
│   ↓
├─→ registeringDomain
│   - transactionManager.startTransaction(registrationIntent, signer)
│   ↓
└─→ success
```

### Two-Layer Persistence

```
┌─────────────────────────────────────────┐
│  Registration State (localStorage)      │  ← Orchestration
│  - Step: "committingTransaction"        │
│  - Name, duration, token                │
│  - Commitment data                      │
│  - Transaction IDs                      │
└─────────────────────────────────────────┘
              ↓ references
┌─────────────────────────────────────────┐
│  Transaction Manager (IndexedDB)        │  ← Individual txs
│  - tx-123: commitment (pending)         │
│  - tx-456: approval (success)           │
│  - tx-789: registration (pending)       │
└─────────────────────────────────────────┘
```

**Both are persisted**, both are recovered on refresh.

---

## Implementation Plan

### Phase 1: Create ENS Module in Transaction-Manager (Days 1-2)

**Goal**: Build registration infrastructure in transaction-manager package

#### Tasks

1. **Create directory structure**

   ```bash
   cd packages/transaction-manager
   mkdir -p src/ens/{machines,actors,hooks,helpers,components,types}
   ```

2. **Create registration machine**

   ```typescript
   // src/ens/machines/registration.machine.ts

   import { setup, assign, fromSnapshot } from 'xstate'
   import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
   import { transactionManager } from '../../core/transactionManager'

   type RegistrationContext = {
     // User input
     name: string
     duration: bigint
     selectedToken: 'USDC' | 'DAI'
     tokenPrice: bigint

     // Generated data
     commitment?: CommitmentData
     secret?: string

     // Transaction IDs
     commitmentTxId?: string
     approvalTxId?: string
     registrationTxId?: string

     // Dependencies
     rhinestoneAccount?: RhinestoneAccount
     accountAddress?: Address

     // Error state
     error?: Error
   }

   export const ensRegistrationMachine = setup({
     types: {
       context: {} as RegistrationContext,
       events: {} as RegistrationEvent
     },

     actors: {
       generateCommitment: fromResultAsync(generateCommitmentActor),
       submitCommitment: fromResultAsync(submitCommitmentActor),
       submitApproval: fromResultAsync(submitApprovalActor),
       submitRegistration: fromResultAsync(submitRegistrationActor),
       pollTransactionStatus: fromResultAsync(pollTransactionStatusActor)
     },

     actions: {
       recordTransition: () => {
         console.log('[ENS Registration] State transition')
       },

       saveState: ({ context }) => {
         saveRegistrationState(context)
       }
     }

   }).createMachine({
     id: 'ensRegistration',
     initial: 'idle',

     context: {
       name: '',
       duration: 0n,
       selectedToken: 'USDC',
       tokenPrice: 0n
     },

     states: {
       idle: {
         on: {
           START_REGISTRATION: {
             target: 'preparingCommitment',
             actions: assign({
               name: ({ event }) => event.name,
               duration: ({ event }) => event.duration,
               selectedToken: ({ event }) => event.token,
               tokenPrice: ({ event }) => event.price
             })
           }
         }
       },

       preparingCommitment: {
         entry: ['recordTransition', 'saveState'],

         invoke: {
           src: 'generateCommitment',
           input: ({ context }) => ({
             name: context.name,
             owner: context.accountAddress!
           }),
           onDone: {
             target: 'committingTransaction',
             actions: assign({
               commitment: ({ event }) => event.output.commitment,
               secret: ({ event }) => event.output.secret
             })
           },
           onError: 'error'
         }
       },

       committingTransaction: {
         entry: ['recordTransition', 'saveState'],

         invoke: {
           src: 'submitCommitment',
           input: ({ context }) => ({
             commitment: context.commitment!,
             rhinestoneAccount: context.rhinestoneAccount!,
             name: context.name,
             duration: context.duration
           }),
           onDone: {
             target: 'waitingForCommitment',
             actions: assign({
               commitmentTxId: ({ event }) => event.output
             })
           },
           onError: 'error'
         }
       },

       waitingForCommitment: {
         entry: ['recordTransition', 'saveState'],

         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({
             txId: context.commitmentTxId!
           }),
           onDone: 'approvingToken',
           onError: 'error'
         }
       },

       approvingToken: {
         entry: ['recordTransition', 'saveState'],

         invoke: {
           src: 'submitApproval',
           input: ({ context }) => ({
             tokenPrice: context.tokenPrice,
             selectedToken: context.selectedToken,
             rhinestoneAccount: context.rhinestoneAccount!,
             name: context.name
           }),
           onDone: {
             target: 'waitingForApproval',
             actions: assign({
               approvalTxId: ({ event }) => event.output
             })
           },
           onError: 'error'
         }
       },

       waitingForApproval: {
         entry: ['recordTransition', 'saveState'],

         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({
             txId: context.approvalTxId!
           }),
           onDone: 'registeringDomain',
           onError: 'error'
         }
       },

       registeringDomain: {
         entry: ['recordTransition', 'saveState'],

         invoke: {
           src: 'submitRegistration',
           input: ({ context }) => ({
             name: context.name,
             duration: context.duration,
             commitment: context.commitment!,
             rhinestoneAccount: context.rhinestoneAccount!
           }),
           onDone: {
             target: 'waitingForRegistration',
             actions: assign({
               registrationTxId: ({ event }) => event.output
             })
           },
           onError: 'error'
         }
       },

       waitingForRegistration: {
         entry: ['recordTransition', 'saveState'],

         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({
             txId: context.registrationTxId!
           }),
           onDone: 'success',
           onError: 'error'
         }
       },

       success: {
         type: 'final',
         entry: ['recordTransition', ({ context }) => {
           clearRegistrationState(context.name)
         }]
       },

       error: {
         entry: ['recordTransition', 'saveState'],
         on: {
           RETRY: 'preparingCommitment',
           CANCEL: 'idle'
         }
       }
     }
   })
   ```

3. **Create actor functions**

   ```typescript
   // src/ens/actors/commitment.actors.ts

   import { ok, err, Result } from 'neverthrow'
   import { generateRandomBytes } from 'viem'
   import { transactionManager } from '../../core/transactionManager'

   export async function generateCommitmentActor(input: {
     name: string
     owner: Address
   }): Promise<Result<CommitmentData, Error>> {
     try {
       const secret = generateRandomBytes(32)
       const commitment = keccak256(
         encodePacked(
           ['string', 'address', 'bytes32'],
           [input.name, input.owner, secret]
         )
       )

       return ok({
         commitment,
         secret: toHex(secret)
       })
     } catch (error) {
       return err(new Error('Failed to generate commitment'))
     }
   }

   export async function submitCommitmentActor(input: {
     commitment: CommitmentData
     rhinestoneAccount: RhinestoneAccount
     name: string
     duration: bigint
   }): Promise<Result<string, Error>> {
     const signer: RhinestoneSigner = {
       type: 'rhinestone',
       account: input.rhinestoneAccount,
       config: getRhinestoneConfig()
     }

     const intent: CustomTransactionIntent = {
       type: 'custom',
       request: {
         type: 'rhinestone-intent',
         from: input.rhinestoneAccount.getAddress(),
         to: REGISTRAR_CONTRACT_ADDRESS,
         data: encodeFunctionData({
           abi: registrarAbi,
           functionName: 'commit',
           args: [input.commitment.commitment]
         }),
         chainId: sepolia.id
       }
     }

     // Start transaction with metadata for recovery
     const txId = transactionManager.startTransaction(intent, signer, {
       metadata: {
         flowType: 'ens-registration',
         flowStep: 'commitment',
         name: input.name,
         duration: input.duration.toString(),
         commitment: input.commitment
       }
     })

     return ok(txId)
   }

   export async function pollTransactionStatusActor(input: {
     txId: string
   }): Promise<Result<void, Error>> {
     const txActor = transactionManager.getTransaction(input.txId)

     return new Promise((resolve, reject) => {
       const subscription = txActor.subscribe((snapshot) => {
         if (snapshot.matches('success')) {
           subscription.unsubscribe()
           resolve(ok(undefined))
         }

         if (snapshot.matches('error')) {
           subscription.unsubscribe()
           reject(err(snapshot.context.error))
         }
       })
     })
   }
   ```

4. **Create React hook**

   ```typescript
   // src/ens/hooks/useENSRegistration.ts

   import { useMachine } from '@xstate/react'
   import { fromSnapshot } from 'xstate'
   import { useEffect } from 'react'
   import { useRecoveredTransactions } from '../../core/hooks/useRecoveredTransactions'
   import { ensRegistrationMachine } from '../machines/registration.machine'
   import {
     loadRegistrationState,
     saveRegistrationState,
     clearRegistrationState
   } from '../helpers/registration-persistence'

   export function useENSRegistration(config: {
     rhinestoneAccount: RhinestoneAccount
     accountAddress: Address
     chainId: number
   }) {
     const recoveredTxs = useRecoveredTransactions()

     // Restore saved state if exists and has active transactions
     const savedState = loadRegistrationState()
     const hasRecoveredTxs = recoveredTxs.some(tx =>
       tx.metadata?.flowType === 'ens-registration' &&
       (tx.id === savedState?.context?.commitmentTxId ||
        tx.id === savedState?.context?.approvalTxId ||
        tx.id === savedState?.context?.registrationTxId)
     )

     const initialSnapshot = (savedState && hasRecoveredTxs)
       ? fromSnapshot(savedState)
       : undefined

     const [state, send] = useMachine(ensRegistrationMachine, {
       snapshot: initialSnapshot,
       input: {
         rhinestoneAccount: config.rhinestoneAccount,
         accountAddress: config.accountAddress
       }
     })

     // Auto-save state
     useEffect(() => {
       if (!state.matches('idle')) {
         saveRegistrationState(state)
       }
     }, [state])

     // Clear on completion
     useEffect(() => {
       if (state.matches('success')) {
         clearRegistrationState(state.context.name)
       }
     }, [state])

     const startRegistration = (params: {
       name: string
       duration: bigint
       token: 'USDC' | 'DAI'
       price: bigint
     }) => {
       send({
         type: 'START_REGISTRATION',
         ...params
       })
     }

     return {
       state,
       send,
       startRegistration,

       // Convenience selectors
       currentStep: state.value,
       isRecovered: !!initialSnapshot,
       isLoading: !state.matches('idle') &&
                  !state.matches('success') &&
                  !state.matches('error'),
       error: state.context.error,
       commitmentTxId: state.context.commitmentTxId,
       approvalTxId: state.context.approvalTxId,
       registrationTxId: state.context.registrationTxId
     }
   }
   ```

5. **Create persistence helpers**

   ```typescript
   // src/ens/helpers/registration-persistence.ts

   const STORAGE_KEY = 'ens-registration-state'
   const EXPIRY_MS = 3600000 // 1 hour

   export function saveRegistrationState(snapshot: any) {
     localStorage.setItem(STORAGE_KEY, JSON.stringify({
       value: snapshot.value,
       context: snapshot.context,
       timestamp: Date.now()
     }))
   }

   export function loadRegistrationState() {
     const saved = localStorage.getItem(STORAGE_KEY)
     if (!saved) return null

     const parsed = JSON.parse(saved)

     // Check expiry
     if (Date.now() - parsed.timestamp > EXPIRY_MS) {
       localStorage.removeItem(STORAGE_KEY)
       return null
     }

     return parsed
   }

   export function clearRegistrationState(name: string) {
     localStorage.removeItem(STORAGE_KEY)
     console.log(`[ENS Registration] Cleared state for ${name}`)
   }
   ```

6. **Export from transaction-manager**

   ```typescript
   // src/ens/index.ts

   export { ensRegistrationMachine } from './machines/registration.machine'
   export { useENSRegistration } from './hooks/useENSRegistration'
   export type { RegistrationContext, RegistrationEvent } from './types/registration.types'
   ```

   ```typescript
   // src/index.ts (main entry point)

   // Generic exports (existing)
   export * from './core/transactionManager'
   export * from './core/hooks/useTransaction'
   export * from './core/types'

   // ENS exports (new)
   export * from './ens'
   ```

**Deliverables (Phase 1):**
- [ ] ENS directory structure created
- [ ] ensRegistrationMachine implemented
- [ ] Actor functions created
- [ ] useENSRegistration hook created
- [ ] Persistence helpers created
- [ ] Exports configured

---

### Phase 2: Update Manager App (Day 3)

**Goal**: Refactor manager app to use new centralized registration

#### Tasks

1. **Simplify RegistrationPage**

   ```typescript
   // apps/manager/src/features/register/pages/RegistrationPage.tsx

   import { useENSRegistration } from '@ens-apps/transaction-manager/ens'
   import { match } from 'ts-pattern'

   export function RegistrationPage({ name }: { name: string }) {
     const { rhinestoneAccount, accountAddress } = useRhinestoneAccount()

     const {
       state,
       startRegistration,
       isRecovered,
       currentStep,
       commitmentTxId,
       approvalTxId,
       registrationTxId,
       error
     } = useENSRegistration({
       rhinestoneAccount,
       accountAddress,
       chainId: sepolia.id
     })

     return (
       <div>
         {/* Recovery banner */}
         {isRecovered && (
           <Banner>Resuming registration for {state.context.name}.eth</Banner>
         )}

         {/* Step-based rendering */}
         {match({ currentStep })
           .with({ currentStep: 'idle' }, () => (
             <PricingStep
               name={name}
               onStart={startRegistration}
             />
           ))
           .with({ currentStep: 'preparingCommitment' }, () => (
             <div>Preparing commitment...</div>
           ))
           .with({ currentStep: 'committingTransaction' }, () => (
             <CommitmentStep txId={commitmentTxId!} />
           ))
           .with({ currentStep: 'waitingForCommitment' }, () => (
             <CommitmentStep txId={commitmentTxId!} />
           ))
           .with({ currentStep: 'approvingToken' }, () => (
             <ApprovalStep txId={approvalTxId!} />
           ))
           .with({ currentStep: 'waitingForApproval' }, () => (
             <ApprovalStep txId={approvalTxId!} />
           ))
           .with({ currentStep: 'registeringDomain' }, () => (
             <RegistrationStep txId={registrationTxId!} />
           ))
           .with({ currentStep: 'waitingForRegistration' }, () => (
             <RegistrationStep txId={registrationTxId!} />
           ))
           .with({ currentStep: 'success' }, () => (
             <SuccessStep name={state.context.name} />
           ))
           .with({ currentStep: 'error' }, () => (
             <ErrorStep
               error={error!}
               onRetry={() => send({ type: 'RETRY' })}
             />
           ))
           .exhaustive()}
       </div>
     )
   }
   ```

2. **Delete old registration code**

   ```bash
   cd apps/manager/src/features/register
   rm -rf hooks/useRegistration.ts
   rm -rf machines/registrationMachine.ts
   rm -rf services/nameChainContractService.ts
   ```

3. **Update package.json**

   ```json
   {
     "dependencies": {
       "@ens-apps/transaction-manager": "workspace:*"
     }
   }
   ```

**Deliverables (Phase 2):**
- [ ] Manager app refactored to use useENSRegistration
- [ ] Old registration code deleted
- [ ] App tested end-to-end

---

### Phase 3: Update Portal App (Day 4)

**Goal**: Portal app also uses centralized registration

#### Tasks

1. **Create RegistrationPage in portal**

   ```typescript
   // apps/portal/src/features/register/pages/RegistrationPage.tsx

   // Almost identical to manager app!
   import { useENSRegistration } from '@ens-apps/transaction-manager/ens'
   import { match } from 'ts-pattern'

   export function RegistrationPage({ name }: { name: string }) {
     const { rhinestoneAccount, accountAddress } = useRhinestoneAccount()

     const {
       state,
       startRegistration,
       currentStep,
       // ... rest same as manager
     } = useENSRegistration({
       rhinestoneAccount,
       accountAddress,
       chainId: sepolia.id
     })

     // Same pattern as manager, possibly different styling
     return <div>...</div>
   }
   ```

**Deliverables (Phase 3):**
- [ ] Portal registration page created
- [ ] Portal app tested end-to-end
- [ ] Both apps work identically

---

### Phase 4: Optional UI Components (Day 5)

**Goal**: Create reusable UI components in transaction-manager

#### Tasks

1. **Create ENSRegistrationFlow component**

   ```typescript
   // packages/transaction-manager/src/ens/components/ENSRegistrationFlow/index.tsx

   import { match } from 'ts-pattern'
   import { useENSRegistration } from '../../hooks/useENSRegistration'
   import { PricingStep } from './PricingStep'
   import { CommitmentStep } from './CommitmentStep'
   // ... other steps

   export function ENSRegistrationFlow({
     name,
     rhinestoneAccount,
     accountAddress,
     chainId,
     onComplete
   }: ENSRegistrationFlowProps) {
     const { state, startRegistration, ... } = useENSRegistration({
       rhinestoneAccount,
       accountAddress,
       chainId
     })

     return match({ currentStep: state.value })
       .with({ currentStep: 'idle' }, () => (
         <PricingStep name={name} onStart={startRegistration} />
       ))
       .with({ currentStep: 'committingTransaction' }, () => (
         <CommitmentStep txId={state.context.commitmentTxId!} />
       ))
       // ... etc
       .exhaustive()
   }
   ```

2. **Update app to use pre-built component** (optional)

   ```typescript
   // apps/manager (simplified even further)

   import { ENSRegistrationFlow } from '@ens-apps/transaction-manager/components'

   export function RegistrationPage({ name }: { name: string }) {
     const { rhinestoneAccount, accountAddress } = useRhinestoneAccount()

     return (
       <ENSRegistrationFlow
         name={name}
         rhinestoneAccount={rhinestoneAccount}
         accountAddress={accountAddress}
         chainId={sepolia.id}
         onComplete={() => navigate('/success')}
       />
     )
   }
   ```

**Deliverables (Phase 4):**
- [ ] Pre-built UI components created
- [ ] Both apps optionally use them
- [ ] Customization still possible

---

## Testing Strategy

### Unit Tests (Transaction-Manager Package)

```typescript
// packages/transaction-manager/src/ens/actors/commitment.actors.test.ts

describe('generateCommitmentActor', () => {
  it('generates valid commitment', async () => {
    const result = await generateCommitmentActor({
      name: 'leon',
      owner: '0x123...'
    })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toHaveProperty('commitment')
    expect(result._unsafeUnwrap()).toHaveProperty('secret')
  })
})
```

### Machine Tests

```typescript
// packages/transaction-manager/src/ens/machines/registration.machine.test.ts

describe('ensRegistrationMachine', () => {
  it('transitions from idle to preparingCommitment', () => {
    const actor = createActor(ensRegistrationMachine)
    actor.start()

    actor.send({
      type: 'START_REGISTRATION',
      name: 'leon',
      duration: 31536000n,
      token: 'USDC',
      price: 100n
    })

    expect(actor.getSnapshot().value).toBe('preparingCommitment')
  })
})
```

### Integration Tests (Manager App)

```typescript
// apps/manager/src/features/register/pages/RegistrationPage.test.tsx

describe('RegistrationPage', () => {
  it('completes full registration flow', async () => {
    const { user, getByText } = render(<RegistrationPage name="leon" />)

    // Pricing step
    await user.click(getByText('Confirm Payment'))

    // Wait for success
    await waitFor(() => expect(getByText('Registration successful!')).toBeInTheDocument())
  })
})
```

---

## Benefits Summary

### For Both Apps
- ✅ Consistent registration UX
- ✅ Same bug fixes automatically
- ✅ Shared audit trail and debugging
- ✅ Unified error handling

### For Developers
- ✅ Single source of truth
- ✅ Test once, trust everywhere
- ✅ Easier to maintain
- ✅ Faster feature development

### For Users
- ✅ Reliable registration flow
- ✅ Automatic recovery from failures
- ✅ Consistent experience across apps

---

## Success Criteria

- [ ] `ensRegistrationMachine` in transaction-manager
- [ ] Both manager and portal use same registration logic
- [ ] Zero naked useEffect blocks
- [ ] Complete audit trail
- [ ] Persistence across refresh
- [ ] 100% test coverage for actors
- [ ] XState Inspector working
- [ ] Documentation updated

---

## Rollout Plan

### Week 1: Build (Days 1-5)
- Day 1-2: Transaction-manager implementation
- Day 3: Manager app refactor
- Day 4: Portal app refactor
- Day 5: Optional UI components

### Week 2: Testing
- Internal QA on both apps
- Feature flag rollout (10% → 50% → 100%)

### Week 3: Cleanup
- Remove feature flags
- Delete old code
- Update documentation

---

**Last Updated**: 2025-11-07
**Version**: 2.0 (Centralized Architecture)
**Status**: Ready for Implementation
