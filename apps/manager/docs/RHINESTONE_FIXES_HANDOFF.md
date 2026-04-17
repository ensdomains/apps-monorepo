# Rhinestone Fixes Handoff

This is the self-contained replay guide for the two real Rhinestone fixes.

Do not rely on switching branches to recover these changes. Everything needed to replay them is included below as exact patch-style code.

This guide is written for the current branch shape, which still:

- routes Rhinestone HCA registration through `registerHCAOwnership(...)`
- imports `walletClientToAccount` / `wrapParaAccount` from `@rhinestone/sdk`
- does not yet have the session normalization helper in `src/lib/smart-account/utils.ts`

## Validation

After applying the changes below, run:

```bash
pnpm --filter manager exec vitest run \
  src/lib/smart-account/utils.test.ts \
  src/lib/smart-account/sessions/rhinestone-session.test.ts \
  src/lib/smart-account/rhinestone.test.ts
```

Full `manager` typecheck may still fail because of unrelated existing errors. That is not part of this replay.

## Fix 1: HCA registration goes direct for Rhinestone

### Why

The `tx-manager` path is still failing for Rhinestone HCA registration. For now, use the direct `rhinestoneAccount.sendTransaction(...)` flow so account initialization works.

### Update `src/lib/smart-account/rhinestone.ts`

This patch keeps the current branch structure, including `createRhinestoneAccountClient(...)`, and only changes the wrapper imports and the HCA registration section.

```diff
--- a/apps/manager/src/lib/smart-account/rhinestone.ts
+++ b/apps/manager/src/lib/smart-account/rhinestone.ts
@@
-import type {
-  RhinestoneSigner,
-  TransactionInfra,
-} from '@ens-apps/transaction-manager'
+import {
+  ENS_SEPOLIA_CONTRACTS,
+  type TransactionInfra,
+} from '@ens-apps/transaction-manager'
 import { createParaAccount } from '@getpara/viem-v2-integration'
 import {
   type RhinestoneAccount,
   RhinestoneSDK,
-  walletClientToAccount,
-  wrapParaAccount,
 } from '@rhinestone/sdk'
-import type { Account, Address, WalletClient } from 'viem'
+import {
+  encodeFunctionData,
+  zeroAddress,
+  type Account,
+  type Address,
+  type WalletClient,
+} from 'viem'
 import { customSepolia, publicClient } from '@/lib/wagmi'
 import { isHCARegistrationDisabled } from '@/utils/feature-flags'
-import { registerHCAOwnership } from './hca-registry'
+import { HCA_FACTORY_ABI } from '../hca-factory.abi'
 import type { ParaClient, SmartAccountType } from './types'
+import { walletClientToAccount, wrapParaAccount } from './utils'
@@
-  // Register HCA ownership via smart account (sponsored) if requested
+  // Register HCA ownership directly via rhinestoneAccount.sendTransaction()
+  // Uses the live rhinestoneAccount instance (same pattern as standalone debug app)
+  // instead of routing through the transactionManager to avoid indirection issues.
   if (registerHCA && !isHCARegistrationDisabled()) {
-    const signer: RhinestoneSigner = {
-      type: 'rhinestone' as const,
-      // Rhinestone account types can come from different package instances
-      // across workspace boundaries. We intentionally adapt via `unknown`
-      // to the transaction-manager signer contract while keeping runtime shape.
-      account: rhinestoneAccount as unknown as RhinestoneSigner['account'],
-      config: {
-        chain: customSepolia,
-        accountAddress,
-        rhinestoneApiKey: apiKey,
-        defaultInfra: infrastructure,
-      },
-    }
-
-    const result = await registerHCAOwnership({
-      smartAccountAddress: accountAddress,
-      eoaAddress,
-      signer,
-      publicClient,
-    })
-
-    if (result.isErr()) {
-      throw new Error(
-        `HCA registration failed: ${result.error.reason} - ${result.error.details}`,
-      )
-    }
-
-    console.log('✅ HCA registration result:', result.value)
+    const currentOwner = await publicClient.readContract({
+      address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
+      abi: HCA_FACTORY_ABI,
+      functionName: 'getAccountOwner',
+      args: [accountAddress],
+    })
+
+    if (currentOwner.toLowerCase() === eoaAddress.toLowerCase()) {
+      console.log('✅ [RHINESTONE] HCA ownership already registered to this EOA')
+    } else if (currentOwner !== zeroAddress) {
+      throw new Error(
+        `HCA already registered to a different owner: ${currentOwner}`,
+      )
+    } else {
+      const data = encodeFunctionData({
+        abi: HCA_FACTORY_ABI,
+        functionName: 'setAccountOwner',
+        args: [accountAddress, eoaAddress],
+      })
+
+      console.log(
+        '🔐 [RHINESTONE] Registering HCA ownership via direct sendTransaction...',
+        {
+          smartAccount: accountAddress,
+          eoaOwner: eoaAddress,
+          hcaFactory: ENS_SEPOLIA_CONTRACTS.HCAFactory,
+        },
+      )
+
+      const tx = await rhinestoneAccount.sendTransaction({
+        sourceChains: [customSepolia],
+        targetChain: customSepolia,
+        sponsored: true,
+        calls: [
+          {
+            to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
+            data,
+            value: 0n,
+          },
+        ],
+      })
+
+      await rhinestoneAccount.waitForExecution(tx, false)
+      console.log('✅ [RHINESTONE] HCA ownership registered successfully')
+    }
   } else if (registerHCA) {
     console.warn(
       '⚠️ [RHINESTONE] Skipping HCA registration because VITE_FF_DISABLE_HCA_REGISTRATION=true',
```

