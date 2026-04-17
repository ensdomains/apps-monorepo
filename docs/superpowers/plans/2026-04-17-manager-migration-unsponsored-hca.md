# Manager Migration: Unsponsored HCA Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the manager-app name-migration flow from a paymaster-sponsored Kernel UserOp to an unsponsored one, so the user's connected EOA signs each batch and the smart account pays its own gas.

**Architecture:** Create a parallel "unsponsored" KernelAccountClient alongside the existing sponsored one (shared kernel account + validator + bundler, no paymaster). Expose both via `SmartAccountContext` as `signer` + `unsponsoredSigner`. Migration switches to `unsponsoredSigner` and gains a pre-flight SA ETH balance check with a typed error.

**Tech Stack:** TypeScript, React, XState, vitest + happy-dom, viem, @zerodev/sdk, permissionless (for Para-embedded), neverthrow, ts-pattern.

**Spec:** [2026-04-17-manager-migration-unsponsored-hca-design.md](../specs/2026-04-17-manager-migration-unsponsored-hca-design.md)

---

## Conventions

- All file paths are relative to the repo root `/Users/yoginth/apps-monorepo/`.
- All tests run with `pnpm --filter @ens-apps/manager test <file>` from the repo root, or `pnpm test <file>` from `apps/manager/`.
- Type check with `pnpm tsc` from `apps/manager/` (never `npx tsc`, per `CLAUDE.md`).
- Commits use Conventional Commits (`feat:`, `refactor:`, `test:`, `fix:`) — no scope prefix, no `Co-Authored-By`.
- The branch `migration-hca-try` is already checked out.

---

## Task 1: Create unsponsored Kernel client in `zerodev/kernel.ts`

**Files:**
- Modify: `apps/manager/src/lib/smart-account/zerodev/kernel.ts`

### Step 1.1 — Update `ZeroDevInitResult` to include the unsponsored client

- [ ] Replace the `ZeroDevInitResult` interface with:

```ts
export interface ZeroDevInitResult {
  /** Sponsored client — uses Pimlico paymaster */
  client: KernelAccountClient
  /** Unsponsored variant — same kernel account, no paymaster; smart account pays its own gas */
  unsponsoredClient: KernelAccountClient
  address: Address
  config: ZeroDevConfig
  /** The ECDSA validator used by the kernel account - needed for session creation */
  ecdsaValidator: KernelValidator<'ECDSAValidator'>
}
```

### Step 1.2 — Build the unsponsored client next to the sponsored one

- [ ] In `initializeZeroDevAccount`, immediately after the existing `const client = createKernelAccountClient({ ... paymaster: pimlicoClient })` block (around line 113–124), add:

```ts
  // Unsponsored variant — same kernel account + bundler, no paymaster.
  // Used by the migration flow so the smart account pays its own gas
  // and the EOA is prompted to sign each UserOp.
  const unsponsoredClient = createKernelAccountClient({
    account: kernelAccount,
    chain: customSepolia,
    bundlerTransport: http(PIMLICO_URL),
    userOperation: {
      estimateFeesPerGas: async () => {
        return (await pimlicoClient.getUserOperationGasPrice()).fast
      },
    },
  })
```

### Step 1.3 — Include the unsponsored client in the return value

- [ ] Replace the final `return { client: client as KernelAccountClient, address: accountAddress, config, ecdsaValidator }` block with:

```ts
  return {
    client: client as KernelAccountClient,
    unsponsoredClient: unsponsoredClient as KernelAccountClient,
    address: accountAddress,
    config,
    ecdsaValidator,
  }
```

### Step 1.4 — Type-check

- [ ] Run: `pnpm tsc` from `apps/manager/`
- [ ] Expected: compilation fails in `SmartAccountContext.tsx` (and possibly the test) because `unsponsoredClient` is not yet consumed — that's fine; we'll fix it in later tasks. No NEW type errors should appear inside `kernel.ts` itself.

### Step 1.5 — Commit

```bash
git add apps/manager/src/lib/smart-account/zerodev/kernel.ts
git commit -m "feat: add unsponsored kernel client to zerodev init"
```

---

## Task 2: Create unsponsored SmartAccountClient in `pimlico.ts`

**Files:**
- Modify: `apps/manager/src/lib/smart-account/pimlico.ts`

### Step 2.1 — Update `PimlicoInitResult` to include the unsponsored client

