# ENS Registration Refactoring Plan v3 (Simplified - No Custom Hooks)

## Executive Summary

Refactor ENS registration in the **manager app** using XState machines in `@ens-apps/transaction-manager`. **No custom hooks** - team uses XState directly via `useMachine` and `useSelector`.

**Current State**: Manager uses React useState + useEffect
**Target State**: XState machines, no abstraction layers
**Scope**: Manager app only (portal later)
**Team Context**: Internal monorepo, everyone learns XState
**Estimated Effort**: 2-3 days

---

## Package Philosophy

### No Custom Hooks - Direct XState Usage

**Export machines, not hooks:**
```typescript
// ✅ Export the machine
export { registrationMachine } from './machines/registration.machine'

// ❌ Don't wrap in custom hooks
// export { useENSRegistration } from './hooks/useENSRegistration'
```

**Why?**
- ✅ Team learns XState directly
- ✅ Less code to maintain
- ✅ More flexible (full XState API access)
- ✅ Better TypeScript inference
- ✅ Clearer mental model

---

## Package Structure

```
packages/transaction-manager/src/
├── machines/
│   ├── registration/                   ← Registration machine + co-located code
│   │   ├── registration.machine.ts
│   │   ├── registration.actors.ts      ← Only used by registration.machine.ts
│   │   └── registration.helpers.ts     ← Only used by registration.machine.ts
│   │
│   ├── renewal/                        ← Renewal machine + co-located code
│   │   ├── renewal.machine.ts
│   │   ├── renewal.actors.ts
│   │   └── renewal.helpers.ts
│   │
│   ├── transfer/                       ← Transfer machine + co-located code
│   │   ├── transfer.machine.ts
│   │   ├── transfer.actors.ts
│   │   └── transfer.helpers.ts
│   │
│   └── transaction/                    ← Transaction machine + co-located code
│       ├── transaction.machine.ts
│       ├── transaction.actors.ts       ← EOA/Rhinestone submission actors
│       └── transaction.helpers.ts
│
├── shared/                             ← ONLY code used by 2+ machines
│   ├── rhinestone.helpers.ts           ← Used by all ENS operations
│   ├── persistence.helpers.ts          ← Used by all machines
│   ├── pricing.helpers.ts              ← Used by registration + renewal
│   └── ens-contracts.ts                ← Contract ABIs/addresses
│
├── services/
│   └── transactionManager.ts           ← Manages standalone transactions
│
└── types/
    ├── transaction.types.ts
    ├── signer.types.ts
    └── operations.types.ts
```

---

## Package Exports

```typescript
// packages/transaction-manager/src/index.ts

// === Machines (use with useMachine) ===
export { transactionMachine } from './machines/transaction/transaction.machine'
export { registrationMachine } from './machines/registration/registration.machine'
export { renewalMachine } from './machines/renewal/renewal.machine'
export { transferMachine } from './machines/transfer/transfer.machine'

// === Services ===
export { transactionManager } from './services/transactionManager'

// === Shared Helpers (used by 2+ machines) ===
// Only export if apps need them. Otherwise they're internal to machines.
// export { getENSPrice } from './shared/pricing.helpers'
// export { initializeRhinestoneAccount } from './shared/rhinestone.helpers'

// === Types ===
export type {
  Signer,
  TransactionIntent,
  TransactionRequest,
  RegistrationParams,
  RenewalParams,
  TransferParams
} from './types'
```

---

## Implementation Plan

### Phase 1: Build Registration Machine (Day 1)

**Goal**: Create registration machine in transaction-manager

#### Tasks