## Fix 2: bigint-safe EIP-712 signing

### Why

The actual issue was not the session payload shape itself. The problem was that raw `bigint` values like `expires = maxUint256` were reaching `signTypedData(...)` without being serialized first.

### Update `src/lib/smart-account/utils.ts`

This makes the local `walletClientToAccount(...)` behave safely, like the Para wrapper already does.

```diff
--- a/apps/manager/src/lib/smart-account/utils.ts
+++ b/apps/manager/src/lib/smart-account/utils.ts
@@
     >(
       parameters: HashTypedDataParameters<typedData, primaryType>,
     ): Promise<Hex> {
       const def = parameters as unknown as TypedDataDefinition<
         typedData,
         primaryType
       >
+      const serializedTypedData: TypedDataDefinition<typedData, primaryType> = {
+        ...def,
+        message: convertBigIntsToStrings(def.message) as Record<
+          string,
+          unknown
+        >,
+      }
       const signature = (walletClient as any).signTypedData({
         account: address,
-        ...def,
+        ...serializedTypedData,
       })
       return signature
     },
```

If you want the exact replacement instead of a diff hunk, use this full function:

```ts
export function walletClientToAccount(walletClient: WalletClient): Account {
  const address = walletClient.account?.address as Address | undefined

  if (!address) {
    throw new WalletClientNoConnectedAccountError()
  }

  const account = {
    address,
    async signMessage({
      message,
    }: {
      message: Parameters<WalletClient['signMessage']>[0]['message']
    }): Promise<Hex> {
      return walletClient.signMessage({ account: address, message })
    },
    async signTypedData<
      typedData extends TypedData | Record<string, unknown> = TypedData,
      primaryType extends keyof typedData | 'EIP712Domain' = keyof typedData,
    >(
      parameters: HashTypedDataParameters<typedData, primaryType>,
    ): Promise<Hex> {
      const def = parameters as unknown as TypedDataDefinition<
        typedData,
        primaryType
      >
      const serializedTypedData: TypedDataDefinition<typedData, primaryType> = {
        ...def,
        message: convertBigIntsToStrings(def.message) as Record<
          string,
          unknown
        >,
      }
      const signature = (walletClient as any).signTypedData({
        account: address,
        ...serializedTypedData,
      })
      return signature
    },
    async signTransaction(transaction: any): Promise<Hex> {
      return (walletClient as any).signTransaction({
        account: address,
        ...transaction,
      })
    },
  } as unknown as Account

  return account
}
```

### Important import change already included above

`rhinestone.ts` must use:

```ts
import { walletClientToAccount, wrapParaAccount } from './utils'
```

and not the wrapper exports from `@rhinestone/sdk`.

## Fix 3: add the session normalization helper to `utils.ts`

### Why

This branch does not have the helper file that normalizes unsafe numeric values in the session enable payload before signing.

### Add this helper to `src/lib/smart-account/utils.ts`

Add this exported helper to `utils.ts`:

