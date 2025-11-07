# ENS Manager Registration Refactoring Plan

## Executive Summary

Refactor the ENS Manager registration flow to use the `@ens-apps/transaction-manager` package, eliminating the current useEffect-based approach and aligning with the project's XState-first architecture.

**Current State**: Registration uses React useState + useEffect for flow control
**Target State**: Registration uses transaction-manager with proper XState machines
**Estimated Effort**: 3-5 days
**Risk Level**: Medium (touches critical user flow)

---

## Table of Contents

1. [Current Architecture Problems](#current-architecture-problems)
2. [Refactoring Goals](#refactoring-goals)
3. [Proposed Architecture](#proposed-architecture)
4. [Implementation Plan](#implementation-plan)
5. [File-by-File Changes](#file-by-file-changes)
6. [Testing Strategy](#testing-strategy)
7. [Rollout Plan](#rollout-plan)
8. [Rollback Strategy](#rollback-strategy)

---

## Current Architecture Problems

### 1. **Not Using XState Properly**

**Problem**: The `registrationMachine.ts` exists but is completely unused. Instead, the flow uses:
- React `useState` for all state
- Multiple `useEffect` blocks that trigger on step changes
- Manual state transitions using `setStep()`

**File**: `/src/features/register/hooks/useRegistration.ts`

```typescript
// Current anti-pattern
const [step, setStep] = useState(RegistrationStep.PRICING)

useEffect(() => {
  if (step === RegistrationStep.COMMITTING) {
    // Business logic here...
    setStep(RegistrationStep.APPROVING)
  }
}, [step, ...])
```

**Why this is bad**:
- Violates CLAUDE.md principle: "All critical application state should be managed by state machines"
- No audit trail of state transitions
- Difficult to debug (no state visualization)
- Business logic mixed with side effects
- Impossible to test without React

### 2. **Complex Transaction Flow Not Standardized**

**Problem**: Registration requires 3 transactions in sequence:
1. Commitment transaction
2. Token approval transaction
3. Registration transaction

Each is handled with custom logic in useEffect blocks.

**Why this is bad**:
- No retry logic
- No automatic recovery from failures
- Duplicate transaction handling code
- Error handling is inconsistent

### 3. **Business Logic in Components/Hooks**

**Problem**: Transaction logic lives in `useRegistration` hook and `nameChainContractService.ts`.

**File**: `/src/features/register/services/nameChainContractService.ts`

```typescript
// Service class with hidden state
class NameChainContractService {
  private publicClient: PublicClient
  private rhinestoneAccount: RhinestoneAccount | null

  async commitToRegistration(...) { ... }
  async approveTokenForRegistration(...) { ... }
  async registerDomain(...) { ... }
}
```

**Why this is bad**:
- Violates CLAUDE.md principle: "Actors over Services"
- Stateful service class holds dependencies
- Can't test without instantiating service
- Not co-located with usage

### 4. **No Explicit Logging or Audit Trail**

**Problem**: State changes are invisible. No logging of:
- When commitment starts/completes
- Why approval was triggered
- Registration success/failure

**Why this is bad**:
- Impossible to debug production issues
- No visibility into user journey
- Can't track where users drop off

### 5. **useEffect Blocks Not Extracted**

**Problem**: Direct violation of CLAUDE.md: "NO 'NAKED' useEffect BLOCKS IN COMPONENTS"

**File**: `/src/features/register/hooks/useRegistration.ts`

```typescript
// Multiple naked useEffect blocks
useEffect(() => { ... }, [step, ...])
useEffect(() => { ... }, [step, ...])
useEffect(() => { ... }, [commitment, ...])
```

**Why this is bad**:
- Hard to name/document what each effect does
- Can't reuse logic
- Can't test independently
- Violates architecture guidelines

---

## Refactoring Goals

### Primary Goals

1. **Use transaction-manager package** for all transaction orchestration
2. **Eliminate useEffect-based flow control** in favor of XState machines
3. **Extract business logic to actors** (pure functions)
4. **Add explicit audit trail** for all critical state changes
5. **Implement proper error recovery** (retry, fallback)

### Secondary Goals

6. **Simplify component logic** - components only render, machines handle logic
7. **Co-locate related code** - follow CLAUDE.md co-location principles
8. **Type-safe transaction handling** - leverage neverthrow throughout
9. **Improve testability** - test actors and machines independently
10. **Add state visualization** - enable XState Inspector for debugging

### Success Criteria

- [ ] Zero useEffect blocks in registration components
- [ ] All transactions go through transaction-manager
- [ ] Complete audit trail of all state transitions
- [ ] Registration flow visualizable in XState Inspector
- [ ] All business logic testable without React
- [ ] Error states have retry mechanisms
- [ ] Code follows CLAUDE.md principles 100%

---

## Proposed Architecture

### High-Level Flow

```
User clicks "Register"
  ↓
Start registrationOrchestrationMachine
  ↓
├─→ State: collectingPaymentInfo
│   - User selects token (USDC/DAI)
│   - User confirms duration
│   ↓ (user confirms)
│
├─→ State: preparingCommitment
│   - Actor: generateCommitmentActor
│   - Generates commitment hash + secret
│   ↓ (commitment ready)
│
├─→ State: committingTransaction
│   - Uses transaction-manager to submit commitment
│   - transactionManager.startTransaction(commitmentIntent, signer)
│   ↓ (commitment confirmed)
│
├─→ State: approvingToken
│   - Uses transaction-manager to submit approval
│   - transactionManager.startTransaction(approvalIntent, signer)
│   ↓ (approval confirmed)
│
├─→ State: registeringDomain
│   - Uses transaction-manager to submit registration
│   - transactionManager.startTransaction(registrationIntent, signer)
│   ↓ (registration confirmed)
│
└─→ State: success
    - Display success UI
    - Optionally prompt for auto-renewal
```

### Machine Hierarchy

```
registrationOrchestrationMachine
  ├─ spawns → transactionMachine (commitment)
  ├─ spawns → transactionMachine (approval)
  └─ spawns → transactionMachine (registration)
```

**Why this works**:
- **registrationOrchestrationMachine** coordinates the overall flow
- **transaction-manager** handles each individual transaction
- Clear separation of concerns

### Component Structure

```
RegistrationPage.tsx (orchestrator)
  ↓
useRegistrationOrchestration() (XState hook)
  ↓
├─ PricingStep.tsx (when state.matches('collectingPaymentInfo'))
├─ CommitmentInProgressStep.tsx (when state.matches('committingTransaction'))
├─ ApprovalInProgressStep.tsx (when state.matches('approvingToken'))
├─ RegistrationInProgressStep.tsx (when state.matches('registeringDomain'))
└─ SuccessStep.tsx (when state.matches('success'))
```

### Actor Functions (Pure, Testable)

```typescript
// actors/commitment.actors.ts

export async function generateCommitmentActor(input: {
  name: string
  owner: Address
}): Promise<Result<CommitmentData, CommitmentError>> {
  // Pure function - generates commitment hash + secret
}

export async function prepareCommitmentTransactionActor(input: {
  commitment: CommitmentData
  rhinestoneAccount: RhinestoneAccount
}): Promise<Result<TransactionRequest, PreparationError>> {
  // Pure function - prepares unsigned transaction
}
```

**Benefits**:
- Testable without React
- No hidden state
- All dependencies explicit
- Type-safe with neverthrow

---

## Implementation Plan

### Phase 1: Setup & Preparation (Day 1)

**Goals**: Set up infrastructure without breaking existing code

#### Tasks

1. **Install transaction-manager dependency** (if not already)
   ```bash
   cd apps/manager
   pnpm add @ens-apps/transaction-manager
   ```

2. **Add TransactionManagerProvider to app root**
   ```typescript
   // src/App.tsx
   import { TransactionManagerProvider } from '@ens-apps/transaction-manager'

   <TransactionManagerProvider publicClient={publicClient}>
     <YourExistingApp />
   </TransactionManagerProvider>
   ```

3. **Create new feature directory structure**
   ```
   src/features/register-v2/  (new implementation alongside old)
   ├── machines/
   │   └── registrationOrchestration.machine.ts
   ├── actors/
   │   ├── commitment.actors.ts
   │   └── registration.actors.ts
   ├── hooks/
   │   └── useRegistrationOrchestration.ts
   ├── components/
   │   ├── PricingStep.tsx
   │   ├── CommitmentInProgressStep.tsx
   │   ├── ApprovalInProgressStep.tsx
   │   ├── RegistrationInProgressStep.tsx
   │   └── SuccessStep.tsx
   └── pages/
       └── RegistrationPageV2.tsx
   ```

4. **Set up feature flag**
   ```typescript
   // src/config/features.ts
   export const FEATURES = {
     USE_NEW_REGISTRATION_FLOW: import.meta.env.VITE_NEW_REGISTRATION === 'true'
   }
   ```

**Deliverables**:
- [ ] Feature flag configured
- [ ] New directory structure created
- [ ] TransactionManagerProvider added
- [ ] No changes to existing registration flow

---

### Phase 2: Build Registration Orchestration Machine (Day 2)

**Goals**: Create the core state machine for registration flow

#### Tasks

1. **Define machine states and events**

   ```typescript
   // machines/registrationOrchestration.machine.ts

   import { setup, assign } from 'xstate'
   import { addAuditEntry } from '@ens-apps/transaction-manager'

   type RegistrationContext = {
     // User input
     name: string
     duration: bigint
     selectedToken: 'USDC' | 'DAI'
     tokenPrice: bigint

     // Generated data
     commitment?: CommitmentData
     secret?: string

     // Transaction IDs (from transaction-manager)
     commitmentTxId?: string
     approvalTxId?: string
     registrationTxId?: string

     // Account
     rhinestoneAccount?: RhinestoneAccount
     accountAddress?: Address

     // Error state
     error?: Error
   }

   type RegistrationEvent =
     | { type: 'START_REGISTRATION'; name: string; duration: bigint; token: 'USDC' | 'DAI'; price: bigint }
     | { type: 'COMMITMENT_GENERATED'; commitment: CommitmentData; secret: string }
     | { type: 'COMMITMENT_TX_SUBMITTED'; txId: string }
     | { type: 'COMMITMENT_CONFIRMED' }
     | { type: 'APPROVAL_TX_SUBMITTED'; txId: string }
     | { type: 'APPROVAL_CONFIRMED' }
     | { type: 'REGISTRATION_TX_SUBMITTED'; txId: string }
     | { type: 'REGISTRATION_CONFIRMED' }
     | { type: 'RETRY' }
     | { type: 'CANCEL' }

   export const registrationOrchestrationMachine = setup({
     types: {
       context: {} as RegistrationContext,
       events: {} as RegistrationEvent
     },

     actors: {
       generateCommitment: fromResultAsync(generateCommitmentActor),
       submitCommitmentTransaction: fromResultAsync(submitCommitmentTransactionActor),
       submitApprovalTransaction: fromResultAsync(submitApprovalTransactionActor),
       submitRegistrationTransaction: fromResultAsync(submitRegistrationTransactionActor)
     },

     actions: {
       recordTransition: () => {
         addAuditEntry('info', 'Registration state transition', {})
       },

       logCommitmentStart: ({ context }) => {
         addAuditEntry('info', 'Starting commitment generation', {
           name: context.name,
           duration: context.duration.toString()
         })
       },

       storeCommitment: assign({
         commitment: ({ event }) => event.output.commitment,
         secret: ({ event }) => event.output.secret
       }),

       storeCommitmentTxId: assign({
         commitmentTxId: ({ event }) => event.output
       })
     }

   }).createMachine({
     id: 'registrationOrchestration',

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
         entry: ['recordTransition', 'logCommitmentStart'],

         invoke: {
           src: 'generateCommitment',
           input: ({ context }) => ({
             name: context.name,
             owner: context.accountAddress!
           }),
           onDone: {
             target: 'committingTransaction',
             actions: ['storeCommitment']
           },
           onError: {
             target: 'error',
             actions: assign({
               error: ({ event }) => event.error
             })
           }
         }
       },

       committingTransaction: {
         entry: ['recordTransition'],

         invoke: {
           src: 'submitCommitmentTransaction',
           input: ({ context }) => ({
             commitment: context.commitment!,
             rhinestoneAccount: context.rhinestoneAccount!,
             tokenPrice: context.tokenPrice,
             selectedToken: context.selectedToken
           }),
           onDone: {
             target: 'waitingForCommitment',
             actions: ['storeCommitmentTxId']
           },
           onError: {
             target: 'error'
           }
         }
       },

       waitingForCommitment: {
         // Poll transaction-manager for commitment status
         // When confirmed, move to approvingToken
       },

       approvingToken: {
         entry: ['recordTransition'],

         invoke: {
           src: 'submitApprovalTransaction',
           onDone: {
             target: 'waitingForApproval'
           },
           onError: {
             target: 'error'
           }
         }
       },

       waitingForApproval: {
         // Poll transaction-manager for approval status
       },

       registeringDomain: {
         entry: ['recordTransition'],

         invoke: {
           src: 'submitRegistrationTransaction',
           onDone: {
             target: 'waitingForRegistration'
           },
           onError: {
             target: 'error'
           }
         }
       },

       waitingForRegistration: {
         // Poll transaction-manager for registration status
       },

       success: {
         type: 'final',
         entry: ['recordTransition']
       },

       error: {
         entry: ['recordTransition'],
         on: {
           RETRY: {
             target: 'preparingCommitment'
           }
         }
       }
     }
   })
   ```

2. **Create actor functions**

   ```typescript
   // actors/commitment.actors.ts

   import { ResultAsync, okAsync, errAsync } from 'neverthrow'

   export async function generateCommitmentActor(input: {
     name: string
     owner: Address
   }): Promise<Result<CommitmentData, Error>> {
     // Pure function - generates commitment hash + secret
     const secret = generateRandomBytes(32)
     const commitment = keccak256(
       encodePacked(['string', 'address', 'bytes32'], [input.name, input.owner, secret])
     )

     return ok({
       commitment,
       secret: toHex(secret)
     })
   }

   export async function submitCommitmentTransactionActor(input: {
     commitment: CommitmentData
     rhinestoneAccount: RhinestoneAccount
     tokenPrice: bigint
     selectedToken: 'USDC' | 'DAI'
   }): Promise<Result<string, Error>> {
     // Use transaction-manager to submit
     const signer: Signer = {
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

     const txId = transactionManager.startTransaction(intent, signer)

     return ok(txId)
   }
   ```

**Deliverables**:
- [ ] registrationOrchestration.machine.ts created
- [ ] Actor functions created and tested
- [ ] Machine visualizable in XState Inspector
- [ ] All state transitions logged

---

### Phase 2.5: Add Persistence Layer (Day 2 - Afternoon)

**Goals**: Enable recovery from page refresh

#### Tasks

1. **Create persistence helpers**

   ```typescript
   // helpers/registration-persistence.ts

   export function saveRegistrationState(snapshot: any) {
     localStorage.setItem('registration-state', JSON.stringify({
       value: snapshot.value,
       context: {
         name: snapshot.context.name,
         duration: snapshot.context.duration,
         selectedToken: snapshot.context.selectedToken,
         tokenPrice: snapshot.context.tokenPrice,
         commitment: snapshot.context.commitment,
         secret: snapshot.context.secret,
         commitmentTxId: snapshot.context.commitmentTxId,
         approvalTxId: snapshot.context.approvalTxId,
         registrationTxId: snapshot.context.registrationTxId
       },
       timestamp: Date.now()
     }))
   }

   export function loadRegistrationState() {
     const saved = localStorage.getItem('registration-state')
     if (!saved) return null

     const parsed = JSON.parse(saved)

     // Expire after 1 hour
     if (Date.now() - parsed.timestamp > 3600000) {
       localStorage.removeItem('registration-state')
       return null
     }

     return parsed
   }

   export function clearRegistrationState() {
     localStorage.removeItem('registration-state')
   }
   ```

2. **Add metadata to transaction manager calls**

   When starting transactions, include metadata for recovery:

   ```typescript
   // actors/commitment.actors.ts

   export async function submitCommitmentTransactionActor(input: {
     commitment: CommitmentData
     rhinestoneAccount: RhinestoneAccount
     name: string
     duration: bigint
   }): Promise<Result<string, Error>> {
     const signer: Signer = {
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

     // Add metadata for recovery
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
   ```

**Deliverables**:
- [ ] Persistence helpers created
- [ ] Metadata added to all transaction starts
- [ ] State recovery tested with browser refresh

---

### Phase 3: Build React Integration (Day 3)

**Goals**: Create React hooks and components that use the machine

#### Tasks

1. **Create useRegistrationOrchestration hook with persistence**

   ```typescript
   // hooks/useRegistrationOrchestration.ts

   import { useMachine } from '@xstate/react'
   import { fromSnapshot } from 'xstate'
   import { useEffect } from 'react'
   import { useRecoveredTransactions } from '@ens-apps/transaction-manager'
   import { registrationOrchestrationMachine } from '../machines/registrationOrchestration.machine'
   import {
     loadRegistrationState,
     saveRegistrationState,
     clearRegistrationState
   } from '../helpers/registration-persistence'

   export function useRegistrationOrchestration() {
     const recoveredTxs = useRecoveredTransactions()

     // 1. Try to restore saved registration state
     const savedState = loadRegistrationState()

     // 2. Cross-reference with recovered transactions
     const hasRecoveredTxs = recoveredTxs.some(tx =>
       tx.metadata?.flowType === 'ens-registration' &&
       (tx.id === savedState?.context?.commitmentTxId ||
        tx.id === savedState?.context?.approvalTxId ||
        tx.id === savedState?.context?.registrationTxId)
     )

     // 3. Only restore if we have both saved state AND active transactions
     const initialSnapshot = (savedState && hasRecoveredTxs)
       ? fromSnapshot(savedState)
       : undefined

     const [state, send] = useMachine(registrationOrchestrationMachine, {
       snapshot: initialSnapshot,
       input: {
         rhinestoneAccount,
         accountAddress
       }
     })

     // 4. Auto-save state changes
     useEffect(() => {
       if (!state.matches('idle')) {
         saveRegistrationState(state)
       }
     }, [state])

     // 5. Clear on completion or cancel
     useEffect(() => {
       if (state.matches('success') || state.matches('cancelled')) {
         clearRegistrationState()
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

       // Selectors for component convenience
       currentStep: state.value,
       isRecovered: !!initialSnapshot, // Show recovery banner
       isLoading: state.matches('preparingCommitment') ||
                  state.matches('committingTransaction') ||
                  state.matches('approvingToken') ||
                  state.matches('registeringDomain'),
       error: state.context.error,
       commitmentTxId: state.context.commitmentTxId,
       approvalTxId: state.context.approvalTxId,
       registrationTxId: state.context.registrationTxId
     }
   }
   ```

2. **Create step components**

   ```typescript
   // components/PricingStep.tsx

   import { match } from 'ts-pattern'

   export function PricingStep({
     onStartRegistration
   }: {
     onStartRegistration: (params: PaymentParams) => void
   }) {
     const [selectedToken, setSelectedToken] = useState<'USDC' | 'DAI'>('USDC')
     const [duration, setDuration] = useState('1')
     const [renewalPrice, setRenewalPrice] = useState<bigint | null>(null)

     const publicClient = usePublicClient()
     const { stablecoinBalances } = useRhinestoneAccount()

     // Extract useEffect to custom hook (per CLAUDE.md)
     useRenewalPrice({
       name: 'leon',
       duration,
       publicClient,
       onPriceChange: setRenewalPrice,
       onLoadingChange: (loading) => {}
     })

     const handleConfirm = () => {
       onStartRegistration({
         name: 'leon',
         duration: BigInt(duration) * YEAR_IN_SECONDS,
         token: selectedToken,
         price: renewalPrice!
       })
     }

     return (
       <div>
         {/* Pricing UI */}
         {match({ renewalPrice })
           .with({ renewalPrice: P.not(P.nullish) }, ({ renewalPrice }) => (
             <div>Price: {formatEther(renewalPrice!)} ETH</div>
           ))
           .otherwise(() => <div>Loading price...</div>)}

         <button onClick={handleConfirm}>Confirm Payment</button>
       </div>
     )
   }

   // Custom hook extracted from useEffect (per CLAUDE.md)
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
         if (!cancelled) onLoadingChange(true)

         const result = await getENSRenewalPrice(
           publicClient,
           name,
           BigInt(duration) * YEAR_IN_SECONDS
         )

         if (!cancelled) {
           result.match(
             (price) => onPriceChange(price),
             (error) => console.error('Failed to get price:', error)
           )
           onLoadingChange(false)
         }
       }

       fetchPrice()
       return () => { cancelled = true }
     }, [name, duration, publicClient, onPriceChange, onLoadingChange])
   }
   ```

   ```typescript
   // components/CommitmentInProgressStep.tsx

   import { useTransaction } from '@ens-apps/transaction-manager'
   import { useSelector } from '@xstate/react'

   export function CommitmentInProgressStep({
     txId
   }: {
     txId: string
   }) {
     const txActor = useTransaction(txId)

     const txState = useSelector(txActor, (snapshot) =>
       snapshot ? snapshot.value : null
     )

     const txHash = useSelector(txActor, (snapshot) =>
       snapshot?.context.hash
     )

     return (
       <div>
         <h2>Committing to Registration</h2>
         <p>Status: {txState}</p>
         {txHash && (
           <a href={`https://sepolia.etherscan.io/tx/${txHash}`}>
             View on Etherscan
           </a>
         )}
       </div>
     )
   }
   ```

3. **Create orchestrator page**

   ```typescript
   // pages/RegistrationPageV2.tsx

   import { match } from 'ts-pattern'
   import { useRegistrationOrchestration } from '../hooks/useRegistrationOrchestration'

   export function RegistrationPageV2() {
     const {
       state,
       startRegistration,
       commitmentTxId,
       approvalTxId,
       registrationTxId,
       error
     } = useRegistrationOrchestration()

     return (
       <div>
         {match(state)
           .with({ value: 'idle' }, () => (
             <PricingStep onStartRegistration={startRegistration} />
           ))
           .with({ value: 'preparingCommitment' }, () => (
             <div>Preparing commitment...</div>
           ))
           .with({ value: 'committingTransaction' }, () => (
             <CommitmentInProgressStep txId={commitmentTxId!} />
           ))
           .with({ value: 'waitingForCommitment' }, () => (
             <CommitmentInProgressStep txId={commitmentTxId!} />
           ))
           .with({ value: 'approvingToken' }, () => (
             <ApprovalInProgressStep txId={approvalTxId!} />
           ))
           .with({ value: 'registeringDomain' }, () => (
             <RegistrationInProgressStep txId={registrationTxId!} />
           ))
           .with({ value: 'success' }, () => (
             <SuccessStep />
           ))
           .with({ value: 'error' }, () => (
             <ErrorStep error={error!} onRetry={() => send({ type: 'RETRY' })} />
           ))
           .exhaustive()}
       </div>
     )
   }
   ```

**Deliverables**:
- [ ] useRegistrationOrchestration hook created
- [ ] All step components created
- [ ] RegistrationPageV2 orchestrator created
- [ ] All useEffect blocks extracted to named hooks
- [ ] ts-pattern used for conditional rendering

---

### Phase 4: Integration & Testing (Day 4)

**Goals**: Wire up the new flow and test thoroughly

#### Tasks

1. **Add route for new registration page**

   ```typescript
   // src/routes/register-v2.tsx

   import { RegistrationPageV2 } from '@/features/register-v2/pages/RegistrationPageV2'

   export const Route = createFileRoute('/register-v2')({
     component: RegistrationPageV2,
     validateSearch: (search) => ({
       name: search.name as string
     })
   })
   ```

2. **Update feature flag routing**

   ```typescript
   // src/routes/register.tsx

   import { FEATURES } from '@/config/features'
   import { RegistrationPage } from '@/features/register/pages/RegistrationPage'
   import { RegistrationPageV2 } from '@/features/register-v2/pages/RegistrationPageV2'

   export const Route = createFileRoute('/register')({
     component: FEATURES.USE_NEW_REGISTRATION_FLOW
       ? RegistrationPageV2
       : RegistrationPage,
     validateSearch: (search) => ({
       name: search.name as string
     })
   })
   ```

3. **Test with feature flag**

   ```bash
   # Test new flow
   VITE_NEW_REGISTRATION=true pnpm dev:manager

   # Test old flow
   VITE_NEW_REGISTRATION=false pnpm dev:manager
   ```

4. **Manual testing checklist**

   - [ ] Happy path: Complete registration successfully
   - [ ] Error handling: Reject commitment transaction
   - [ ] Error handling: Reject approval transaction
   - [ ] Error handling: Reject registration transaction
   - [ ] Retry: Retry after commitment failure
   - [ ] Retry: Retry after approval failure
   - [ ] Cancel: Cancel during commitment
   - [ ] State persistence: Refresh page during transaction
   - [ ] XState Inspector: Visualize state machine
   - [ ] Audit trail: Verify all transitions logged

5. **Write unit tests**

   ```typescript
   // actors/commitment.actors.test.ts

   import { describe, it, expect } from 'vitest'
   import { generateCommitmentActor } from './commitment.actors'

   describe('generateCommitmentActor', () => {
     it('should generate valid commitment', async () => {
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

**Deliverables**:
- [ ] Feature flag routing working
- [ ] Manual testing completed
- [ ] Unit tests for actors written
- [ ] Integration tests for machine written
- [ ] XState Inspector tested

---

### Phase 5: Cleanup & Documentation (Day 5)

**Goals**: Remove old code, update documentation

#### Tasks

1. **Remove old registration code** (once new flow is verified)

   ```bash
   # Delete old files
   rm -rf src/features/register/hooks/useRegistration.ts
   rm -rf src/features/register/machines/registrationMachine.ts
   rm -rf src/features/register/services/nameChainContractService.ts

   # Rename register-v2 to register
   mv src/features/register src/features/register-old-backup
   mv src/features/register-v2 src/features/register
   ```

2. **Update documentation**

   - [ ] Update README with new architecture
   - [ ] Document new registration flow
   - [ ] Update CLAUDE.md if needed

3. **Remove feature flag**

   ```typescript
   // src/routes/register.tsx

   // Remove conditional, always use new flow
   export const Route = createFileRoute('/register')({
     component: RegistrationPage,  // Now points to refactored version
     validateSearch: (search) => ({
       name: search.name as string
     })
   })
   ```

4. **Code review checklist**

   - [ ] Zero naked useEffect blocks
   - [ ] All business logic in actors
   - [ ] All state transitions logged
   - [ ] ts-pattern used for conditionals
   - [ ] Custom hooks for all effects
   - [ ] Co-location principles followed
   - [ ] neverthrow used throughout
   - [ ] XState machine is primary state manager

**Deliverables**:
- [ ] Old code removed (backed up)
- [ ] Documentation updated
- [ ] Feature flag removed
- [ ] Code review passed

---

## File-by-File Changes

### New Files to Create

```
src/features/register-v2/
├── machines/
│   └── registrationOrchestration.machine.ts          [NEW]
├── actors/
│   ├── commitment.actors.ts                           [NEW]
│   ├── approval.actors.ts                             [NEW]
│   └── registration.actors.ts                         [NEW]
├── hooks/
│   ├── useRegistrationOrchestration.ts                [NEW]
│   ├── useRenewalPrice.ts                             [NEW]
│   ├── useStablecoinBalance.ts                        [NEW]
│   └── useRhinestoneAccount.ts                        [MOVE from lib/rhinestone]
├── components/
│   ├── PricingStep.tsx                                [REFACTOR from Pricing.tsx]
│   ├── CommitmentInProgressStep.tsx                   [REFACTOR from PaymentInProgress.tsx]
│   ├── ApprovalInProgressStep.tsx                     [REFACTOR from ApprovalInProgress.tsx]
│   ├── RegistrationInProgressStep.tsx                 [REFACTOR from RegistrationInProgress.tsx]
│   ├── SuccessStep.tsx                                [REFACTOR from RegistrationSuccess.tsx]
│   └── ErrorStep.tsx                                  [REFACTOR from CommitmentError.tsx]
├── pages/
│   └── RegistrationPageV2.tsx                         [REFACTOR from RegistrationPage.tsx]
└── types/
    └── registration.types.ts                          [NEW]
```

### Files to Modify

```
src/
├── App.tsx                                            [ADD TransactionManagerProvider]
├── routes/
│   └── register.tsx                                   [ADD feature flag routing]
└── config/
    └── features.ts                                    [ADD VITE_NEW_REGISTRATION flag]
```

### Files to Delete (after verification)

```
src/features/register/
├── hooks/
│   └── useRegistration.ts                             [DELETE]
├── machines/
│   └── registrationMachine.ts                         [DELETE - unused]
└── services/
    └── nameChainContractService.ts                    [DELETE - replaced by actors]
```

---

## Testing Strategy

### Unit Tests

**Test actors independently** (pure functions):

```typescript
// actors/commitment.actors.test.ts

describe('generateCommitmentActor', () => {
  it('generates valid commitment', async () => {
    const result = await generateCommitmentActor({ name: 'leon', owner: '0x123' })
    expect(result.isOk()).toBe(true)
  })

  it('returns deterministic commitment for same inputs', async () => {
    const result1 = await generateCommitmentActor({ name: 'leon', owner: '0x123' })
    const result2 = await generateCommitmentActor({ name: 'leon', owner: '0x123' })
    // Note: Secret is random, but function should be pure otherwise
  })
})
```

### Machine Tests

**Test state transitions**:

```typescript
// machines/registrationOrchestration.machine.test.ts

describe('registrationOrchestrationMachine', () => {
  it('transitions from idle to preparingCommitment on START_REGISTRATION', () => {
    const actor = createActor(registrationOrchestrationMachine)
    actor.start()

    actor.send({ type: 'START_REGISTRATION', name: 'leon', duration: 31536000n, token: 'USDC', price: 100n })

    expect(actor.getSnapshot().value).toBe('preparingCommitment')
  })

  it('stores commitment data on COMMITMENT_GENERATED', () => {
    const actor = createActor(registrationOrchestrationMachine)
    actor.start()

    actor.send({ type: 'START_REGISTRATION', ... })
    actor.send({
      type: 'COMMITMENT_GENERATED',
      commitment: { commitment: '0x123', secret: '0xabc' }
    })

    expect(actor.getSnapshot().context.commitment).toBeDefined()
  })
})
```

### Integration Tests

**Test full registration flow** (with mocked contracts):

```typescript
// pages/RegistrationPageV2.test.tsx

describe('RegistrationPageV2', () => {
  it('completes full registration flow', async () => {
    const { user, getByText } = render(<RegistrationPageV2 />)

    // Step 1: Pricing
    await user.click(getByText('Confirm Payment'))

    // Step 2: Commitment
    await waitFor(() => expect(getByText('Committing...')).toBeInTheDocument())

    // Step 3: Approval
    await waitFor(() => expect(getByText('Approving...')).toBeInTheDocument())

    // Step 4: Registration
    await waitFor(() => expect(getByText('Registering...')).toBeInTheDocument())

    // Step 5: Success
    await waitFor(() => expect(getByText('Success!')).toBeInTheDocument())
  })
})
```

### Manual Testing Checklist

- [ ] **Happy path**: Complete registration from start to finish
- [ ] **Commitment rejection**: User rejects commitment transaction in wallet
- [ ] **Approval rejection**: User rejects approval transaction in wallet
- [ ] **Registration rejection**: User rejects registration transaction in wallet
- [ ] **Network error**: Disconnect network during transaction
- [ ] **Page refresh**: Refresh page during commitment (should recover)
- [ ] **Page refresh**: Refresh page during approval (should recover)
- [ ] **Insufficient balance**: Try to register with insufficient token balance
- [ ] **XState Inspector**: Visualize machine in XState Inspector
- [ ] **Audit trail**: Check console for audit trail logs

---

## Rollout Plan

### Week 1: Development

**Day 1**: Phase 1 (Setup)
**Day 2**: Phase 2 (Machine)
**Day 3**: Phase 3 (React Integration)
**Day 4**: Phase 4 (Testing)
**Day 5**: Phase 5 (Cleanup)

### Week 2: Internal Testing

- Deploy to staging environment
- Feature flag enabled for internal team only
- Test on multiple devices/browsers
- Gather feedback from team

### Week 3: Gradual Rollout

**Day 1-2**: 10% of users (canary release)
**Day 3-4**: 50% of users
**Day 5-7**: 100% of users

**Rollout mechanism**:
```typescript
// Server-side or client-side percentage rollout
const USE_NEW_FLOW = Math.random() < 0.10  // 10% rollout
```

### Week 4: Cleanup

- Remove feature flag
- Delete old code
- Update documentation

---

## Rollback Strategy

### Immediate Rollback (if critical bug found)

**Step 1**: Flip feature flag to false
```typescript
// config/features.ts
export const FEATURES = {
  USE_NEW_REGISTRATION_FLOW: false  // ← Flip to false
}
```

**Step 2**: Deploy immediately
```bash
pnpm build:manager
# Deploy to production
```

**Rollback time**: < 5 minutes

### Partial Rollback (if issue affects some users)

**Option 1**: Reduce rollout percentage
```typescript
const USE_NEW_FLOW = Math.random() < 0.05  // Reduce from 50% to 5%
```

**Option 2**: Rollback for specific accounts
```typescript
const BLOCKLIST = ['0x123...', '0xabc...']
const USE_NEW_FLOW = !BLOCKLIST.includes(userAddress)
```

### Data Recovery

**Issue**: User gets stuck in middle of registration

**Solution**: Transaction persistence means state is saved
```typescript
// On page load, check for pending transactions
const pendingTxs = await getPendingTransactions()

if (pendingTxs.length > 0) {
  // Resume from where user left off
  transactionManager.recoverTransaction(pendingTxs[0].id)
}
```

---

## Success Metrics

### Code Quality Metrics

- [ ] **0** naked useEffect blocks in components
- [ ] **100%** of business logic in actors (pure functions)
- [ ] **100%** of state transitions logged
- [ ] **100%** test coverage for actors
- [ ] **> 80%** test coverage for components

### User Experience Metrics

- [ ] Registration completion rate **>= current rate**
- [ ] Average registration time **<= current time**
- [ ] Error rate **<= current error rate**
- [ ] Support tickets **<= current volume**

### Developer Experience Metrics

- [ ] Time to debug issues **< current time** (due to audit trail)
- [ ] Time to add new features **< current time** (due to better architecture)
- [ ] Onboarding time for new developers **< current time** (due to clearer code)

---

## Risks & Mitigations

### Risk 1: Breaking Existing Users

**Probability**: Medium
**Impact**: High

**Mitigation**:
- Use feature flag for gradual rollout
- Keep old code in place until 100% rollout
- Extensive testing before rollout
- Monitor error rates during rollout

### Risk 2: State Machine Complexity

**Probability**: Low
**Impact**: Medium

**Mitigation**:
- Start simple, add complexity incrementally
- Use XState Inspector for visualization
- Document state machine thoroughly
- Regular code reviews

### Risk 3: Transaction Manager Bugs

**Probability**: Low
**Impact**: High

**Mitigation**:
- Transaction manager is already battle-tested in transaction-manager-example
- Extensive integration tests
- Monitor audit trail for anomalies

### Risk 4: Performance Regression

**Probability**: Low
**Impact**: Low

**Mitigation**:
- XState is more performant than useEffect
- Transaction manager uses efficient polling
- Load testing before rollout

---

## Open Questions

1. **Should we use transaction-manager's TransactionModal or build custom UI?**
   - Recommendation: Start with custom UI (better control), migrate to TransactionModal later

2. **How do we handle auto-renewal setup?**
   - Recommendation: Add as separate optional step after success state

3. **Should we persist registration state across page refreshes?**
   - Recommendation: Yes, use transaction-manager's persistence

4. **Do we need to support canceling mid-registration?**
   - Recommendation: Yes, add CANCEL event that transitions to idle

5. **How do we handle commitment wait time on mainnet vs testnet?**
   - Recommendation: Make wait time configurable in machine context

---

## Appendix

### CLAUDE.md Compliance Checklist

- [x] **Code Co-location**: Actors co-located with machine
- [x] **Business Logic Outside React**: All logic in actors/machines
- [x] **Pattern Matching**: ts-pattern used for conditionals
- [x] **State Machines for Complex Flows**: XState for registration
- [x] **Extract Static Values**: Constants outside components
- [x] **Extract useEffect Logic**: All effects in named hooks
- [x] **No Naked useEffect**: All effects extracted

### Related Documentation

- `/packages/transaction-manager/TRANSACTION_FLOW.md` - Transaction flow architecture
- `/packages/transaction-manager/CLAUDE.md` - Transaction manager development guidelines
- `/CLAUDE.md` - Project-wide development guidelines
- `/ENS/CLAUDE.md` - ENS-specific guidelines (bug bounty, neverthrow, etc.)

### Contact

For questions about this refactoring plan, contact the architecture team.

---

**Last Updated**: 2025-11-07
**Author**: AI Assistant
**Status**: Draft - Pending Review
