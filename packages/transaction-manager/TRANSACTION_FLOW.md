# Complete Transaction Flow: From Click to Completion

## Overview

This document traces the exact code path a transaction takes from the moment you click "Renew" in the example app until it completes successfully.

## Step 1: Button Click → Send `PREPARE_AND_EXECUTE` Event

**File**: `packages/transaction-manager-example/src/ENSRenewalExample.tsx:485-508`

```typescript
<button
  onClick={() =>
    send({
      type: 'PREPARE_AND_EXECUTE',
      name: ui.name,
      duration: ui.duration,
      useSmartAccount: ui.useSmartAccount,
      renewalPrice: ui.renewalPrice,
    })
  }
  disabled={transactionUI.buttonDisabled}
  style={{
    padding: '10px 20px',
    fontSize: '16px',
    background: transactionUI.buttonColor,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: transactionUI.buttonDisabled ? 'not-allowed' : 'pointer',
    flex: 1,
  }}
>
  {transactionUI.buttonText}
</button>
```

**What happens here:**
- Button **directly sends** `PREPARE_AND_EXECUTE` event to state machine
- Event contains only form data (name, duration, smart account preference, price)
- **No wrapper functions, no callbacks, no business logic** - just pure data
- Machine handles all validation, preparation, and execution
- Component is a pure view layer that reacts to machine state

**Key Architecture**: This follows the "Business Logic Outside React Components" principle:
- ✅ Single source of truth (all logic in machine)
- ✅ True reactivity (component just renders state)
- ✅ Better error handling (explicit validation state)
- ✅ Simpler component (no business logic embedded)
- ✅ More testable (test machine, not component)
- ✅ Consistent pattern (all transitions declarative)

---

## Step 2: Machine Receives Event → `preparingTransaction` State

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:440-483`

```typescript
preparingTransaction: {
  entry: ['recordTransition'],
  invoke: {
    src: 'prepareRenewal',
    input: ({ context, event }) => {
      const prepareEvent = event as { type: 'PREPARE_AND_EXECUTE'; name: string; duration: string; useSmartAccount: boolean; renewalPrice?: bigint }
      return {
        name: prepareEvent.name,
        duration: prepareEvent.duration,
        useSmartAccount: prepareEvent.useSmartAccount,
        renewalPrice: prepareEvent.renewalPrice,
        publicClient: context.publicClient,
        walletClient: context.walletClient,
        chainId: context.publicClient.chain?.id || 11155111,
        rhinestoneConfig: context.rhinestoneConfig,
      }
    },
    onDone: {
      target: 'preparing',
      actions: [
        assign({
          request: ({ event }) => event.output.request,
          options: ({ event }) => event.output.options || {},
          modal: ({ event, context }) => ({
            ...context.modal,
            ...event.output.modal,
            isOpen: true
          })
        }),
        'recordTransition'
      ]
    },
    onError: {
      target: 'error.validation',
      actions: [
        assign({
          error: ({ event }) => event.error as Error
        }),
        'logError',
        'recordTransition'
      ]
    }
  }
}
```

**What happens here:**
- Machine receives `PREPARE_AND_EXECUTE` event while in `idle` state
- Transitions to `preparingTransaction` state
- Invokes `prepareRenewal` actor with form data + context (clients, config)
- On success:
  - Stores transaction request and options in context
  - Opens modal with transaction details
  - Transitions to `preparing` state
- On error:
  - Stores error
  - Transitions to `error.validation` state
- All transitions logged to audit trail

---

## Step 2.1: Prepare Renewal Actor

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:51-98`

```typescript
prepareRenewal: fromResultAsync(
  ({ name, duration, useSmartAccount, renewalPrice, publicClient, walletClient, chainId, rhinestoneConfig }): ResultAsync<{
    request: TransactionRequest
    options: TransactionOptions
    modal: Partial<TransactionModalState>
  }, Error> => {
    if (!walletClient) {
      return errAsync(new Error('Wallet client required'))
    }

    const YEAR_IN_SECONDS = 31536000n
    const cleanName = name.replace('.eth', '')
    const durationInSeconds = BigInt(duration) * YEAR_IN_SECONDS

    // ⬇️ Call helper to prepare ENS renewal
    return ResultAsync.fromSafePromise(
      prepareENSRenewal({
        publicClient,
        walletClient,
        name: cleanName,
        duration: durationInSeconds,
        chainId,
        useSmartAccount,
        rhinestoneConfig: useSmartAccount ? rhinestoneConfig : undefined,
      })
    )
      .andThen(result => result)
      .map((data: any) => ({
        request: data.request,
        options: {
          ...data.options,
          description: `Renew ${cleanName}.eth for ${duration} year(s)`,
        },
        modal: {
          title: `Renew ${name}`,
          ensName: name,
          network: 'Sepolia',
          estimatedCost: renewalPrice ? `${renewalPrice.toString()} wei` : '0.0011 ETH',
        },
      }))
      .mapErr(error => error as Error)
  }
)
```