```ts
/**
 * Debug helpers for Rhinestone smart-session enablement (EIP-712 + enable tx).
 * - Verbose logs: dev build (`import.meta.env.DEV`) or `VITE_DEBUG_RHINESTONE_SESSION=true`
 * - `debugger` breakpoints: only when `VITE_DEBUG_RHINESTONE_SESSION=true`
 */

import { maxUint256 } from 'viem'
import type { Hex } from 'viem'

/** 2^256 — invalid as uint256 (max is 2^256-1). */
const TWO_POW_256 = 2n ** 256n

/**
 * Ensures EIP-712 `message` uses bigint for uint256/uint64 fields before MetaMask.
 * Some stacks coerce `maxUint256` to JS number → precision loss →
 * Keyring encodes 2^256 instead of 2^256-1.
 *
 * Mutates `sessionDetails.data.message` in place when needed.
 */
export function normalizeSessionDetailsForEip712Signing(sessionDetails: {
  readonly nonces: readonly bigint[]
  readonly hashesAndChainIds: readonly { chainId: bigint; sessionDigest: Hex }[]
  readonly data: { message?: unknown }
}): void {
  const msg = sessionDetails.data.message
  if (msg === null || msg === undefined || typeof msg !== 'object') {
    return
  }

  const message = msg as {
    sessionsAndChainIds?: Array<{
      chainId?: unknown
      session?: {
        expires?: unknown
        nonce?: unknown
        [key: string]: unknown
      }
    }>
  }

  const rows = message.sessionsAndChainIds
  if (!rows?.length) return

  rows.forEach((row, i) => {
    const digestRow = sessionDetails.hashesAndChainIds[i]
    const nonceFromRpc = sessionDetails.nonces[i]

    row.chainId = toChainSessionUint64(row.chainId, digestRow?.chainId)

    const sess = row.session
    if (!sess) return

    sess.expires = toSignedSessionExpires(sess.expires)
    sess.nonce = toSignedSessionNonce(sess.nonce, nonceFromRpc)
  })
}

function toChainSessionUint64(
  value: unknown,
  fallback: bigint | undefined,
): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value)
  }
  if (fallback !== undefined) return fallback
  return 0n
}

/** SDK uses viem `maxUint256` for session `expires` in getSignedSession. */
function toSignedSessionExpires(value: unknown): bigint {
  if (typeof value === 'bigint') {
    if (value === TWO_POW_256) return maxUint256
    return value
  }
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      return maxUint256
    }
    return BigInt(value)
  }
  return maxUint256
}

function toSignedSessionNonce(
  value: unknown,
  fallback: bigint | undefined,
): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return BigInt(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value)
  }
  if (fallback !== undefined) return fallback
  return 0n
}
```

## Fix 4: normalize session details before signing

### Update `src/lib/smart-account/sessions/rhinestone-session.ts`

This change imports the helper, normalizes the session payload before `experimental_signEnableSession(...)`, and aligns the enable transaction call shape with the working branch.

```diff
--- a/apps/manager/src/lib/smart-account/sessions/rhinestone-session.ts
+++ b/apps/manager/src/lib/smart-account/sessions/rhinestone-session.ts
@@
 import type { RhinestoneAccount, Session } from '@rhinestone/sdk'
 import { experimental_enableSession } from '@rhinestone/sdk/actions/smart-sessions'
 import { fromPromise, type ResultAsync } from 'neverthrow'
 import type { Address, Chain, Hex } from 'viem'
 import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
+import { normalizeSessionDetailsForEip712Signing } from '../utils'
 import type { RhinestoneStoredSession } from './types'
 import { SessionError } from './zerodev-session'
@@
-      // 4. Sign enablement (one-time owner signature)
+      // Some wallet paths corrupt huge uint256 values unless we normalize first.
+      normalizeSessionDetailsForEip712Signing(sessionDetails)
+
+      // 4. Sign enablement (one-time owner signature)
       const enableSignature =
         await rhinestoneAccount.experimental_signEnableSession(sessionDetails)
@@
         const enableCall = experimental_enableSession(
           sdkSession,
           enableSignature,
           sessionDetails.hashesAndChainIds,
           sessionToEnableIndex,
         )
         const enableTransaction = await rhinestoneAccount.sendTransaction({
-          chain,
+          sourceChains: [chain],
+          targetChain: chain,
           calls: [enableCall],
           sponsored: true,
         })
```