1. **Create registration machine**

   ```typescript
   // packages/transaction-manager/src/machines/registration.machine.ts

   import { setup, assign, fromSnapshot } from 'xstate'
   import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'

   type RegistrationContext = {
     name: string
     duration: bigint
     selectedToken: 'USDC' | 'DAI'
     tokenPrice: bigint
     commitment?: CommitmentData
     secret?: string
     commitmentTxId?: string
     approvalTxId?: string
     registrationTxId?: string
     rhinestoneAccount?: RhinestoneAccount
     accountAddress?: Address
     error?: Error
   }

   type RegistrationEvent =
     | { type: 'START_REGISTRATION'; name: string; duration: bigint; token: 'USDC' | 'DAI'; price: bigint }
     | { type: 'RETRY' }
     | { type: 'CANCEL' }

   export const registrationMachine = setup({
     types: {
       context: {} as RegistrationContext,
       events: {} as RegistrationEvent,
       input: {} as {
         rhinestoneAccount: RhinestoneAccount
         accountAddress: Address
         chainId: number
       }
     },

     actors: {
       generateCommitment: fromResultAsync(generateCommitmentActor),
       submitCommitment: fromResultAsync(submitCommitmentActor),
       submitApproval: fromResultAsync(submitApprovalActor),
       submitRegistration: fromResultAsync(submitRegistrationActor),
       pollTransactionStatus: fromResultAsync(pollTransactionStatusActor)
     },

     actions: {
       logTransition: ({ context }) => {
         console.log('[Registration] State transition:', context)
       },

       clearSnapshot: async () => {
         await persistenceService.clearRegistrationSnapshot()
       }
     }

     // Note: Persistence is handled via inspect option (see below)
     // No need for saveState action - inspect auto-saves on every transition

   }).createMachine({
     id: 'registration',
     initial: 'idle',

     context: ({ input }) => ({
       name: '',
       duration: 0n,
       selectedToken: 'USDC',
       tokenPrice: 0n,
       rhinestoneAccount: input.rhinestoneAccount,
       accountAddress: input.accountAddress
     }),

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
         entry: 'logTransition',
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
         entry: 'logTransition',
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
         entry: 'logTransition',
         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({ txId: context.commitmentTxId! }),
           onDone: 'approvingToken',
           onError: 'error'
         }
       },

       approvingToken: {
         entry: 'logTransition',
         invoke: {
           src: 'submitApproval',
           input: ({ context }) => ({
             tokenPrice: context.tokenPrice,
             selectedToken: context.selectedToken,
             rhinestoneAccount: context.rhinestoneAccount!
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
         entry: 'logTransition',
         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({ txId: context.approvalTxId! }),
           onDone: 'registeringDomain',
           onError: 'error'
         }
       },

       registeringDomain: {
         entry: 'logTransition',
         invoke: {
           src: 'submitRegistration',
           input: ({ context }) => ({
             name: context.name,
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
         entry: 'logTransition',
         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({ txId: context.registrationTxId! }),
           onDone: 'success',
           onError: 'error'
         }
       },

       success: {
         type: 'final',
         entry: ['logTransition', 'clearSnapshot']
       },

       error: {
         entry: 'logTransition',
         on: {
           RETRY: 'preparingCommitment',
           CANCEL: 'idle'
         }
       }
     }
   })
   ```

