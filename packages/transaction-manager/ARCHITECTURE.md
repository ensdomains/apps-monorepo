# 🎯 Transaction Manager Architecture Guide

> A comprehensive guide to understanding how the Transaction Manager works

## **What Problem Does It Solve?**

Imagine you're building a web3 app where users need to send transactions (like renewing an ENS name). Here's what can go wrong:

1. **Transaction gets stuck** - Network congestion, user has wrong gas settings
2. **Transaction fails** - User runs out of gas mid-execution
3. **Network drops** - Can't confirm if transaction succeeded
4. **Too complex for users** - Regular wallets vs smart accounts vs different payment methods

The **Transaction Manager** is like a **smart postal service** for blockchain transactions. It handles submission, tracking, retries, fallbacks, and gives users a nice UI to see what's happening.

---

## **🏗️ Architecture Overview**

The Transaction Manager has 4 main parts:

```
┌─────────────────────────────────────────┐
│  1. STATE MACHINE (Orchestrator)        │
│     Controls the flow of transactions   │
└──────────┬──────────────────────────────┘
           │
┌──────────▼──────────────────────────────┐
│  2. TRANSACTION SERVICE (Handler)       │
│     Actually sends transactions         │
└──────────┬──────────────────────────────┘
           │
┌──────────▼──────────────────────────────┐
│  3. RHINESTONE SERVICE (Smart Accounts) │
│     Handles smart account transactions  │
└──────────┬──────────────────────────────┘
           │
┌──────────▼──────────────────────────────┐
│  4. UI COMPONENTS (User Interface)      │
│     Shows progress to users             │
└─────────────────────────────────────────┘
```

---

## **1. The State Machine (The Brain)**

**File**: `machines/transaction.machine.ts:164-497`

Think of this as a **flowchart come to life**. It manages all possible states a transaction can be in:

```
idle → preparing → submitting → pending → confirming → success
                      ↓           ↓
                   retrying    checkingFallback
                      ↓           ↓
                    error ←───────┘
```

### **Key States Explained:**

**`idle`** (transaction.machine.ts:197-227)
- Waiting for user to start a transaction
- Like a parked car waiting for driver

**`preparing`** (transaction.machine.ts:229-232)
- Getting ready to send (very quick)
- Immediately moves to `submitting`

**`submitting`** (transaction.machine.ts:234-279)
- **This is where the magic happens!**
- Calls `TransactionService.submitTransaction()`
- **If successful**: Goes to `pending` with a transaction hash
- **If fails & can retry**: Goes to `retrying` (transaction.machine.ts:255-265)
- **If fails permanently**: Goes to `error.submission` (transaction.machine.ts:268-276)

**`pending`** (transaction.machine.ts:281-330)
- Transaction submitted, waiting for blockchain confirmation
- Calls `waitForReceipt()` to monitor the transaction
- **If timeout**: Can try `checkingFallback` to verify via eth_call

**`checkingFallback`** (transaction.machine.ts:332-372)
- **Clever fallback mechanism!**
- If we lose connection but transaction might have succeeded
- Uses `eth_call` to simulate and check if it would work
- Prevents "did it work or not?" confusion

**`confirming`** (transaction.machine.ts:374-395)
- Got receipt, checking if it succeeded or reverted
- If status is "reverted" → error
- Otherwise → success!

**`retrying`** (transaction.machine.ts:397-413)
- Waits a bit (default 2 seconds)
- Then tries `submitting` again
- User can cancel during retry

**`success`** (transaction.machine.ts:415-449)
- Transaction confirmed! 🎉
- Records audit trail
- Can execute another transaction from here

**`error`** (transaction.machine.ts:451-495)
- Different error types: submission, timeout, reverted, cancelled
- User can RETRY from any error state

---

## **2. Transaction Actors (Direct Client Usage)**

**File**: `machines/transaction.machine.ts:48-182`

The XState actors directly use viem's `PublicClient` and `WalletClient` to communicate with the blockchain - no service layer needed! The actors implement the transaction logic inline for maximum clarity and simplicity. They support 3 types:

### **Transaction Types** (transaction.types.ts:4)

```typescript
type TransactionType = 'eoa' | 'erc4337' | 'rhinestone-intent'
```

**A. EOA Transactions** (Regular Wallet)
- Code: `transaction.machine.ts:89-122`
- Uses `walletClient.sendTransaction()` directly
- Handles both legacy (gasPrice) and EIP-1559 (maxFeePerGas) gas pricing
- Like sending an email directly from your Gmail

**B. ERC-4337 (Smart Account via Bundler)**
- Code: `transaction.machine.ts:125-128`
- Currently returns an error - not yet implemented
- Would submit to a bundler service
- Like sending mail through a specialized courier service