## Fix 5: test updates

These test changes are part of the replay. Do not skip them.

### Update `src/lib/smart-account/utils.test.ts`

```diff
--- a/apps/manager/src/lib/smart-account/utils.test.ts
+++ b/apps/manager/src/lib/smart-account/utils.test.ts
@@
   it('routes signTypedData through the wallet client', async () => {
@@
     expect(signature).toBe(expectedSignature)
     expect(walletClient.signTypedData).toHaveBeenCalledWith({
       account: '0x1234567890123456789012345678901234567890',
       ...typedData,
+      message: { value: '123' },
+    })
+  })
+
+  it('converts nested BigInt values in signTypedData payloads to strings', async () => {
+    const expectedSignature =
+      '0xsignature123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890' as Hex
+    const walletClient = {
+      account: {
+        address: '0x1234567890123456789012345678901234567890' as const,
+      },
+      signMessage: vi.fn(),
+      signTypedData: vi.fn().mockResolvedValue(expectedSignature),
+      signTransaction: vi.fn(),
+    }
+
+    const account = walletClientToAccount(walletClient as any)
+
+    const typedData = {
+      domain: { name: 'SmartSessionEmissary', version: '1' },
+      types: {
+        SignedSession: [
+          { name: 'expires', type: 'uint256' },
+          { name: 'nonce', type: 'uint256' },
+        ],
+        ChainSession: [
+          { name: 'chainId', type: 'uint64' },
+          { name: 'session', type: 'SignedSession' },
+        ],
+        MultiChainSession: [
+          { name: 'sessionsAndChainIds', type: 'ChainSession[]' },
+        ],
+      },
+      primaryType: 'MultiChainSession' as const,
+      message: {
+        sessionsAndChainIds: [
+          {
+            chainId: 11155111n,
+            session: {
+              expires:
+                115792089237316195423570985008687907853269984665640564039457584007913129639935n,
+              nonce: 9n,
+            },
+          },
+        ],
+      },
+    }
+
+    await account.signTypedData?.(typedData as any)
+
+    expect(walletClient.signTypedData).toHaveBeenCalledWith({
+      account: '0x1234567890123456789012345678901234567890',
+      ...typedData,
+      message: {
+        sessionsAndChainIds: [
+          {
+            chainId: '11155111',
+            session: {
+              expires:
+                '115792089237316195423570985008687907853269984665640564039457584007913129639935',
+              nonce: '9',
+            },
+          },
+        ],
+      },
     })
   })
```

### Update `src/lib/smart-account/sessions/rhinestone-session.test.ts`

```diff
--- a/apps/manager/src/lib/smart-account/sessions/rhinestone-session.test.ts
+++ b/apps/manager/src/lib/smart-account/sessions/rhinestone-session.test.ts
@@
-import type { Address, Chain, Hex } from 'viem'
+import type { Address, Chain, Hex } from 'viem'
+import { maxUint256 } from 'viem'
@@
-import type { RhinestoneStoredSession } from './types'
+import type { RhinestoneStoredSession } from './types'
+import { normalizeSessionDetailsForEip712Signing } from '../utils'
 import { SessionError } from './zerodev-session'
@@
+    it('calls experimental_signEnableSession like rhinestone-browser-debug', async () => {
+      const mockAccount = createMockRhinestoneAccount()
+
+      await createRhinestoneSession({
+        ownerAddress: OWNER_ADDRESS,
+        smartAccountAddress: ACCOUNT_ADDRESS,
+        chainId: 11155111,
+        rhinestoneAccount: mockAccount,
+        chain: MOCK_CHAIN,
+      })
+
+      expect(mockAccount.experimental_signEnableSession).toHaveBeenCalledTimes(1)
+    })
+
@@
       expect(mockAccount.sendTransaction).toHaveBeenCalledWith(
         expect.objectContaining({
-          chain: MOCK_CHAIN,
+          sourceChains: [MOCK_CHAIN],
+          targetChain: MOCK_CHAIN,
           sponsored: true,
           calls: expect.any(Array),
         }),
       )
@@
 })
+
+describe('normalizeSessionDetailsForEip712Signing', () => {
+  it('replaces unsafe JS number expires with maxUint256 (Para / float corruption)', () => {
+    const details = {
+      nonces: [9n],
+      hashesAndChainIds: [
+        { chainId: 11155111n, sessionDigest: '0xdigest' as Hex },
+      ],
+      data: {
+        message: {
+          sessionsAndChainIds: [
+            {
+              chainId: 11155111,
+              session: {
+                expires: 1.157920892373162e77 as number,
+                nonce: 9,
+              },
+            },
+          ],
+        },
+      },
+    }
+
+    normalizeSessionDetailsForEip712Signing(details)
+
+    const [row] = (
+      details.data.message as unknown as {
+        sessionsAndChainIds: Array<{
+          session: { expires: bigint; nonce: bigint }
+        }>
+      }
+    ).sessionsAndChainIds
+
+    expect(row).toBeDefined()
+    const sess = row!.session
+
+    expect(sess.expires).toBe(maxUint256)
+    expect(sess.nonce).toBe(9n)
+  })
+})
```