**What happens here:**
- Pure actor function wrapped with `fromResultAsync`
- Validates wallet client is available
- Cleans ENS name (removes `.eth` suffix)
- Converts duration from years to seconds
- Calls `prepareENSRenewal()` helper
- Enriches transaction data with modal information (title, network, estimated cost)
- Returns `ResultAsync` - no try/catch needed

**Key Difference from Old Pattern**:
- **Before**: Component called external helper function with callbacks
- **After**: Machine actor does the preparation, component just sends event
- Business logic now lives entirely in machine/actors, not in component callbacks

---

## Step 3: Prepare Transaction → `prepareENSRenewal()`

**File**: `packages/transaction-manager/src/helpers/ens-renewal.helpers.ts:30-98`

```typescript
export async function prepareENSRenewal(
  params: PrepareENSRenewalParams
): Promise<Result<ENSRenewalTransactionData, Error>> {
  try {
    if (!walletClient?.account?.address) {
      return err(new Error('Wallet client with account address is required'))
    }

    const from = walletClient.account.address

    // ⬇️ Get renewal price and encode call data
    const txResult = await prepareENSRenewalTransaction(publicClient, {
      name,
      duration,
    })

    if (txResult.isErr()) {
      return err(txResult.error as Error)
    }

    const { to, data, value } = txResult.value

    // ⬇️ Branch based on account type
    if (useSmartAccount && rhinestoneConfig) {
      // Smart account transaction (Rhinestone intent)
      return ok({
        request: {
          type: 'rhinestone-intent',
          to,
          data,
          value,
          from,
          chainId,
          rhinestoneParams: { name, duration },
        },
        options: {
          rhinestoneConfig,
        },
      })
    } else {
      // Regular EOA transaction
      return ok({
        request: {
          type: 'eoa',
          to,
          data,
          value,
          from,
          chainId,
        } as EOATransactionRequest,
      })
    }
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Failed to prepare ENS renewal'))
  }
}
```

**What happens here:**
- Gets wallet address
- Calls `prepareENSRenewalTransaction()` to get price and encode call data
- Branches into two transaction types:
  - **Smart Account**: Creates `rhinestone-intent` request with Rhinestone params
  - **EOA**: Creates `eoa` request for standard wallet transaction

---

### Step 2a: Get Price & Encode → `prepareENSRenewalTransaction()`

**File**: `packages/transaction-manager/src/helpers/rhinestone-account.helpers.ts:133-181`

```typescript
export async function prepareENSRenewalTransaction(
  publicClient: PublicClient,
  params: ENSRenewalParams
): Promise<Result<{ to: Hex; data: Hex; value: bigint }, RhinestoneAccountError>> {
  try {
    const { name, duration } = params
    console.log('📋 Preparing ENS renewal transaction...', { name, duration: duration.toString() })

    // ⬇️ Get the renewal price from ENS contract
    const priceResult = await getENSRenewalPrice(publicClient, name, duration)
    if (priceResult.isErr()) {
      return err(priceResult.error)
    }

    const renewalPrice = priceResult.value

    // ⬇️ Encode the renew function call
    const data = encodeFunctionData({
      abi: ETH_REGISTRAR_CONTROLLER_ABI,
      functionName: 'renew',
      args: [name, duration],
    })

    // Return transaction data
    return ok({
      to: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
      data,
      value: renewalPrice,
    })
  } catch (error) {
    return err(new RhinestoneAccountError('Failed to prepare ENS renewal transaction'))
  }
}
```

**What happens here:**
- Calls ENS contract's `rentPrice()` function to get renewal cost
- Encodes the `renew(name, duration)` function call
- Returns transaction parameters: `to`, `data`, `value`

---

## Step 3: State Machine Receives EXECUTE → `transactionMachine`

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:344-371`

```typescript
// idle state
idle: {
  on: {
    EXECUTE: {
      target: 'preparing',  // ⬇️ Transition to preparing state
      actions: assign({
        request: ({ event }) => event.request,
        options: ({ event }) => event.options || {},
        retryCount: 0,
        fallbackChecks: 0,
        hash: undefined,
        userOpHash: undefined,
        receipt: undefined,
        error: undefined,
        modal: ({ event, context }) => ({
          ...context.modal,
          ...(event.modal || {}),
          isOpen: true  // ⬇️ Open modal
        })
      })
    }
  }
}
```

**What happens here:**
- Machine receives `EXECUTE` event
- Transitions from `idle` → `preparing`
- Stores transaction request and options in context
- Resets retry counters and clears previous errors
- Opens transaction modal

---

## Step 4: Preparing State → Decides Next Step

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:374-407`