**C. Rhinestone Intent** (Smart Account via Rhinestone SDK)
- Code: `transaction.machine.ts:61-86`
- **This is the cool new way!**
- Delegates to `RhinestoneAccountService`
- Handles cross-chain, gas abstraction, etc.

### **Key Actors:**

**`submitTransaction`** (transaction.machine.ts:48-130)
Handles transaction submission based on type:

```typescript
// Inline logic in the actor
if (request.type === 'rhinestone-intent') {
  const rhinestoneService = new RhinestoneAccountService(...)
  return rhinestoneService.executeENSRenewal(...)
}
if (request.type === 'eoa') {
  return walletClient.sendTransaction(txParams)
}
// Returns Result type for type-safe error handling
```

**`waitForReceipt`** (transaction.machine.ts:132-150)
- Calls `publicClient.waitForTransactionReceipt()` directly
- Has timeout (default 60 seconds)
- Returns `TransactionReceipt` with status

**`checkWithEthCall`** (transaction.machine.ts:152-182)
- **Fallback verification mechanism**
- Calls `publicClient.call()` to simulate the transaction
- Checks if it would succeed without actually executing
- Used when we lose connection but tx might be mined

---

## **3. Transaction Service (Legacy - Can Be Removed)**

**File**: `services/transaction.service.ts`

**NOTE**: This service class is no longer used by the state machine! The actors now call viem clients directly. This file exists for backward compatibility but could be removed in a future refactor.

The service was originally a wrapper around viem clients, but it added an unnecessary abstraction layer. Direct client usage in actors is simpler and more maintainable.

---

## **4. Rhinestone Account Service (Smart Accounts)**

**File**: `services/rhinestone-account.service.ts`

This handles all **smart account** functionality via Rhinestone SDK.

### **What's a Smart Account?**

Instead of a regular wallet (EOA = Externally Owned Account), a smart account is a **smart contract that acts like a wallet**. Benefits:
- **Gasless transactions** (someone else can pay)
- **Batching** (multiple actions in one tx)
- **Social recovery** (recover account if you lose keys)
- **Cross-chain** (Rhinestone handles the complexity)

### **Key Methods:**

**`initializeSmartAccount()`** (rhinestone-account.service.ts:61-100)
```typescript
// Creates a smart account with your wallet as the "owner"
const account = walletClientToAccount(this.walletClient)
this.rhinestoneAccount = await this.rhinestone.createAccount({
  owners: {
    type: 'ecdsa',  // Your wallet signs for the smart account
    accounts: [account],
  },
})
```

**`prepareENSRenewalTransaction()`** (rhinestone-account.service.ts:145-190)
- Gets the renewal price from ENS contract
- Encodes the `renew()` function call
- Returns transaction data ready to send

**`executeENSRenewal()`** (rhinestone-account.service.ts:192-243)
- **The main entry point for Rhinestone transactions!**
- Initializes smart account if needed
- Prepares the transaction
- Sends via Rhinestone SDK:

```typescript
const transaction = await this.rhinestoneAccount.sendTransaction({
  sourceChains: [sepolia],   // Which chain to execute on
  targetChain: sepolia,      // Where the ENS contract lives
  calls: [{                  // Can batch multiple calls!
    to: ENS_CONTRACT,
    data: encodedRenewCall,
    value: renewalPrice
  }]
})
```

---

## **5. Types & Interfaces**

**File**: `types/transaction.types.ts`

### **TransactionRequest** (types:6-45)

Three types inherit from `BaseTransactionRequest`:

```typescript
// 1. Regular wallet transaction
interface EOATransactionRequest {
  type: 'eoa'
  from: Address
  to: Address
  value?: bigint
  data?: Hex
  gas?: bigint
  // ... gas pricing fields
}

// 2. ERC-4337 User Operation
interface ERC4337UserOperation {
  type: 'erc4337'
  callData: Hex
  callGasLimit: bigint
  verificationGasLimit: bigint
  // ... 4337-specific fields
}

// 3. Rhinestone Intent
interface RhinestoneTransactionRequest {
  type: 'rhinestone-intent'
  rhinestoneParams?: {
    name: string      // ENS name to renew
    duration: bigint  // How long to renew for
  }
}
```

---

## **6. Error Handling**

**File**: `errors/transaction.errors.ts`

Custom error classes for different failure scenarios:

- `TransactionSubmissionError` - Failed to submit
- `TransactionTimeoutError` - Took too long to confirm
- `TransactionRevertedError` - Smart contract rejected it
- `GasEstimationError` - Can't estimate gas
- `UserOperationError` - ERC-4337 specific errors

All use **neverthrow** for type-safe error handling (no try-catch!)