### Update `src/lib/smart-account/rhinestone.test.ts`

This file needs to stop testing `registerHCAOwnership(...)` and instead test the direct Rhinestone path.

#### 1. Replace the SDK mock and add a local utils mock

```diff
--- a/apps/manager/src/lib/smart-account/rhinestone.test.ts
+++ b/apps/manager/src/lib/smart-account/rhinestone.test.ts
@@
 // Mock RhinestoneSDK
+const mockRhinestoneAccount = {
+  getAddress: () => '0xSmartAccountAddress123456789012345678901234' as const,
+  isDeployed: vi.fn().mockResolvedValue(true),
+  deploy: vi.fn().mockResolvedValue(true),
+  sendTransaction: vi.fn().mockResolvedValue('mock-hca-tx'),
+  waitForExecution: vi.fn().mockResolvedValue({ fill: { hash: '0x01' } }),
+}
+
 vi.mock('@rhinestone/sdk', () => ({
   RhinestoneSDK: vi.fn().mockImplementation(() => ({
-    createAccount: vi.fn().mockResolvedValue({
-      getAddress: () =>
-        '0xSmartAccountAddress123456789012345678901234' as const,
-      isDeployed: vi.fn().mockResolvedValue(true),
-      deploy: vi.fn().mockResolvedValue(true),
-    }),
-  })),
-  walletClientToAccount: vi.fn().mockReturnValue({
-    address: '0xOwnerAddress12345678901234567890123456789' as const,
-    signMessage: vi.fn(),
-    signTypedData: vi.fn(),
-  }),
-  wrapParaAccount: vi.fn().mockReturnValue({
-    address: '0xOwnerAddress12345678901234567890123456789' as const,
-    signMessage: vi.fn(),
-    signTypedData: vi.fn(),
+    createAccount: vi.fn().mockResolvedValue(mockRhinestoneAccount),
   }),
 }))
+
+vi.mock('./utils', () => ({
+  walletClientToAccount: vi.fn().mockReturnValue({
+    address: '0xOwnerAddress12345678901234567890123456789' as const,
+    signMessage: vi.fn(),
+    signTypedData: vi.fn(),
+  }),
+  wrapParaAccount: vi.fn().mockReturnValue({
+    address: '0xOwnerAddress12345678901234567890123456789' as const,
+    signMessage: vi.fn(),
+    signTypedData: vi.fn(),
+  }),
+}))
@@
   publicClient: {
     chain: { id: 11155111 },
-    readContract: vi.fn(),
+    readContract: vi.fn().mockResolvedValue(
+      '0x0000000000000000000000000000000000000000',
+    ),
   },
 }))
-
-// Mock HCA registry
-vi.mock('./hca-registry', () => ({
-  registerHCAOwnership: vi.fn().mockResolvedValue({
-    isOk: () => true,
-    isErr: () => false,
-    value: { status: 'already_registered' },
-  }),
-}))
```

#### 2. Replace imports

```diff
--- a/apps/manager/src/lib/smart-account/rhinestone.test.ts
+++ b/apps/manager/src/lib/smart-account/rhinestone.test.ts
@@
-import {
-  RhinestoneSDK,
-  walletClientToAccount,
-  wrapParaAccount,
-} from '@rhinestone/sdk'
+import { RhinestoneSDK } from '@rhinestone/sdk'
+import { publicClient } from '@/lib/wagmi'
+
+import { walletClientToAccount, wrapParaAccount } from './utils'
@@
-import { registerHCAOwnership } from './hca-registry'
 import {
   initializeRhinestoneAccount,
   type RhinestoneConfig,
 } from './rhinestone'
```