2. **Create actor functions**

   ```typescript
   // packages/transaction-manager/src/actors/registration/commitment.actor.ts

   import { ok, err, Result } from 'neverthrow'
   import { transactionManager } from '../../services/transactionManager'

   export async function generateCommitmentActor(input: {
     name: string
     owner: Address
   }): Promise<Result<CommitmentData, Error>> {
     try {
       const secret = generateRandomBytes(32)
       const commitment = keccak256(
         encodePacked(['string', 'address', 'bytes32'], [input.name, input.owner, secret])
       )
       return ok({ commitment, secret: toHex(secret) })
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
     const txId = transactionManager.startTransaction(
       {
         type: 'custom',
         request: {
           type: 'rhinestone-intent',
           from: input.rhinestoneAccount.getAddress(),
           to: REGISTRAR_ADDRESS,
           data: encodeFunctionData({
             abi: registrarAbi,
             functionName: 'commit',
             args: [input.commitment.commitment]
           })
         }
       },
       {
         type: 'rhinestone',
         account: input.rhinestoneAccount,
         config: getRhinestoneConfig()
       },
       {
         metadata: {
           flowType: 'ens-registration',
           flowStep: 'commitment',
           name: input.name
         }
       }
     )

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

3. **Update persistence service to handle machine snapshots**

   The transaction-manager already has IndexedDB persistence. Extend it to handle registration machine snapshots:

   ```typescript
   // packages/transaction-manager/src/services/persistence.service.ts
   // (existing service - add new methods)

   interface MachineSnapshot {
     machineType: 'registration' | 'renewal' | 'transfer'
     context: any
     state: any
     timestamp: number
   }

   export class PersistenceService {
     // ... existing transaction persistence methods

     /**
      * Save registration machine snapshot
      */
     async saveRegistrationSnapshot(snapshot: {
       context: any
       value: any
     }): Promise<void> {
       const data: MachineSnapshot = {
         machineType: 'registration',
         context: snapshot.context,
         state: snapshot.value,
         timestamp: Date.now()
       }

       await this.db.put('machineSnapshots', data, 'registration')
     }

     /**
      * Load registration machine snapshot
      */
     async loadRegistrationSnapshot(): Promise<MachineSnapshot | null> {
       const snapshot = await this.db.get('machineSnapshots', 'registration')

       if (!snapshot) return null

       // Check expiry (1 hour)
       if (Date.now() - snapshot.timestamp > 3600000) {
         await this.clearRegistrationSnapshot()
         return null
       }

       return snapshot
     }

     /**
      * Clear registration machine snapshot
      */
     async clearRegistrationSnapshot(): Promise<void> {
       await this.db.delete('machineSnapshots', 'registration')
     }
   }

   // Export singleton instance
   export const persistenceService = new PersistenceService()
   ```

**Deliverables:**
- [ ] registrationMachine created
- [ ] Actor functions created
- [ ] Persistence helpers created
- [ ] Exports configured

---

### Phase 2: Update Manager App (Day 2)

**Goal**: Use registration machine directly with useMachine

#### Tasks

1. **Refactor RegistrationPage**

   ```typescript
   // apps/manager/src/features/register/RegistrationPage.tsx

   import { useMachine } from '@xstate/react'
   import { registrationMachine } from '@ens-apps/transaction-manager'
   import { match } from 'ts-pattern'

   export function RegistrationPage({ name }: { name: string }) {
     const { rhinestoneAccount, accountAddress } = useRhinestoneAccount()

     // ✅ No persistence code! Machine handles it internally
     const [state, send] = useMachine(registrationMachine, {
       input: {
         rhinestoneAccount,
         accountAddress,
         chainId: sepolia.id
       }
     })

     const handleStart = (params: {
       duration: bigint
       token: 'USDC' | 'DAI'
       price: bigint
     }) => {
       send({
         type: 'START_REGISTRATION',
         name,
         duration: params.duration,
         token: params.token,
         price: params.price
       })
     }

     return match(state)
       .with({ value: 'idle' }, () => (
         <PricingStep name={name} onStart={handleStart} />
       ))
       .with({ value: 'preparingCommitment' }, () => (
         <div>Preparing commitment...</div>
       ))
       .with({ value: 'committingTransaction' }, () => (
         <CommitmentStep txId={state.context.commitmentTxId!} />
       ))
       .with({ value: 'waitingForCommitment' }, () => (
         <CommitmentStep txId={state.context.commitmentTxId!} />
       ))
       .with({ value: 'approvingToken' }, () => (
         <ApprovalStep txId={state.context.approvalTxId!} />
       ))
       .with({ value: 'waitingForApproval' }, () => (
         <ApprovalStep txId={state.context.approvalTxId!} />
       ))
       .with({ value: 'registeringDomain' }, () => (
         <RegistrationStep txId={state.context.registrationTxId!} />
       ))
       .with({ value: 'waitingForRegistration' }, () => (
         <RegistrationStep txId={state.context.registrationTxId!} />
       ))
       .with({ value: 'success' }, () => (
         <SuccessStep name={name} />
       ))
       .with({ value: 'error' }, () => (
         <ErrorStep
           error={state.context.error!}
           onRetry={() => send({ type: 'RETRY' })}
         />
       ))
       .exhaustive()
   }
   ```

2. **Delete old code**

   ```bash
   cd apps/manager/src/features/register
   rm -rf hooks/useRegistration.ts
   rm -rf machines/registrationMachine.ts
   rm -rf services/nameChainContractService.ts
   ```

**Deliverables:**
- [ ] Manager app using registrationMachine directly
- [ ] Old code deleted
- [ ] End-to-end testing complete

---

### Phase 3: Documentation & Cleanup (Day 3)

**Goal**: Document XState usage patterns

Create `packages/transaction-manager/docs/REGISTRATION.md`:

```markdown
# ENS Registration

## Usage

### With useMachine

