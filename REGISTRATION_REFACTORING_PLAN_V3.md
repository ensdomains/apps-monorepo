# ENS Registration Refactoring Plan v3 (Simplified - No Custom Hooks)

## Executive Summary

Refactor ENS registration using XState machines in `@ens-apps/transaction-manager`. **No custom hooks** - team uses XState directly via `useMachine` and `useSelector`.

**Current State**: Manager uses React useState + useEffect
**Target State**: XState machines, no abstraction layers
**Team Context**: Internal monorepo, everyone learns XState
**Estimated Effort**: 3-4 days

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
│   ├── transaction.machine.ts          ← Generic tx lifecycle
│   ├── registration.machine.ts         ← ENS registration
│   ├── renewal.machine.ts              ← ENS renewal
│   └── transfer.machine.ts             ← ENS transfer
│
├── actors/
│   ├── transaction/
│   │   ├── eoa-submission.actor.ts
│   │   └── rhinestone-submission.actor.ts
│   ├── registration/
│   │   ├── commitment.actor.ts
│   │   ├── approval.actor.ts
│   │   └── registration.actor.ts
│   └── renewal/
│       └── renewal.actor.ts
│
├── services/
│   └── transactionManager.ts           ← Manages individual transactions
│
├── helpers/
│   ├── registration.helpers.ts
│   ├── renewal.helpers.ts
│   ├── persistence.helpers.ts
│   └── rhinestone.helpers.ts
│
└── types/
    ├── transaction.types.ts
    ├── registration.types.ts
    └── signer.types.ts
```

---

## Package Exports

```typescript
// packages/transaction-manager/src/index.ts

// === Machines (use with useMachine) ===
export { transactionMachine } from './machines/transaction.machine'
export { registrationMachine } from './machines/registration.machine'
export { renewalMachine } from './machines/renewal.machine'
export { transferMachine } from './machines/transfer.machine'

// === Services ===
export { transactionManager } from './services/transactionManager'

// === Helpers ===
export { getENSPrice } from './helpers/pricing.helpers'
export { initializeRhinestoneAccount } from './helpers/rhinestone.helpers'
export {
  saveRegistrationState,
  loadRegistrationState,
  clearRegistrationState
} from './helpers/persistence.helpers'