```typescript
preparing: {
  entry: [
    'recordTransition',  // ⬇️ Log state change to audit trail
    ({ context }) => {
      console.log('🔧 [STATE MACHINE] Entering preparing state', {
        requestType: context.request?.type,
        isRhinestoneIntent: context.request?.type === 'rhinestone-intent',
        hasRhinestoneAccount: !!context.rhinestoneAccount,
        willInitializeAccount: context.request?.type === 'rhinestone-intent' &&
                                !context.rhinestoneAccount
      })
    }
  ],
  always: [
    {
      // ⬇️ If Rhinestone and no cached account: initialize first
      guard: ({ context }) =>
        context.request?.type === 'rhinestone-intent' &&
        !context.rhinestoneAccount &&
        !!context.rhinestoneConfig,
      target: 'initializingSmartAccount'
    },
    {
      // ⬇️ Otherwise: go directly to submitting
      target: 'submitting'
    }
  ]
}
```

**What happens here:**
- Logs state transition to audit trail
- Checks if Rhinestone account initialization is needed:
  - **If smart account + no cached account**: Go to `initializingSmartAccount`
  - **Otherwise**: Go directly to `submitting`

---

## Step 5a (Smart Account Only): Initialize Rhinestone Account

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:409-475`

```typescript
initializingSmartAccount: {
  entry: ['recordTransition', ...],
  invoke: {
    src: 'initializeRhinestoneAccount',  // ⬇️ Call actor
    input: ({ context }) => ({
      walletClient: context.walletClient,
      rhinestoneConfig: context.rhinestoneConfig,
    }),
    onDone: {
      target: 'submitting',  // ⬇️ Success: go to submitting
      actions: [
        assign({
          rhinestoneAccount: ({ event }) => event.output  // ⬇️ Cache account
        }),
        'recordTransition'
      ]
    },
    onError: {
      target: 'error.submission',  // ⬇️ Failed: error state
      actions: [
        assign({ error: ({ event }) => event.error as Error }),
        'logCritical',
        'recordTransition'
      ]
    }
  }
}
```

**What happens here:**
- Invokes `initializeRhinestoneAccount` actor
- On success:
  - Stores Rhinestone account instance in context (cached for future transactions)
  - Transitions to `submitting`
- On error:
  - Stores error
  - Logs critical error to audit trail
  - Transitions to error state

---

### Step 5a.1: Initialize Account Actor → `initializeRhinestoneAccount()`

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:49-67`

```typescript
// Actor definition
initializeRhinestoneAccount: fromResultAsync(
  ({ walletClient, rhinestoneConfig }): ResultAsync<any, Error> => {
    if (!rhinestoneConfig) {
      return errAsync(new Error('Rhinestone config required'))
    }
    if (!walletClient) {
      return errAsync(new Error('Wallet client required'))
    }

    // ⬇️ Call helper which uses Rhinestone SDK
    return ResultAsync.fromSafePromise(
      initializeRhinestoneAccount(walletClient, rhinestoneConfig)
    )
      .andThen(result => result)
      .mapErr(error => error as Error)
  }
)
```

**What happens here:**
- Pure actor function wrapped with `fromResultAsync`
- Validates inputs (config, wallet client)
- Calls `initializeRhinestoneAccount()` helper
- Returns `ResultAsync` - no try/catch needed

---

### Step 5a.2: Rhinestone SDK Interaction

**File**: `packages/transaction-manager/src/helpers/rhinestone-account.helpers.ts:38-87`

```typescript
export async function initializeRhinestoneAccount(
  walletClient: WalletClient,
  config: RhinestoneAccountConfig
): Promise<Result<any, RhinestoneAccountError>> {
  try {
    console.log('🔐 Initializing Rhinestone smart account...')

    if (!walletClient?.account) {
      return err(new RhinestoneAccountError('No wallet client available'))
    }

    // ⬇️ Initialize Rhinestone SDK
    const rhinestone = new RhinestoneSDK({
      apiKey: config.rhinestoneApiKey,
    })

    // ⬇️ Convert wallet to account format
    console.log('📝 [SIGNATURE REQUEST 1/2] Creating Rhinestone account with ECDSA owner...')
    const account = walletClientToAccount(walletClient)

    // ⬇️ Create smart account (may request signature)
    console.log('📝 [SIGNATURE REQUEST 2/2] Calling rhinestone.createAccount()...')
    const rhinestoneAccount = await rhinestone.createAccount({
      owners: {
        type: 'ecdsa',
        accounts: [account],
      },
    })

    console.log('✅ Rhinestone account created:', {
      address: rhinestoneAccount?.getAddress?.(),
    })

    return ok(rhinestoneAccount)
  } catch (error) {
    return err(new RhinestoneAccountError(...))
  }
}
```