\`\`\`typescript
import { useMachine } from '@xstate/react'
import { registrationMachine } from '@ens-apps/transaction-manager'

function RegistrationPage({ name }) {
  const [state, send] = useMachine(registrationMachine, {
    input: {
      rhinestoneAccount,
      accountAddress,
      chainId: sepolia.id
    }
  })

  const handleStart = () => {
    send({
      type: 'START_REGISTRATION',
      name,
      duration: 31536000n,
      token: 'USDC',
      price: 100n
    })
  }

  return <button onClick={handleStart}>Register</button>
}
\`\`\`

### Persistence

The machine **automatically persists and restores** via the `inspect` option:

\`\`\`typescript
import { useMachine } from '@xstate/react'
import { registrationMachine } from '@ens-apps/transaction-manager'

// ✅ Completely automatic - no persistence code needed
const [state, send] = useMachine(registrationMachine, {
  input: {
    rhinestoneAccount,
    accountAddress,
    chainId: sepolia.id
  }
})

// The machine automatically:
// 1. Loads saved state on mount (if exists)
// 2. Resumes from exact state (e.g., 'waitingForCommitment')
// 3. Saves state on every transition
// 4. Clears state on success/cancel
\`\`\`

**How it works internally:**

The machine uses XState's `inspect` option to persist snapshots to IndexedDB:

\`\`\`typescript
// packages/transaction-manager/src/machines/registration/registration.machine.ts

import { persistenceService } from '../../services/persistence.service'

export const registrationMachine = setup({
  // ... actors, actions, guards
}).createMachine({
  // ... states
}, {
  // Automatic persistence via inspect
  inspect: {
    next: (snapshot) => {
      // Auto-save to IndexedDB on every transition
      if (snapshot.status === 'active') {
        persistenceService.saveRegistrationSnapshot({
          context: snapshot.context,
          value: snapshot.value
        })
      }
    }
  }
})

// On module load, check IndexedDB for saved state
const savedSnapshot = await persistenceService.loadRegistrationSnapshot()

export const registrationMachine = savedSnapshot
  ? baseMachine.provide({
      snapshot: {
        value: savedSnapshot.state,
        context: savedSnapshot.context
      }
    })
  : baseMachine
\`\`\`

**Usage:** Apps just import the machine with restore built-in:
\`\`\`typescript
import { registrationMachine } from '@ens-apps/transaction-manager'

// It's already wrapped with restore logic from IndexedDB
const [state, send] = useMachine(registrationMachine, { input })
\`\`\`

### Events

- \`START_REGISTRATION\` - Begin registration flow
- \`RETRY\` - Retry after error
- \`CANCEL\` - Cancel and return to idle

### States

- \`idle\` - Waiting to start
- \`preparingCommitment\` - Generating commitment hash
- \`committingTransaction\` - Submitting commitment
- \`waitingForCommitment\` - Waiting for confirmation
- \`approvingToken\` - Approving token spend
- \`waitingForApproval\` - Waiting for approval confirmation
- \`registeringDomain\` - Submitting registration
- \`waitingForRegistration\` - Waiting for registration confirmation
- \`success\` - Registration complete
- \`error\` - Error occurred
\`\`\`

**Deliverables:**
- [ ] Documentation complete
- [ ] Examples added
- [ ] README updated

---

## Benefits

### For the Team

- ✅ **Learn XState**: Direct exposure to XState patterns
- ✅ **Less abstraction**: No "magic" custom hooks
- ✅ **Full control**: Access to all XState features
- ✅ **Better debugging**: XState Inspector works perfectly

### For the Codebase

- ✅ **Less code**: No custom hook layer
- ✅ **Simpler**: Fewer concepts to understand
- ✅ **More flexible**: Use XState however you need
- ✅ **Easier to maintain**: Standard XState patterns

### For New Team Members

- ✅ **Learn XState properly**: Not a custom abstraction
- ✅ **Transfer knowledge**: XState skills are portable
- ✅ **Clear documentation**: Standard XState docs apply

---

## Usage Patterns

### Pattern 1: Direct useMachine

```typescript
const [state, send] = useMachine(registrationMachine, { input })
```

### Pattern 2: Multiple Instances (if needed)

```typescript
// Each useMachine call creates a separate actor
function MultiRegistration({ names }) {
  return names.map(name => (
    <RegistrationFlow key={name} name={name} />
  ))
}

function RegistrationFlow({ name }) {
  const [state, send] = useMachine(registrationMachine, { input: { ... } })
  // Separate actor for each name!
}
```

### Pattern 3: Persistence (Automatic)

```typescript
// ✅ No persistence code needed - machine handles it internally
const [state, send] = useMachine(registrationMachine, { input: { ... } })

// The machine automatically:
// - Restores state from localStorage on mount
// - Saves state on every transition
// - Clears state on success/cancel
```

---

## Success Criteria

- [ ] registrationMachine in transaction-manager
- [ ] Manager app uses useMachine directly
- [ ] Zero custom hooks
- [ ] IndexedDB persistence working (auto-save/restore)
- [ ] XState Inspector working
- [ ] Old manager code deleted
- [ ] Registration flow working end-to-end

## Future Work

**Portal App Integration:**
- Portal can use the same `registrationMachine` when needed
- Same pattern: `import { registrationMachine }` + `useMachine`
- No additional work needed in transaction-manager package

---

**Version**: 3.0 (No Custom Hooks)
**Status**: Ready for Implementation
**Last Updated**: 2025-11-07