- [ ] Replace the `PimlicoInitResult` interface with:

```ts
export interface PimlicoInitResult {
  /** Sponsored client — uses Pimlico paymaster */
  client: SmartAccountClient
  /** Unsponsored variant — same smart account, no paymaster */
  unsponsoredClient: SmartAccountClient
  address: Address
  config: PimlicoConfig
  /** EOA address - the owner address for HCA accounts */
  eoaAddress?: Address | null
}
```

### Step 2.2 — Build the unsponsored client next to the sponsored one

- [ ] In `initializePimlicoAccount`, immediately after the existing `const client = createSmartAccountClient({ ... paymaster: pimlicoClient })` block (around line 100–109), add:

```ts
  // Unsponsored variant — same smart account + bundler, no paymaster.
  // Used by the migration flow so the smart account pays its own gas
  // and the EOA is prompted to sign each UserOp.
  const unsponsoredClient = createSmartAccountClient({
    account: smartAccount,
    chain: customSepolia,
    bundlerTransport: http(PIMLICO_URL),
    userOperation: {
      estimateFeesPerGas: async () =>
        (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  })
```

### Step 2.3 — Include the unsponsored client in the return value

- [ ] Replace the final `return { client, address: smartAccount.address, config, eoaAddress }` block with:

```ts
  return {
    client,
    unsponsoredClient,
    address: smartAccount.address,
    config,
    eoaAddress,
  }
```

### Step 2.4 — Type-check

- [ ] Run: `pnpm tsc` from `apps/manager/`
- [ ] Expected: same as Task 1 — no new errors inside `pimlico.ts`.

### Step 2.5 — Commit

```bash
git add apps/manager/src/lib/smart-account/pimlico.ts
git commit -m "feat: add unsponsored smart account client to pimlico init"
```

---

## Task 3: Extend types + context state to hold `unsponsoredClient` and `unsponsoredSigner`

**Files:**
- Modify: `apps/manager/src/lib/smart-account/types.ts`
- Modify: `apps/manager/src/lib/smart-account/SmartAccountContext.tsx`
- Modify: `apps/manager/src/lib/smart-account/SmartAccountContext.mocks.ts`
- Modify: `apps/manager/src/lib/smart-account/types.test.ts`

### Step 3.1 — Add `unsponsoredSigner` to `BaseAccountState`

- [ ] In `types.ts`, replace the `BaseAccountState` interface's `signer: Signer | null` line (currently the last field) with:

```ts
  signer: Signer | null
  /** Unsponsored signer — smart account pays own gas; used by the migration flow */
  unsponsoredSigner: Signer | null
```

### Step 3.2 — Add `unsponsoredClient` to `ZeroDevAccountState`

- [ ] In `types.ts`, in the `ZeroDevAccountState` interface, add `unsponsoredClient: KernelAccountClient | null` right after the existing `client: KernelAccountClient | null` field:

```ts
  /** The client - may be session client after session is created */
  client: KernelAccountClient | null
  /** Unsponsored client — paymaster omitted; used by migration flow */
  unsponsoredClient: KernelAccountClient | null
```

### Step 3.3 — Add state + setter for `unsponsoredClient` in `SmartAccountContext.tsx`

- [ ] Find the `useState` call that creates `[client, setClient] = useState<KernelAccountClient | SmartAccountClient | null>(null)` near the top of `SmartAccountContextProvider`. Add an adjacent state hook:

```ts
  const [unsponsoredClient, setUnsponsoredClient] = useState<
    KernelAccountClient | SmartAccountClient | null
  >(null)
```