**What happens here:**
- Creates Rhinestone SDK instance with API key
- Converts wallet client to Rhinestone account format
- Creates smart account (deterministic address based on owner)
- May request wallet signature for account creation
- Returns account instance (cached in machine context)

**Note**: This creates a local SDK instance. The account address is deterministic, so creating it twice produces the same address.

---

## Step 6: Submitting State → Send Transaction

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:477-542`

```typescript
submitting: {
  entry: [
    'recordTransition',
    ({ context }) => {
      console.log('🔧 [STATE MACHINE] Entering submitting state', {
        requestType: context.request?.type,
        hasRhinestoneAccount: !!context.rhinestoneAccount,
      })
    }
  ],
  invoke: {
    src: 'submitTransaction',  // ⬇️ Call submit actor
    input: ({ context }) => ({
      request: context.request,
      options: context.options,
      publicClient: context.publicClient,
      walletClient: context.walletClient,
      rhinestoneConfig: context.rhinestoneConfig,
      rhinestoneAccount: context.rhinestoneAccount  // ⬇️ Pass cached account
    }),
    onDone: {
      target: 'pending',  // ⬇️ Success: wait for receipt
      actions: [
        assign({
          hash: ({ event }) => event.output,  // ⬇️ Store tx hash
        }),
        'recordTransition'
      ]
    },
    onError: [
      {
        guard: 'canRetry',  // ⬇️ Can retry?
        target: 'retrying',
        actions: [
          assign({
            error: ({ event }) => event.error as Error,
            retryCount: ({ context }) => context.retryCount + 1
          }),
          'logError',
          'recordTransition'
        ]
      },
      {
        target: 'error.submission',  // ⬇️ Out of retries
        actions: [
          assign({ error: ({ event }) => event.error as Error }),
          'logCritical',
          'recordTransition'
        ]
      }
    ]
  }
}
```

**What happens here:**
- Invokes `submitTransaction` actor with all context data
- On success:
  - Stores transaction hash
  - Transitions to `pending` (waiting for confirmation)
- On error:
  - If retries available: Go to `retrying` state
  - If out of retries: Go to error state
- Logs all state changes to audit trail

---

### Step 6.1: Submit Transaction Actor

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:69-171`

The actor branches based on transaction type:

#### For Smart Account (Rhinestone Intent):

```typescript
if (request.type === 'rhinestone-intent') {
  console.log('🔧 [ACTOR] Handling rhinestone-intent transaction')

  // Validate inputs
  if (!rhinestoneConfig) {
    return errAsync(new TransactionSubmissionError(...))
  }
  if (!request.rhinestoneParams) {
    return errAsync(new TransactionSubmissionError(...))
  }
  if (!rhinestoneAccount) {
    return errAsync(new TransactionSubmissionError(...))
  }

  // ⬇️ Execute via Rhinestone SDK
  return ResultAsync.fromSafePromise(
    executeENSRenewal(
      rhinestoneAccount,
      publicClient,
      request.rhinestoneParams,
      rhinestoneConfig
    )
  )
    .andThen(result => result)
    .mapErr(error => new TransactionSubmissionError(request, error))
}
```

**What happens here:**
- Validates all required parameters for smart account transaction
- Calls `executeENSRenewal()` with cached Rhinestone account
- Returns transaction hash or error

---

#### Step 6.1.1: Execute via Rhinestone

**File**: `packages/transaction-manager/src/helpers/rhinestone-account.helpers.ts:186-254`

```typescript
export async function executeENSRenewal(
  rhinestoneAccount: any,
  publicClient: PublicClient,
  params: ENSRenewalParams,
  config: RhinestoneAccountConfig
): Promise<Result<Hex, RhinestoneAccountError>> {
  try {
    console.log('🚀 Executing ENS renewal...')

    // ⬇️ Prepare transaction (get price + encode)
    const txResult = await prepareENSRenewalTransaction(publicClient, params)
    if (txResult.isErr()) {
      return err(txResult.error)
    }

    const { to, data, value } = txResult.value
    const chain = config.chain || sepolia

    // ⬇️ Execute via Rhinestone SDK (sends intent to orchestrator)
    console.log('📤 Calling rhinestoneAccount.sendTransaction()...')
    const transaction = await rhinestoneAccount.sendTransaction({
      sourceChains: [chain],
      targetChain: chain,
      calls: [
        {
          to,
          data,
          value,
        },
      ],
    })

    console.log('✅ Transaction response:', transaction)

    // ⬇️ Rhinestone returns an intent with 'id' or 'hash'
    const txHash = transaction.hash || transaction.id

    // ⬇️ Convert bigint ID to hex if needed
    const hashAsHex = typeof txHash === 'bigint'
      ? `0x${txHash.toString(16).padStart(64, '0')}` as Hex
      : txHash as Hex

    return ok(hashAsHex)
  } catch (error) {
    return err(new RhinestoneAccountError(...))
  }
}
```