---

## **7. UI Components**

**Files**: `components/TransactionModal/*`

User-facing React components:

- **TransactionModal** - Main modal showing progress
- **TransactionSteps** - Step-by-step progress indicator
- **PaymentSelector** - Choose payment method (ETH, USDC, etc.)
- **TransactionDetails** - Shows cost, network, etc.

---

## **8. How It All Works Together (Example Flow)**

Let's trace a **Rhinestone ENS Renewal**:

### **Step 1: User Clicks "Renew"**
(`transaction-manager-example/src/ENSRenewalExample.tsx:217-268`)

```typescript
// Prepare the renewal request
const result = await prepareENSRenewal({
  publicClient,
  walletClient,
  name: 'myname',
  duration: 31536000n,  // 1 year
  chainId: sepolia.id,
  useSmartAccount: true,
  rhinestoneConfig
})

// Send to state machine
send({
  type: 'EXECUTE',
  request: result.value.request,
  options: result.value.options
})
```

### **Step 2: State Machine Takes Over**
(`transaction.machine.ts:199-215`)

- Moves from `idle` → `preparing`
- Sets up context with request/options
- Opens modal for user

### **Step 3: Submitting**
(`transaction.machine.ts:261-271`)

Invokes `submitTransaction` actor which directly executes:
(`transaction.machine.ts:61-86`)

```typescript
// Actor handles it inline - no service needed!
if (request.type === 'rhinestone-intent') {
  const rhinestoneService = new RhinestoneAccountService(...)
  return rhinestoneService.executeENSRenewal(request.rhinestoneParams)
}
```

### **Step 4: Rhinestone Service Executes**
(`rhinestone-account.service.ts:192-234`)

```typescript
// 1. Initialize smart account
await this.initializeSmartAccount()

// 2. Prepare transaction (get price, encode call)
const { to, data, value } = await this.prepareENSRenewalTransaction()

// 3. Send via Rhinestone SDK
const transaction = await this.rhinestoneAccount.sendTransaction({
  sourceChains: [sepolia],
  targetChain: sepolia,
  calls: [{ to, data, value }]
})

// 4. Return hash
return ok(transaction.hash)
```

### **Step 5: Waiting for Confirmation**
Machine moves to `pending` and waits for receipt

### **Step 6: Success!**
- Machine moves to `success`
- Records audit trail
- User sees success message

---

## **🎓 Key Design Patterns Used**

1. **State Machine Pattern** - XState manages complex transaction lifecycle
2. **Result Type** - neverthrow for type-safe error handling (no exceptions!)
3. **Actor Pattern** - Actors encapsulate async logic and call clients directly
4. **Strategy Pattern** - Different transaction types, same interface
5. **Direct Client Usage** - No unnecessary service abstraction layer

---

## **💡 Why This Architecture?**

**Separation of Concerns:**
- Machine = business logic & state transitions
- Actors = async operations calling blockchain clients directly
- Components = UI

**Simplicity:**
- No unnecessary service abstraction layer
- Actors call viem clients directly
- Clear, inline transaction logic
- Easy to understand and debug

**Type Safety:**
- TypeScript everywhere
- neverthrow prevents runtime errors
- XState ensures valid state transitions only

**Resilience:**
- Automatic retries
- Fallback verification
- Detailed error types
- Audit trail for debugging

**Extensibility:**
- Easy to add new transaction types
- Pluggable services (Rhinestone, etc.)
- Reusable across apps

---

## **🚀 Quick Start for Developers**

To use the transaction manager in your app:

```typescript
import { transactionMachine } from '@ens-apps/transaction-manager'
import { useMachine } from '@xstate/react'
import { usePublicClient, useWalletClient } from 'wagmi'

// 1. Get viem clients from wagmi
const publicClient = usePublicClient()
const { data: walletClient } = useWalletClient()

// 2. Use machine with clients
const [state, send] = useMachine(transactionMachine, {
  input: {
    publicClient,
    walletClient,
    rhinestoneConfig  // Optional, for smart accounts
  }
})

// 3. Execute transaction
send({
  type: 'EXECUTE',
  request: {
    type: 'rhinestone-intent',
    from: userAddress,
    to: ensContract,
    chainId: 11155111,
    rhinestoneParams: {
      name: 'myname',
      duration: 31536000n
    }
  }
})

// 4. React to state
console.log(state.value) // 'submitting', 'pending', 'success', etc.
```

---

## **📚 Additional Resources**

- [XState Documentation](https://xstate.js.org/docs/)
- [neverthrow Documentation](https://github.com/supermacro/neverthrow)
- [Rhinestone SDK Documentation](https://docs.rhinestone.dev/)
- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)

---

**Last Updated**: October 2025