#### 3. Replace HCA-specific expectations

Replace this test:

```ts
it('creates a Rhinestone account with HCA type and registers ownership', async () => {
  const result = await initializeRhinestoneAccount({
    walletClient: mockWalletClient,
    accountType: 'hca',
  })

  expect(result.config.accountType).toBe('hca')
  expect(registerHCAOwnership).toHaveBeenCalledWith(
    expect.objectContaining({
      smartAccountAddress: '0xSmartAccountAddress123456789012345678901234',
      eoaAddress: '0xOwnerAddress12345678901234567890123456789',
      signer: expect.objectContaining({
        type: 'rhinestone',
      }),
    }),
  )
})
```

with:

```ts
it('creates a Rhinestone account with HCA type and registers ownership directly', async () => {
  const result = await initializeRhinestoneAccount({
    walletClient: mockWalletClient,
    accountType: 'hca',
  })

  expect(result.config.accountType).toBe('hca')
  expect(publicClient.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      functionName: 'getAccountOwner',
      args: ['0xSmartAccountAddress123456789012345678901234'],
    }),
  )
  expect(mockRhinestoneAccount.sendTransaction).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceChains: [expect.objectContaining({ id: 11155111 })],
      targetChain: expect.objectContaining({ id: 11155111 }),
      sponsored: true,
      calls: expect.any(Array),
    }),
  )
  expect(mockRhinestoneAccount.waitForExecution).toHaveBeenCalledWith(
    'mock-hca-tx',
    false,
  )
})
```

Replace:

```ts
expect(registerHCAOwnership).not.toHaveBeenCalled()
```

with:

```ts
expect(mockRhinestoneAccount.sendTransaction).not.toHaveBeenCalled()
```

for both:

- `does not register HCA ownership for simple account type`
- `respects explicit registerHCA=false for HCA account type`

Replace the failure test:

```ts
it('throws error when HCA registration fails', async () => {
  vi.mocked(registerHCAOwnership).mockResolvedValueOnce({
    isOk: () => false,
    isErr: () => true,
    error: {
      reason: 'registration_failed',
      details: 'Transaction reverted',
    },
  } as any)

  await expect(
    initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      accountType: 'hca',
    }),
  ).rejects.toThrow('HCA registration failed')
})
```

with:

```ts
it('throws error when HCA is already registered to a different owner', async () => {
  vi.mocked(publicClient.readContract).mockResolvedValueOnce(
    '0x9999999999999999999999999999999999999999',
  )

  await expect(
    initializeRhinestoneAccount({
      walletClient: mockWalletClient,
      accountType: 'hca',
    }),
  ).rejects.toThrow('HCA already registered to a different owner')
})
```

Remove the old signer-config test tied to `registerHCAOwnership(...)` and replace it with:

```ts
it('skips direct registration when HCA is already registered to the same EOA', async () => {
  vi.mocked(publicClient.readContract).mockResolvedValueOnce(
    '0xOwnerAddress12345678901234567890123456789',
  )

  await initializeRhinestoneAccount({
    walletClient: mockWalletClient,
    accountType: 'hca',
  })

  expect(mockRhinestoneAccount.sendTransaction).not.toHaveBeenCalled()
  expect(mockRhinestoneAccount.waitForExecution).not.toHaveBeenCalled()
})
```

## Phase 2: fix tx-manager for HCA registration

This is still a follow-up task after the workaround lands.

### Goal

Make HCA registration work again through `tx-manager`, so the direct `rhinestoneAccount.sendTransaction(...)` workaround can be removed.

### What to investigate

1. Compare the working direct payload vs the failing `tx-manager` payload for the same `setAccountOwner(...)` call.
2. Confirm where the failure happens:
   preparation,
   intent build,
   simulation,
   signing,
   or submission.
3. Check whether the Rhinestone signer shape or infra config is being mutated on the `tx-manager` path.
4. Check whether sponsored settings, chain routing, or call formatting differ from the direct working path.
5. Once fixed, switch `rhinestone.ts` back to `registerHCAOwnership(...)` and add regression coverage.