**What happens here:**
- Prepares transaction data (calls ENS contract for price, encodes call)
- Sends transaction via Rhinestone SDK's `sendTransaction()`
- Rhinestone orchestrator processes the intent and executes on-chain
- Returns transaction hash (or intent ID converted to hash format)

**Important**: Rhinestone handles gas sponsorship and cross-chain abstraction. The smart account must have sufficient ETH balance to pay for the renewal value.

---

#### For Regular EOA:

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:130-163`

```typescript
if (request.type === 'eoa') {
  if (!walletClient) {
    return errAsync(new TransactionSubmissionError(...))
  }

  const eoaRequest = request as EOATransactionRequest

  // ⬇️ Build transaction params
  const txParams: any = {
    account: eoaRequest.from,
    to: eoaRequest.to,
    value: eoaRequest.value,
    data: eoaRequest.data,
    gas: eoaRequest.gas,
    nonce: eoaRequest.nonce,
    chain: walletClient.chain
  }

  // Handle gas pricing (EIP-1559 or legacy)
  if (eoaRequest.maxFeePerGas !== undefined) {
    txParams.maxFeePerGas = eoaRequest.maxFeePerGas
    txParams.maxPriorityFeePerGas = eoaRequest.maxPriorityFeePerGas
  } else if (eoaRequest.gasPrice !== undefined) {
    txParams.gasPrice = eoaRequest.gasPrice
  }

  // ⬇️ Send transaction via wallet (will request user signature)
  return fromPromiseNT(
    walletClient.sendTransaction(txParams),
    (error) => new TransactionSubmissionError(request, error)
  )
}
```

**What happens here:**
- Validates wallet client is available
- Builds transaction parameters from the request
- Handles both EIP-1559 (maxFeePerGas) and legacy (gasPrice) gas pricing
- Calls viem's `walletClient.sendTransaction()` which triggers wallet signature request
- Returns transaction hash once signed and submitted

---

## Step 7: Pending State → Wait for Receipt

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:544-595`

```typescript
pending: {
  entry: 'recordTransition',
  invoke: {
    src: 'waitForReceipt',  // ⬇️ Call wait actor
    input: ({ context }) => ({
      hash: context.hash!,
      options: context.options,
      publicClient: context.publicClient,
    }),
    onDone: [
      {
        target: 'confirming',  // ⬇️ Success: check if reverted
        actions: [
          assign({
            receipt: ({ event }) => event.output  // ⬇️ Store receipt
          }),
          'recordTransition'
        ]
      }
    ],
    onError: [
      {
        guard: 'shouldCheckFallback',  // ⬇️ Can try eth_call?
        target: 'checkingFallback',
        actions: [
          assign({
            fallbackChecks: ({ context }) => context.fallbackChecks + 1
          }),
          'recordTransition'
        ]
      },
      {
        target: 'error.timeout',  // ⬇️ Give up
        actions: [
          assign({ error: ({ event }) => event.error as Error }),
          'logError',
          'recordTransition'
        ]
      }
    ]
  },
  on: {
    FORCE_SUCCESS: {  // ⬇️ Manual override
      target: 'success',
      actions: 'recordTransition'
    }
  }
}
```

**What happens here:**
- Invokes `waitForReceipt` actor to poll for transaction confirmation
- On success:
  - Stores transaction receipt
  - Transitions to `confirming` (to check if reverted)
- On timeout:
  - If fallback checks available: Try `eth_call` fallback
  - Otherwise: Go to error state
- Allows manual override with `FORCE_SUCCESS` event

---

### Step 7.1: Wait Actor

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:173-191`

```typescript
waitForReceipt: fromResultAsync(
  ({ hash, options, publicClient }): ResultAsync<TransactionReceipt, TransactionTimeoutError> => {
    const confirmations = options?.confirmations || 1
    const timeout = options?.timeout || 60000

    // ⬇️ Wait for transaction to be mined
    return fromPromiseNT(
      publicClient.waitForTransactionReceipt({
        hash,
        confirmations,
        timeout
      }),
      (error) => new TransactionTimeoutError(hash, timeout)
    )
  }
)
```

**What happens here:**
- Uses viem's `publicClient.waitForTransactionReceipt()` to poll for transaction
- Waits for specified number of confirmations (default: 1)
- Times out after specified duration (default: 60 seconds)
- Returns receipt once transaction is mined, or times out

---

## Step 8: Confirming State → Check Success/Revert

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:641-662`