// === Types ===
export type {
  RegistrationParams,
  RenewalParams,
  Signer,
  TransactionIntent
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

       saveState: ({ context }) => {
         saveRegistrationState(context)
       }
     }

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
         entry: ['logTransition', 'saveState'],
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
         entry: ['logTransition', 'saveState'],
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
         entry: ['logTransition', 'saveState'],
         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({ txId: context.commitmentTxId! }),
           onDone: 'approvingToken',
           onError: 'error'
         }
       },

       approvingToken: {
         entry: ['logTransition', 'saveState'],
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
         entry: ['logTransition', 'saveState'],
         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({ txId: context.approvalTxId! }),
           onDone: 'registeringDomain',
           onError: 'error'
         }
       },

       registeringDomain: {
         entry: ['logTransition', 'saveState'],
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
         entry: ['logTransition', 'saveState'],
         invoke: {
           src: 'pollTransactionStatus',
           input: ({ context }) => ({ txId: context.registrationTxId! }),
           onDone: 'success',
           onError: 'error'
         }
       },

       success: {
         type: 'final',
         entry: ['logTransition', ({ context }) => {
           clearRegistrationState(context.name)
         }]
       },

       error: {
         entry: ['logTransition', 'saveState'],
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

3. **Create persistence helpers**

   ```typescript
   // packages/transaction-manager/src/helpers/persistence.helpers.ts

   const STORAGE_KEY = 'ens-registration-state'
   const EXPIRY_MS = 3600000 // 1 hour

   export function saveRegistrationState(context: any) {
     localStorage.setItem(STORAGE_KEY, JSON.stringify({
       context,
       timestamp: Date.now()
     }))
   }

   export function loadRegistrationState() {
     const saved = localStorage.getItem(STORAGE_KEY)
     if (!saved) return null

     const parsed = JSON.parse(saved)
     if (Date.now() - parsed.timestamp > EXPIRY_MS) {
       localStorage.removeItem(STORAGE_KEY)
       return null
     }

     return parsed.context
   }

   export function clearRegistrationState(name: string) {
     localStorage.removeItem(STORAGE_KEY)
     console.log(`[Registration] Cleared state for ${name}`)
   }
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
   import { fromSnapshot } from 'xstate'
   import {
     registrationMachine,
     loadRegistrationState,
     clearRegistrationState
   } from '@ens-apps/transaction-manager'
   import { match } from 'ts-pattern'

   export function RegistrationPage({ name }: { name: string }) {
     const { rhinestoneAccount, accountAddress } = useRhinestoneAccount()

     // Load saved state if exists
     const savedContext = loadRegistrationState()
     const initialSnapshot = savedContext
       ? fromSnapshot({ value: 'preparingCommitment', context: savedContext })
       : undefined

     const [state, send] = useMachine(registrationMachine, {
       snapshot: initialSnapshot,
       input: {
         rhinestoneAccount,
         accountAddress,
         chainId: sepolia.id
       }
     })

     // Auto-clear on unmount if successful
     useEffect(() => {
       return () => {
         if (state.matches('success')) {
           clearRegistrationState(name)
         }
       }
     }, [state, name])

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

### Phase 3: Update Portal App (Day 3)

**Goal**: Portal uses same machine

```typescript
// apps/portal/src/features/register/RegistrationPage.tsx

import { useMachine } from '@xstate/react'
import { registrationMachine } from '@ens-apps/transaction-manager'

// Same pattern as manager!
export function RegistrationPage({ name }: { name: string }) {
  const [state, send] = useMachine(registrationMachine, { input: { ... } })
  return <div>...</div>
}
```

**Deliverables:**
- [ ] Portal registration working
- [ ] Both apps tested

---

### Phase 4: Documentation (Day 4)

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

The machine automatically persists state to localStorage. To restore:

\`\`\`typescript
import { fromSnapshot } from 'xstate'
import { loadRegistrationState } from '@ens-apps/transaction-manager'

const savedContext = loadRegistrationState()
const initialSnapshot = savedContext
  ? fromSnapshot({ value: 'preparingCommitment', context: savedContext })
  : undefined

const [state, send] = useMachine(registrationMachine, {
  snapshot: initialSnapshot
})
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

### Pattern 3: Persistence

```typescript
const savedContext = loadRegistrationState()
const initialSnapshot = savedContext ? fromSnapshot({ ... }) : undefined
const [state, send] = useMachine(registrationMachine, { snapshot: initialSnapshot })
```

---

## Testing Strategy

### Unit Tests (Actors)

```typescript
describe('generateCommitmentActor', () => {
  it('generates valid commitment', async () => {
    const result = await generateCommitmentActor({
      name: 'leon',
      owner: '0x123...'
    })
    expect(result.isOk()).toBe(true)
  })
})
```

### Machine Tests

```typescript
describe('registrationMachine', () => {
  it('transitions through states', () => {
    const actor = createActor(registrationMachine)
    actor.start()

    actor.send({ type: 'START_REGISTRATION', ... })
    expect(actor.getSnapshot().value).toBe('preparingCommitment')
  })
})
```

### Integration Tests

```typescript
describe('RegistrationPage', () => {
  it('completes registration', async () => {
    render(<RegistrationPage name="test" />)
    // ... test full flow
  })
})
```

---

## Success Criteria

- [ ] registrationMachine in transaction-manager
- [ ] Both apps use useMachine directly
- [ ] Zero custom hooks
- [ ] Complete documentation
- [ ] All tests passing
- [ ] XState Inspector working

---

**Version**: 3.0 (No Custom Hooks)
**Status**: Ready for Implementation
**Last Updated**: 2025-11-07