(Use the exact same generic type that the existing `client` state uses — check the file; if it's narrower, match it.)

### Step 3.4 — Wire the new state in both init branches

- [ ] In the `walletSource === 'external-wallet'` branch (around line 271–296), after `setClient(result.client)` add:

```ts
        setUnsponsoredClient(result.unsponsoredClient)
```

- [ ] In the `walletSource === 'para-embedded'` branch (around line 297–326), after `setClient(result.client)` add:

```ts
        setUnsponsoredClient(result.unsponsoredClient)
```

### Step 3.5 — Build the unsponsoredSigner alongside the existing signer

- [ ] Find the `const signer: Signer | null = useMemo(() => { ... }, [...])` block around lines 376–399. Right after it, add:

```ts
  const unsponsoredSigner: Signer | null = useMemo(() => {
    if (!unsponsoredClient || !accountAddress) return null

    const pimlicoApiKey = import.meta.env.VITE_PIMLICO_API_KEY
    if (!pimlicoApiKey) {
      logger.error(
        'Pimlico API key not configured - cannot create unsponsored signer',
      )
      return null
    }

    return {
      type: 'zerodev' as const,
      account: unsponsoredClient as KernelAccountClient,
      config: {
        chain: customSepolia,
        accountAddress,
        accountType: accountConfig?.accountType,
        pimlicoApiKey,
        isSessionClient: false,
      },
    }
  }, [unsponsoredClient, accountAddress, accountConfig])
```

### Step 3.6 — Include `unsponsoredClient` and `unsponsoredSigner` in the context value

- [ ] Locate `const contextValue: SmartAccountContextValue = { ... }` at around line 432. Add two lines near the existing `client` and `signer` fields:

```ts
    client: client as KernelAccountClient | null,
    unsponsoredClient: unsponsoredClient as KernelAccountClient | null,
```

and

```ts
    signer,
    unsponsoredSigner,
```

(No other places in the file construct a context value — the initial `null` values flow through from the `useState` hooks into this same object.)

### Step 3.7a — Update the type-guard test helpers

- [ ] In `apps/manager/src/lib/smart-account/types.test.ts`, add `unsponsoredSigner: null` to `createBaseState`:

```ts
const createBaseState = () => ({
  accountAddress: null,
  isLoading: false,
  error: null,
  isConnected: false,
  walletSource: null,
  ownerAddress: null,
  stablecoinBalances: [],
  isLoadingBalances: false,
  smartAccountEthBalance: null,
  isLoadingSmartAccountEth: false,
  autoFundingMutation: {} as any,
  signer: null,
  unsponsoredSigner: null,
})
```

- [ ] In the same file, add `unsponsoredClient: null` to `createZeroDevState`:

```ts
const createZeroDevState = (
  overrides: Partial<ZeroDevAccountState> = {},
): ZeroDevAccountState => ({
  ...createBaseState(),
  type: 'zerodev',
  client: null,
  unsponsoredClient: null,
  config: null,
  session: null,
  isSessionClient: false,
  ecdsaValidator: null,
  isAccountReady: false,
  setSessionData: () => {},
  ...overrides,
})
```

### Step 3.7b — Update the mock in `SmartAccountContext.mocks.ts`

- [ ] Replace the `vi.mock('./pimlico', ...)` block with:

```ts
vi.mock('./pimlico', () => ({
  initializePimlicoAccount: vi.fn().mockResolvedValue({
    client: { account: { address: '0xSmartAccount' } },
    unsponsoredClient: { account: { address: '0xSmartAccount' } },
    address: '0xSmartAccount123456789012345678901234567890',
    config: {
      chain: { id: 11155111 },
      accountType: 'hca',
      pimlicoApiKey: 'key',
    },
    eoaAddress: '0xEOA1234567890123456789012345678901234567',
  }),
}))
```

- [ ] Replace the `vi.mock('./zerodev/kernel', ...)` block with:

```ts
vi.mock('./zerodev/kernel', () => ({
  initializeZeroDevAccount: vi.fn().mockResolvedValue({
    client: { account: { address: '0xSmartAccount' } },
    unsponsoredClient: { account: { address: '0xSmartAccount' } },
    address: '0xSmartAccount123456789012345678901234567890',
    config: {
      chain: { id: 11155111 },
      accountType: 'hca',
      kernelVersion: '3.1',
      pimlicoApiKey: 'key',
    },
    ecdsaValidator: { type: 'ECDSAValidator' },
  }),
}))
```

### Step 3.8 — Type-check

- [ ] Run: `pnpm tsc` from `apps/manager/`
- [ ] Expected: no errors. If there are errors, they're usually "Property 'unsponsoredSigner' is missing" — fix by adding `unsponsoredSigner: null` to the relevant object.

### Step 3.9 — Commit

```bash
git add apps/manager/src/lib/smart-account/types.ts \
        apps/manager/src/lib/smart-account/types.test.ts \
        apps/manager/src/lib/smart-account/SmartAccountContext.tsx \
        apps/manager/src/lib/smart-account/SmartAccountContext.mocks.ts
git commit -m "feat: expose unsponsoredSigner on smart account context"
```

---

## Task 4: Extend SmartAccountContext tests for `unsponsoredSigner`

**Files:**
- Modify: `apps/manager/src/lib/smart-account/SmartAccountContext.test.tsx`

### Step 4.1 — Add a failing test asserting `unsponsoredSigner` is created

- [ ] Inside the `describe('signer creation', ...)` block (around line 200), add a new `it` next to the existing "creates signer when client and address are available" test:

```ts
    it('creates unsponsoredSigner when client and address are available', async () => {
      vi.mocked(useWallet).mockReturnValue({
        data: { isExternal: true },
        isPending: false,
      } as any)
      vi.mocked(useWalletClient).mockReturnValue({
        data: {
          account: { address: '0xExternalWallet12345678901234567890123456' },
        },
      } as any)

      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isAccountReady).toBe(true)
      })

      expect(result.current.unsponsoredSigner).not.toBeNull()
      expect(result.current.unsponsoredSigner?.type).toBe('zerodev')
    })

    it('returns null unsponsoredSigner when not initialized', () => {
      const { result } = renderHook(() => useSmartAccountContext(), {
        wrapper: createWrapper(),
      })

      expect(result.current.unsponsoredSigner).toBeNull()
    })
```

### Step 4.2 — Run the tests

- [ ] Run: `pnpm test SmartAccountContext.test` from `apps/manager/`
- [ ] Expected: all tests PASS (Task 3's implementation already satisfies them; these assertions lock the behavior).

### Step 4.3 — Commit

```bash
git add apps/manager/src/lib/smart-account/SmartAccountContext.test.tsx
git commit -m "test: cover unsponsoredSigner creation in smart account context"
```

---

## Task 5: Add `MigrationInsufficientGasError` + `checkSmartAccountHasGas` helper (TDD)

**Files:**
- Create: `apps/manager/src/features/migration/service/migrationService.test.ts`
- Modify: `apps/manager/src/features/migration/service/migrationService.ts`

### Step 5.1 — Write the failing tests

- [ ] Create `apps/manager/src/features/migration/service/migrationService.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest'
import { parseEther } from 'viem'
import {
  checkSmartAccountHasGas,
  MIGRATION_MIN_GAS_WEI,
  MigrationInsufficientGasError,
} from './migrationService'

const makePublicClient = (balance: bigint) =>
  ({
    getBalance: vi.fn().mockResolvedValue(balance),
  }) as any

const SA_ADDRESS = '0x0000000000000000000000000000000000000001' as const

describe('MIGRATION_MIN_GAS_WEI', () => {
  it('is 0.005 ETH', () => {
    expect(MIGRATION_MIN_GAS_WEI).toBe(parseEther('0.005'))
  })
})

describe('checkSmartAccountHasGas', () => {
  it('resolves when balance exceeds the threshold', async () => {
    const publicClient = makePublicClient(parseEther('0.01'))
    await expect(
      checkSmartAccountHasGas({ publicClient, accountAddress: SA_ADDRESS }),
    ).resolves.toBeUndefined()
    expect(publicClient.getBalance).toHaveBeenCalledWith({ address: SA_ADDRESS })
  })

  it('resolves when balance is exactly at the threshold', async () => {
    const publicClient = makePublicClient(MIGRATION_MIN_GAS_WEI)
    await expect(
      checkSmartAccountHasGas({ publicClient, accountAddress: SA_ADDRESS }),
    ).resolves.toBeUndefined()
  })

  it('throws MigrationInsufficientGasError when balance is below threshold', async () => {
    const balance = parseEther('0.001')
    const publicClient = makePublicClient(balance)

    await expect(
      checkSmartAccountHasGas({ publicClient, accountAddress: SA_ADDRESS }),
    ).rejects.toMatchObject({
      _tag: 'MigrationInsufficientGasError',
      saAddress: SA_ADDRESS,
      balance,
      required: MIGRATION_MIN_GAS_WEI,
    })
  })

  it('thrown error is an instance of MigrationInsufficientGasError', async () => {
    const publicClient = makePublicClient(0n)
    let caught: unknown
    try {
      await checkSmartAccountHasGas({
        publicClient,
        accountAddress: SA_ADDRESS,
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(MigrationInsufficientGasError)
  })
})
```

### Step 5.2 — Run the tests and confirm they fail

- [ ] Run: `pnpm test migrationService.test` from `apps/manager/`
- [ ] Expected: FAIL — `checkSmartAccountHasGas`, `MIGRATION_MIN_GAS_WEI`, and `MigrationInsufficientGasError` are not yet exported.

### Step 5.3 — Add the minimum implementation

- [ ] Open `apps/manager/src/features/migration/service/migrationService.ts`. In the imports, add `parseEther` from viem:

```ts
import { parseEther, zeroAddress } from 'viem'
```

(The current line is `import { zeroAddress } from 'viem'` — merge the imports.)

- [ ] Right below the existing `class MigrationUserRejectedError extends TaggedError(...)` block, add:

```ts
class MigrationInsufficientGasError extends TaggedError(
  'MigrationInsufficientGasError',
)<{
  saAddress: Address
  balance: bigint
  required: bigint
}> {}

export { MigrationInsufficientGasError }

/**
 * Minimum ETH the smart account needs before we submit the first unsponsored
 * migration batch. Conservative upper bound for up to 50 names per batch on
 * Sepolia; revisit once we have real gas measurements.
 */
export const MIGRATION_MIN_GAS_WEI = parseEther('0.005')

export const checkSmartAccountHasGas = async (params: {
  publicClient: PublicClient
  accountAddress: Address
}): Promise<void> => {
  const { publicClient, accountAddress } = params
  const balance = await publicClient.getBalance({ address: accountAddress })
  if (balance < MIGRATION_MIN_GAS_WEI) {
    throw new MigrationInsufficientGasError({
      saAddress: accountAddress,
      balance,
      required: MIGRATION_MIN_GAS_WEI,
    })
  }
}
```

### Step 5.4 — Run the tests and confirm they pass

- [ ] Run: `pnpm test migrationService.test` from `apps/manager/`
- [ ] Expected: all 4 tests PASS.

### Step 5.5 — Commit

```bash
git add apps/manager/src/features/migration/service/migrationService.ts \
        apps/manager/src/features/migration/service/migrationService.test.ts
git commit -m "feat: add checkSmartAccountHasGas preflight for migration"
```

---

## Task 6: Integrate `checkSmartAccountHasGas` into `executeMigration`

**Files:**
- Modify: `apps/manager/src/features/migration/service/migrationService.ts`
- Modify: `apps/manager/src/features/migration/service/migrationService.test.ts`

### Step 6.1 — Write the failing integration tests

- [ ] Append to `migrationService.test.ts`:

```ts
import { executeMigration } from './migrationService'

describe('executeMigration insufficient-gas preflight', () => {
  const baseParams = () => ({
    domains: [],
    migrationOwner: SA_ADDRESS,
    defaultResolver: '0x0000000000000000000000000000000000000002' as const,
    wagmiConfig: {} as any,
    signer: { type: 'zerodev' } as any,
    accountAddress: SA_ADDRESS,
    onProgress: vi.fn(),
  })

  it('returns early (no-op) when there are no classified names', async () => {
    const publicClient = makePublicClient(0n)
    const result = await executeMigration({
      ...baseParams(),
      publicClient: publicClient as any,
    })
    expect(result.completed).toBe(0)
    // getBalance should NOT have been called because we short-circuit before preflight
    expect(publicClient.getBalance).not.toHaveBeenCalled()
  })
})
```

(We don't build a full classified-names integration test here — the early-return path gives us enough coverage that the preflight is wired correctly without a full migration mock.)

### Step 6.2 — Run the tests and confirm the new test fails if preflight ordering is wrong

- [ ] Run: `pnpm test migrationService.test` from `apps/manager/`
- [ ] Expected: this new test PASSES already (no domains means `classified.length === 0` returns early). We keep it as a regression lock.

### Step 6.3 — Add the preflight call inside `executeMigration`

- [ ] In `migrationService.ts`, locate the `executeMigration` function and its existing `const approvalHashes = await approveSCAIfNeeded(ctx, groups)` line. Add the preflight call immediately after it, before the existing `ctx.tracker.emit(...preparing migration...)` line:

```ts
  const approvalHashes = await approveSCAIfNeeded(ctx, groups)

  // Preflight: the smart account pays its own gas in the unsponsored flow,
  // so bail early with an actionable error if it's underfunded.
  await checkSmartAccountHasGas({
    publicClient,
    accountAddress,
  })

  ctx.tracker.emit(`Preparing migration for ${classified.length} name(s)`)
```

### Step 6.4 — Remove `sponsored: true` from `buildSCARequest`

- [ ] Inside `buildSCARequest`, delete the `sponsored: true,` line from the `zerodev` branch (currently line 183):

```ts
      zerodevParams: {
        calls,
      },
```

- [ ] Delete the `sponsored: true,` line from the `rhinestone-intent` branch (currently line 197):

```ts
      rhinestoneParams: {
        calls,
      },
```

### Step 6.5 — Run the tests

- [ ] Run: `pnpm test migrationService.test` from `apps/manager/`
- [ ] Expected: all 5 tests PASS.

### Step 6.6 — Type-check

- [ ] Run: `pnpm tsc` from `apps/manager/`
- [ ] Expected: no errors.

### Step 6.7 — Commit

```bash
git add apps/manager/src/features/migration/service/migrationService.ts \
        apps/manager/src/features/migration/service/migrationService.test.ts
git commit -m "feat: preflight smart account gas before migration batches"
```

---

## Task 7: Discriminated `MigrationError` type in the UI machine

**Files:**
- Modify: `apps/manager/src/features/migration/state/migrationUi.machine.ts`

### Step 7.1 — Update the `MigrationError` type

- [ ] Replace the existing `export type MigrationError = { type: 'generic'; message: string }` with:

```ts
export type MigrationError =
  | { type: 'generic'; message: string }
  | {
      type: 'insufficient-gas'
      saAddress: Address
      balance: bigint
      required: bigint
    }
```

### Step 7.2 — Import the tagged error + update the extractor

- [ ] At the top of `migrationUi.machine.ts`, add `MigrationInsufficientGasError` to the import from the service:

```ts
import {
  executeMigration,
  getMigrationStepInfo,
  MigrationInsufficientGasError,
  type MigrationProgress,
  type MigrationResult,
  type MigrationStepDescriptor,
} from '@/features/migration/service/migrationService'
```

- [ ] Replace the existing `extractErrorMessage` helper with the following `toMigrationError` helper, and update references:

```ts
const extractGenericMessage = (err: unknown): string => {
  if (!(err instanceof Error)) return String(err)

  let deepest = err
  while ('cause' in deepest && deepest.cause instanceof Error) {
    deepest = deepest.cause
  }

  const short =
    (err as unknown as Record<string, unknown>).shortMessage ??
    (deepest as unknown as Record<string, unknown>).shortMessage

  if (typeof short === 'string') return short
  if (deepest !== err && deepest.message) return deepest.message

  return err.message || 'Migration failed'
}

const toMigrationError = (err: unknown): MigrationError => {
  if (err instanceof MigrationInsufficientGasError) {
    return {
      type: 'insufficient-gas',
      saAddress: err.saAddress,
      balance: err.balance,
      required: err.required,
    }
  }
  return { type: 'generic', message: extractGenericMessage(err) }
}
```

- [ ] In the `runMigration` actor's `.catch` handler, replace:

```ts
          sendBack({
            type: 'migration.failed',
            error: { type: 'generic', message: extractErrorMessage(err) },
          })
```

with:

```ts
          sendBack({
            type: 'migration.failed',
            error: toMigrationError(err),
          })
```

### Step 7.3 — Type-check

- [ ] Run: `pnpm tsc` from `apps/manager/`
- [ ] Expected: one failure in `MigrationPage.tsx` — `formatMigrationError` references `error.message` but the union no longer guarantees that field. We fix it in Task 8.

### Step 7.4 — Commit

```bash
git add apps/manager/src/features/migration/state/migrationUi.machine.ts
git commit -m "refactor: discriminate migration error by insufficient-gas variant"
```

---

## Task 8: Switch `MigrationPage` to `unsponsoredSigner` and render the insufficient-gas error

**Files:**
- Modify: `apps/manager/src/features/migration/pages/MigrationPage.tsx`

### Step 8.1 — Swap the signer

- [ ] In `handleBeginUpgrade`, replace the guard + destructure lines with:

```ts
  const handleBeginUpgrade = useCallback(() => {
    if (
      !ownerAddress ||
      !smartAccount.unsponsoredSigner ||
      !smartAccount.accountAddress
    )
      return
    const { unsponsoredSigner, accountAddress } = smartAccount
    const selectedSet = new Set(selectedNames)
    const domains = v1Names.filter((d) => selectedSet.has(d.name))
    if (domains.length === 0) return
    uiActor.send({
      type: 'migration.start',
      domains,
      ownerAddress: ownerAddress as Address,
      signer: unsponsoredSigner,
      accountAddress: accountAddress as Address,
    })
  }, [v1Names, ownerAddress, smartAccount, selectedNames, uiActor])
```

### Step 8.2 — Replace the string error formatter with a JSX renderer

- [ ] Near the top of the file, add an import for `formatEther`:

```ts
import { type Address, formatEther } from 'viem'
```

(Merge with the existing `import type { Address } from 'viem'` so the final line is one import.)

- [ ] Replace `const formatMigrationError = (error: MigrationError) => error.message` with:

```ts
const MigrationErrorMessage = ({ error }: { error: MigrationError }) => {
  if (error.type === 'insufficient-gas') {
    return (
      <span>
        Your smart account needs at least{' '}
        <strong>{formatEther(error.required)} ETH</strong> to pay gas for this
        migration, but currently has{' '}
        <strong>{formatEther(error.balance)} ETH</strong>.
        {'\n\n'}
        Send ETH to:{'\n'}
        <span className="select-all">{error.saAddress}</span>
        {'\n\n'}
        Then hit Retry.
      </span>
    )
  }
  return <span>{error.message}</span>
}
```

### Step 8.3 — Use the renderer inside the failure `<motion.div>`

- [ ] Replace:

```tsx
              <p className="whitespace-pre-wrap break-all font-mono text-ens-garnet-900/70 text-xs leading-normal">
                {lastError && formatMigrationError(lastError)}
              </p>
```

with:

```tsx
              <p className="whitespace-pre-wrap break-all font-mono text-ens-garnet-900/70 text-xs leading-normal">
                {lastError && <MigrationErrorMessage error={lastError} />}
              </p>
```

### Step 8.4 — Type-check

- [ ] Run: `pnpm tsc` from `apps/manager/`
- [ ] Expected: no errors.

### Step 8.5 — Run the full app test suite for migration-related files

- [ ] Run: `pnpm test migrationService.test SmartAccountContext.test` from `apps/manager/`
- [ ] Expected: all tests PASS.

### Step 8.6 — Commit

```bash
git add apps/manager/src/features/migration/pages/MigrationPage.tsx
git commit -m "feat: use unsponsored signer and render gas-preflight error in migration UI"
```

---

## Task 9: Verification pass

**Files:** (no code changes)

### Step 9.1 — Full repo typecheck

- [ ] Run: `pnpm tsc` from `apps/manager/`
- [ ] Expected: no errors.

### Step 9.2 — Full manager-app test run

- [ ] Run: `pnpm test` from `apps/manager/`
- [ ] Expected: all tests PASS. If any pre-existing test breaks and the failure is unrelated to this change, note it but do not attempt to fix here.

### Step 9.3 — Lint / biome

- [ ] Run: `pnpm biome check apps/manager/src` from the repo root (or whatever the repo uses — check `package.json` scripts if unsure)
- [ ] Expected: no new warnings introduced by this change.

### Step 9.4 — Manual smoke-test checklist (cannot be automated)

- [ ] Start the manager dev server (`pnpm dev` from `apps/manager/`) and open the migration page.
- [ ] **Underfunded SA**: with a fresh SA holding 0 ETH on Sepolia, select a name, click Upgrade. The approval step still prompts the EOA. After approval, the UI lands on the `failure` state showing the SA address, 0 ETH balance, 0.005 ETH required, and a "Send ETH… then Retry" message. Retry re-runs the preflight.
- [ ] **Funded SA**: send > 0.005 ETH to the SA, click Retry. Each migration batch now triggers a wallet sign prompt (not silent). SA ETH balance drops after each batch.
- [ ] **Sponsored flows elsewhere**: verify one unrelated sponsored flow (e.g. renewal or registration) still completes silently via the paymaster — confirming we only changed migration.

### Step 9.5 — Final commit only if fixes were needed

- [ ] If Step 9.1–9.3 surfaced issues, fix them and commit as a targeted `fix: …`. Otherwise, skip.

---

## Rollback notes

Each task is a self-contained commit, so `git revert <sha>` on any of Tasks 1–8 cleanly rolls back that slice. The highest-risk commit is Task 8 (UI rewiring); reverting it alone puts migration back on the sponsored signer while leaving the unsponsored infrastructure in place (dormant but harmless).