```typescript
confirming: {
  entry: 'recordTransition',
  always: [
    {
      guard: 'isReverted',  // ⬇️ Check if reverted
      target: 'error.reverted',
      actions: [
        assign({
          error: ({ context }) => new TransactionRevertedError(...)
        }),
        'logError',
        'recordTransition'
      ]
    },
    {
      target: 'success',  // ⬇️ Transaction succeeded!
      actions: 'recordTransition'
    }
  ]
}
```

**Guard Definition**: `packages/transaction-manager/src/machines/transaction.machine.ts:239-240`
```typescript
isReverted: ({ context }) =>
  context.receipt?.status === 'reverted'
```

**What happens here:**
- Immediately checks receipt status
- If `status === 'reverted'`:
  - Creates `TransactionRevertedError`
  - Logs error to audit trail
  - Transitions to error state
- If successful:
  - Transitions to `success` state

---

## Step 9: Success State → Complete

**File**: `packages/transaction-manager/src/machines/transaction.machine.ts:682-716`

```typescript
success: {
  entry: [
    'recordTransition',
    ({ context }) => {
      // ⬇️ Log success to audit trail
      auditTrail.addAuditEntry(
        'info',
        'Transaction completed successfully',
        {
          hash: context.hash,
          receipt: context.receipt,
          gasUsed: context.receipt?.gasUsed?.toString()
        }
      )
    }
  ],
  on: {
    EXECUTE: {
      target: 'preparing',  // ⬇️ Can start another transaction
      actions: assign({
        request: ({ event }) => event.request,
        options: ({ event }) => event.options || {},
        retryCount: 0,
        fallbackChecks: 0,
        hash: undefined,
        userOpHash: undefined,
        receipt: undefined,
        error: undefined
      })
    }
  }
}
```

**What happens here:**
- Logs successful transaction to audit trail with:
  - Transaction hash
  - Receipt data
  - Gas used
- Machine can accept new `EXECUTE` event to start another transaction
- All transaction data is reset for the next transaction

---

## Step 10: UI Updates → Modal Shows Success

**File**: `packages/transaction-manager-example/src/ENSRenewalExample.tsx:89-97`

```typescript
// UI derives state from machine using ts-pattern
const transactionUI = match(state.value)
  .with('success', () => ({
    buttonText: 'Renew Again',
    buttonDisabled: false,
    buttonColor: '#4CAF50',
    showStatus: true,
    statusBackground: '#e8f5e9',
    statusMessage: '✅ Renewal successful! Your name has been extended.',
    showTransactionHash: !!hash,
  }))
  // ... other states
```

**What happens here:**
- React component uses `useMachine` hook to subscribe to machine state
- `ts-pattern` matches machine state value to derive UI state
- When state is `'success'`:
  - Button shows "Renew Again" (enabled)
  - Status panel shows success message with green background
  - Transaction hash displayed as Etherscan link

---

## Complete Flow Diagram

```
1. Click "Renew" button
   ↓
2. Button sends PREPARE_AND_EXECUTE event to state machine
   (Just form data - no callbacks, no business logic)
   ↓
3. Machine: idle → preparingTransaction
   ↓
4. prepareRenewal actor invoked:
   - Validates form data
   - Validates wallet client
   - Cleans ENS name
   - Calls prepareENSRenewal() helper
   - Enriches with modal data
   ↓
5. prepareENSRenewal() → Get renewal price and encode call data
   ↓
6. On success: Machine: preparingTransaction → preparing
   (Transaction request/options stored in context, modal opened)
   ↓
   ├─ [Smart Account Path] ──────────────────────────┐
   │                                                   │
   7a. Machine: preparing → initializingSmartAccount  │
        ↓                                              │
   8a. Initialize Rhinestone SDK                      │
        ↓                                              │
   9a. rhinestone.createAccount() (may request sig)   │
        ↓                                              │
   10a. Cache account in machine context              │
        ↓                                              │
   ├───────────────────────────────────────────────────┘
   │
   ├─ [Both Paths Continue] ─────────────────────────┐
   │                                                   │
   11. Machine: preparing/initializingSmartAccount → submitting
       ↓
   12. Submit transaction actor branches:
       ├─ [Smart Account] → executeENSRenewal()
       │    ↓
       │    rhinestoneAccount.sendTransaction()
       │    (Rhinestone orchestrator processes intent)
       │
       └─ [EOA] → walletClient.sendTransaction()
            (Wallet signature request)
       ↓
   13. Machine: submitting → pending (has transaction hash)
       ↓
   14. Wait for receipt actor:
       ↓
       publicClient.waitForTransactionReceipt()
       (Polls blockchain for transaction)
       ↓
   15. Machine: pending → confirming (has receipt)
       ↓
   16. Check if transaction reverted (receipt.status)
       ↓
   17. Machine: confirming → success
       ↓
   18. Log to audit trail (transaction hash, gas used, receipt)
       ↓
   19. UI updates: Show success message, enable "Renew Again" button
       (Component derives UI state from machine state via ts-pattern)
       ↓
   20. Done! ✅
```

---

## Key Design Principles

### 1. Business Logic Outside React Components
**General Principle**: Business logic should live **outside** React components, not embedded within them. Components should primarily contain UI state and rendering logic.

**Business logic can live in**:
- ✅ **State machines** (for complex multi-step flows with state transitions)
- ✅ **Pure functions** (helpers, utilities, validators)
- ✅ **Click handler functions** (external functions called from inline handlers)
- ✅ **Services/API clients** (data fetching, transformations)
- ✅ **Custom hooks** (for reusable logic with React lifecycle)

**What belongs in components**:
- UI state (form inputs, modal open/closed, selected tabs, hover states)
- Rendering logic (JSX, conditional rendering)
- Event handlers that **call** external logic (not contain it)
- Derived display state (formatting for display only)

**What should live outside components**:
- Business rules and validation logic
- Data transformations and calculations
- API calls and data fetching
- Complex workflows and orchestration
- Retry logic and error handling

**Examples**:

✅ **Good - Logic in state machine (this codebase)**:
```typescript
// Component just sends event
<button onClick={() => send({
  type: 'PREPARE_AND_EXECUTE',
  name: ui.name,
  duration: ui.duration
})}>
```

✅ **Good - Logic in pure function**:
```typescript
// External function
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}

// Component calls it
<button onClick={() => {
  const total = calculateTotal(items)
  processCheckout(total)
}}>
```

❌ **Bad - Business logic embedded in component**:
```typescript
<button onClick={() => {
  // All this logic should be extracted
  if (!name) {
    alert('Name required')
    return
  }
  const cleanName = name.replace('.eth', '')
  const duration = BigInt(years) * 31536000n
  // ... more logic
}}>
```

**Why This Matters**:
- **Testability**: Test logic without React/DOM
- **Reusability**: Same logic works across web, mobile, CLI, tests
- **Maintainability**: Logic changes don't require component changes
- **Readability**: Components focus on "what to render", not "how to process"

**In this codebase**: We use state machines for complex transaction flows because they provide explicit state transitions, retry logic, and audit trails. For simpler cases, pure functions or custom hooks may be more appropriate.

This principle is applied throughout the codebase.

### 2. State Machine Controls Everything
The `transactionMachine` orchestrates the entire flow with explicit state transitions. Every state change is logged and visible.

### 3. Actors are Pure Functions
Each actor (`submitTransaction`, `waitForReceipt`, `initializeRhinestoneAccount`) is a pure function that:
- Takes input parameters
- Returns `ResultAsync<Success, Error>`
- Has no side effects (besides the actual operation)
- Can be tested independently

### 4. Explicit Logging & Audit Trail
Every state transition calls `recordTransition` action which logs:
- Machine ID
- From state → To state
- Event that triggered transition
- Context data (hash, request, retry count)
- Metadata (chain ID, transaction hash)

Additional audit entries are created for:
- `info`: Successful operations
- `warning`: Fallback mechanisms activated
- `error`: Recoverable errors
- `critical`: Unrecoverable errors

### 5. Smart Account Caching
Rhinestone account is initialized once and cached in machine context (`context.rhinestoneAccount`). Subsequent transactions reuse the same instance, avoiding:
- Redundant initialization
- Multiple signature requests
- Unnecessary SDK instantiation

### 6. Functional Error Handling
Uses `neverthrow` Result types throughout:
- No try/catch needed in most code
- Errors are values that flow through the system
- `fromResultAsync` helper unwraps Results for XState actors
- Type-safe error handling at compile time

Example:
```typescript
// Helper returns Result
const result = await prepareENSRenewal(params)

// Handle with pattern matching
handleResult(result, {
  onOk: (data) => { /* use data */ },
  onErr: (error) => { /* handle error */ }
})
```

### 7. Automatic Retry with Backoff
Failed submissions can retry automatically:
- Guard: `canRetry` checks if `retryCount < 3`
- Retry state waits for configurable delay (default: 2000ms)
- Error is logged, retry count incremented
- After max retries, enters error state

### 8. Fallback Mechanism
If waiting for receipt times out, the machine has a fallback:
- Uses `eth_call` to simulate transaction
- Checks if transaction would succeed
- Can force success if call succeeds
- Prevents false negatives from network issues

### 9. Type Safety
Transaction types are strongly typed:
```typescript
type TransactionRequest =
  | EOATransactionRequest
  | ERC4337UserOperation
  | RhinestoneIntentRequest

// Each has specific required fields
interface EOATransactionRequest {
  type: 'eoa'
  from: Address
  to: Address
  data: Hex
  value: bigint
  chainId: number
  // ... gas params
}
```

This ensures the machine receives valid data and actors receive correct input types.

---

## Error Handling Examples

### Submission Errors
```typescript
// Invalid input
error.submission: {
  message: "Wallet client required for EOA transactions"
}

// Contract reverts
error.submission: {
  message: "Bundle simulation failed" // Rhinestone
}

// Network errors
error.submission: {
  message: "User rejected the request" // Wallet rejection
}
```

### Timeout Errors
```typescript
error.timeout: {
  hash: "0x123...",
  timeout: 60000,
  message: "Transaction timeout after 60000ms"
}
```

Machine can retry with fallback:
- `checkingFallback` state uses `eth_call`
- If call succeeds → force success
- If call fails → return to pending
- After 3 fallback checks → error.timeout

### Reverted Transactions
```typescript
error.reverted: {
  hash: "0x123...",
  receipt: { status: 'reverted', ... },
  message: "Transaction 0x123... reverted"
}
```

Transaction was mined but failed on-chain. Logged as error in audit trail.

---

## Monitoring & Debugging

### Console Logs
Every major step logs to console with emoji prefixes:
- `🔧 [STATE MACHINE]`: Machine state changes
- `🔧 [ACTOR]`: Actor invocations
- `📤`: Submitting transactions
- `📝`: Signature requests
- `✅`: Success operations
- `❌`: Errors

### Audit Trail
Access via audit service:
```typescript
import { getTransitionHistory, generateDebugReport } from '@ens-apps/transaction-manager'

// Get all state transitions
const history = getTransitionHistory('transaction')

// Generate debug report
const report = generateDebugReport()
console.log(report)
```

### XState Inspector
The machine is compatible with XState inspector for visual debugging:
```typescript
import { inspect } from '@xstate/inspect'

inspect({
  iframe: false
})

// Machine will appear in XState devtools
```

---

## Testing the Flow

### Unit Tests
Test each layer independently:

```typescript
// Test pure handler function (no React needed!)
import { handleRenewal } from './helpers/renewal.helpers'

test('handleRenewal validates form data', async () => {
  const mockHandlers = {
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onValidationError: vi.fn(),
    onLog: vi.fn(),
  }

  await handleRenewal(
    { name: '', duration: '1', useSmartAccount: false, renewalPrice: null },
    { publicClient: mockClient, walletClient: mockWallet, chainId: 11155111 },
    mockHandlers
  )

  expect(mockHandlers.onValidationError).toHaveBeenCalledWith('Please enter a name to renew')
  expect(mockHandlers.onSuccess).not.toHaveBeenCalled()
})

// Test helpers
const result = await prepareENSRenewal({
  publicClient: mockClient,
  walletClient: mockWallet,
  name: 'test',
  duration: 31536000n,
  chainId: 11155111,
})

expect(result.isOk()).toBe(true)
```

### Integration Tests
Test machine behavior:

```typescript
import { createActor } from 'xstate'
import { transactionMachine } from '@ens-apps/transaction-manager'

const actor = createActor(transactionMachine, {
  input: {
    publicClient: mockClient,
    walletClient: mockWallet,
  }
})

actor.start()
actor.send({ type: 'EXECUTE', request: mockRequest })

// Assert state transitions
expect(actor.getSnapshot().value).toBe('preparing')
```

### E2E Tests
Test complete flow with real blockchain:

```typescript
import { renderHook, act } from '@testing-library/react'
import { useMachine } from '@xstate/react'
import { transactionMachine } from '@ens-apps/transaction-manager'

// Test the complete flow with machine
const { result } = renderHook(() =>
  useMachine(transactionMachine, {
    input: {
      publicClient: testnetPublicClient,
      walletClient: testnetWalletClient,
      rhinestoneConfig: testConfig,
    },
  })
)

const [state, send] = result.current

// Send PREPARE_AND_EXECUTE event
act(() => {
  send({
    type: 'PREPARE_AND_EXECUTE',
    name: 'test',
    duration: '1',
    useSmartAccount: false,
    renewalPrice: parseEther('0.001'),
  })
})

// Wait for transaction to complete
await waitFor(() => {
  expect(result.current[0].value).toBe('success')
}, { timeout: 120000 })

// Verify on-chain state changed
const expiry = await ensContract.nameExpires('test')
expect(expiry).toBeGreaterThan(previousExpiry)
```

---

## Further Reading

- **XState Documentation**: https://xstate.js.org/
- **neverthrow**: https://github.com/supermacro/neverthrow
- **Rhinestone SDK**: https://docs.rhinestone.dev/
- **Viem**: https://viem.sh/

For questions or issues, see the main README or open an issue on GitHub.
