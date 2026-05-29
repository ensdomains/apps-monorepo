/**
 * Rhinestone smart-account initialization.
 *
 * Pure async function that creates a `RhinestoneAccount` via the SDK,
 * ensures it is deployed on-chain, and returns the live account + config.
 *
 * The caller is responsible for:
 *   - Producing a viem `Account` from whatever wallet provider it uses
 *     (Para, MetaMask, hardware, etc.). Vendor-specific signing quirks
 *     (e.g. Para's 0/1 v-byte adjustment) are NOT this package's
 *     concern — wrap before passing in.
 *   - Reading env vars / wagmi config and threading them in as named
 *     parameters.
 *   - Surfacing progress and errors to the user. We invoke optional
 *     `onProgress` / `onError` callbacks at well-defined points; the
 *     caller decides whether that becomes a toast, a banner, or
 *     nothing at all.
 *   - Any post-deploy on-chain work (HCA ownership registration,
 *     module installs, etc.) via the `onAccountReady` hook.
 *
 * The `infrastructure` parameter is only used to validate that
 * `pimlicoApiKey` is provided when the caller intends to use the
 * ERC-4337 bundler path. The Rhinestone Warp orchestrator (default,
 * intent-based gas sponsorship) does not need Pimlico.
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { RhinestoneSDK } from '@rhinestone/sdk'
import { type Account, type Address, type Chain, zeroAddress } from 'viem'

/**
 * Infrastructure for routing smart-account transactions. Mirrors the
 * type exported by `@ens-apps/transaction-manager` — kept local here so
 * the package doesn't have to take a workspace dep just for one union.
 */
export type SmartAccountInfrastructure = 'warp' | 'pimlico'

export interface RhinestoneInitConfig {
  readonly chain: Chain
  readonly rhinestoneApiKey: string
}

export interface RhinestoneInitResult {
  readonly client: RhinestoneAccount
  readonly address: Address
  readonly ownerAddress: Address
  readonly config: RhinestoneInitConfig
}

/**
 * Stage labels emitted via `onProgress` / `onError`. Stable contract —
 * callers can switch over these to drive UI copy.
 *
 *   - `deploying` — the SCA is not yet on-chain; we're putting it
 *     there. The *mechanism* depends on whether the caller wired up an
 *     `onPrepareDeploy` hook:
 *       - With `onPrepareDeploy` (the HCA path): the hook runs *before*
 *         the SDK is constructed and is responsible for deploying the
 *         SCA at a precomputed address via whatever transport the
 *         caller wants (e.g. an EOA `writeContract` against
 *         `HCAFactory.createAccount`). The SDK is then bound to that
 *         address via `initData: { address }` and its own Warp deploy
 *         path is skipped because `isDeployed(...)` already returns
 *         true. We still emit `'deploying'` so existing toast UX
 *         doesn't need to know which path is active.
 *       - Without `onPrepareDeploy` (the legacy path): we ask the SDK
 *         to send a no-op Warp Intent that deploys the SDK-derived SCA
 *         address. Retained for callers that don't need HCA-equivalent
 *         addressing.
 *   - `registering` — handing control to the caller's `onAccountReady`
 *     hook for post-deploy work (legacy). With the HCA factory this
 *     stage is effectively unused because the factory writes
 *     `_hcaOwners[hca] = eoa` atomically inside `createAccount`, so no
 *     follow-up registration tx is needed. Emitted only when
 *     `onAccountReady` is provided.
 *   - `ready` — setup complete (only emitted via `onProgress`, never
 *     `onError`). Useful for closing out a "deploying…" toast.
 */
export type InitProgressStage = 'deploying' | 'registering' | 'ready'

export interface InitializeRhinestoneAccountParams {
  /**
   * Pre-built viem `Account` to use as the SCA owner. The caller is
   * responsible for wrapping vendor-specific accounts (e.g. Para's
   * MPC signatures need v-byte adjustment) before passing in.
   */
  readonly ownerAccount: Account

  /**
   * EOA address that owns the SCA. Usually `ownerAccount.address` but
   * accepted explicitly so the caller doesn't have to second-guess
   * (some wrapped accounts expose only the wrapped address, not the
   * underlying EOA).
   */
  readonly eoaAddress: Address

  /** Chain the SCA lives on. */
  readonly chain: Chain

  /** Rhinestone API key. Required. */
  readonly rhinestoneApiKey: string

  /**
   * Pimlico API key for the ERC-4337 bundler path. Required when
   * `infrastructure === 'pimlico'`; optional otherwise (the SDK still
   * accepts it as a fallback for session-based user-ops).
   */
  readonly pimlicoApiKey?: string

  /** Override the Rhinestone orchestrator endpoint (e.g. for local dev). */
  readonly rhinestoneEndpointUrl?: string

  /** Per-chain RPC overrides for the SDK. */
  readonly rhinestoneCustomRpcUrls?: Record<number, string>

  /**
   * Hook called *before* `sdk.createAccount`. The callback owns putting
   * the SCA on chain at whatever address the caller wants — typically
   * an HCA proxy at `HCAFactory.computeAccountAddress(eoa)` — and
   * returns that address so the SDK can be bound to it via
   * `initData: { address }`.
   *
   * When this hook is provided:
   *   - The SDK's own Warp no-op deploy is skipped (the hook is the
   *     authoritative deploy path).
   *   - `accountAddress` in the result is whatever address the hook
   *     returned, *not* the SDK's CREATE2-derived Nexus address.
   *   - `onAccountReady` still fires for any post-deploy work the
   *     caller wants, but `wasDeployedInThisCall` reflects whether
   *     the hook reported a fresh deploy.
   *
   * Errors thrown from `onPrepareDeploy` propagate out of
   * `initializeRhinestoneAccount` and cause `onError('deploying', ...)`
   * to be emitted.
   */
  readonly onPrepareDeploy?: (input: { eoaAddress: Address }) => Promise<{
    /** The address the SDK should bind to (must be deployed by hook return). */
    hcaAddress: Address
    /**
     * Whether the hook actually deployed the SCA in this call (true)
     * or whether it was already on chain from a previous bootstrap
     * (false). Threaded into `onAccountReady`'s `wasDeployedInThisCall`.
     */
    wasDeployedInThisCall: boolean
  }>

  /**
   * Hook called after `sdk.createAccount` returns, before we register
   * HCA ownership or hand control back. The callback receives the
   * built RhinestoneAccount + its address + the SCA-on-chain status
   * so the caller can do its own HCA registration (or anything else
   * that needs the live account).
   *
   * Errors thrown from `onAccountReady` propagate out of
   * `initializeRhinestoneAccount` and cause `onError('registering', ...)`
   * to be emitted.
   *
   * @deprecated Under the HCA flow this hook is no-op: `HCAFactory`
   * writes ownership atomically inside `createAccount`, so the manager
   * has nothing to do after `sdk.createAccount` returns. Retained for
   * backwards compatibility with the legacy `MockHCAFactoryBasic`
   * registration path; will be removed once no caller depends on it.
   */
  readonly onAccountReady?: (input: {
    rhinestoneAccount: RhinestoneAccount
    accountAddress: Address
    /**
     * Whether the SCA was deployed in this call (true) or was already
     * deployed before we started (false). Useful for the caller to
     * decide whether to skip a no-op HCA registration.
     */
    wasDeployedInThisCall: boolean
  }) => Promise<void>

  /**
   * Caller-declared infrastructure preference. Only used to validate
   * that `pimlicoApiKey` is present when set to `'pimlico'`; the
   * actual transport selection happens later, at signer construction
   * time (see `@ens-apps/transaction-manager`).
   */
  readonly infrastructure?: SmartAccountInfrastructure

  /** Progress callback for UX wiring. See `InitProgressStage`. */
  readonly onProgress?: (stage: InitProgressStage) => void

  /** Error callback for UX wiring. Re-throwing is NOT this hook's job — the function still throws after invoking it. */
  readonly onError?: (
    stage: Exclude<InitProgressStage, 'ready'>,
    error: Error,
  ) => void
}

/**
 * Initialize a Rhinestone smart account.
 *
 * @throws when the SDK fails, the bootstrap deploy fails, or
 * `onAccountReady` throws.
 */
export async function initializeRhinestoneAccount(
  params: InitializeRhinestoneAccountParams,
): Promise<RhinestoneInitResult> {
  const {
    ownerAccount,
    eoaAddress,
    chain,
    rhinestoneApiKey,
    pimlicoApiKey,
    rhinestoneEndpointUrl,
    rhinestoneCustomRpcUrls,
    onPrepareDeploy,
    onAccountReady,
    infrastructure = 'warp',
    onProgress,
    onError,
  } = params

  if (!rhinestoneApiKey) {
    throw new Error('rhinestoneApiKey is required')
  }
  if (infrastructure === 'pimlico' && !pimlicoApiKey) {
    throw new Error(
      'pimlicoApiKey is required when infrastructure === "pimlico"',
    )
  }

  const sdkOptions: ConstructorParameters<typeof RhinestoneSDK>[0] = {
    apiKey: rhinestoneApiKey,
    ...(rhinestoneEndpointUrl && { endpointUrl: rhinestoneEndpointUrl }),
    ...(rhinestoneCustomRpcUrls && { customRpcUrls: rhinestoneCustomRpcUrls }),
    // Always include Pimlico when available. Warp (intents) doesn't need
    // it, but session-based user-ops do — see session.ts.
    ...(pimlicoApiKey && {
      bundler: { type: 'pimlico' as const, apiKey: pimlicoApiKey },
    }),
  }

  const sdk = new RhinestoneSDK(sdkOptions)

  // Phase 1 — Prepare the deploy.
  //
  // If the caller provided `onPrepareDeploy`, the SCA must exist on
  // chain at a *caller-chosen* address by the time the hook returns.
  // This is the path the manager uses to put the HCA proxy on chain at
  // `HCAFactory.computeAccountAddress(eoa)` via a plain EOA tx, which
  // also writes `_hcaOwners[hca] = eoa` atomically.
  //
  // If the caller did not provide the hook, we fall back to the legacy
  // path: let the SDK derive its own Nexus address, then deploy it via
  // a sponsored Warp Intent below. The legacy path is the only viable
  // option for non-HCA consumers of this package, of which there are
  // currently none — kept as a fallback so this change is strictly
  // additive.
  let precomputedAddress: Address | undefined
  let wasDeployedInThisCall = false
  if (onPrepareDeploy) {
    onProgress?.('deploying')
    try {
      const result = await onPrepareDeploy({ eoaAddress })
      precomputedAddress = result.hcaAddress
      wasDeployedInThisCall = result.wasDeployedInThisCall
    } catch (error) {
      const wrapped = error instanceof Error ? error : new Error(String(error))
      onError?.('deploying', wrapped)
      throw wrapped
    }
  }

  // Phase 2 — Build the `RhinestoneAccount`.
  //
  // When `precomputedAddress` is set, `initData: { address }` tells
  // the SDK to skip its CREATE2-over-Nexus address derivation entirely
  // and bind to the address we picked. See
  // `@rhinestone/sdk@1.6.5/src/accounts/nexus.ts:getAddress` — the
  // `if (config.initData?.address) return config.initData.address`
  // branch is what makes this work. Same applies to `getInitCode`.
  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa' as const,
      accounts: [ownerAccount],
    },
    experimental_sessions: { enabled: true },
    ...(precomputedAddress && {
      initData: { address: precomputedAddress },
    }),
  })

  const accountAddress = rhinestoneAccount.getAddress() as Address

  // Phase 3 — Legacy SDK-driven deploy.
  //
  // Skipped when `onPrepareDeploy` ran (the hook is the authoritative
  // deploy path; the SCA is already on chain). For legacy callers
  // without the hook, send a Warp no-op so the SDK can deploy its own
  // Nexus SCA. A bare `.deploy()` 422s the intents path with
  // ZERO_BALANCE because the tokenRequests array is empty; deploying
  // via a noop call works (confirmed with Rhinestone). Per call: keep
  // this in sync with their guidance.
  if (!onPrepareDeploy) {
    const deployed = await rhinestoneAccount.isDeployed(chain)
    if (!deployed) {
      onProgress?.('deploying')
      try {
        // `sendTransaction` only submits — it does not wait for the fill
        // to land. Without an explicit `waitForExecution` here, callers'
        // `onAccountReady` hooks can race the bootstrap deploy and
        // intermittently fail on fresh wallets. Mirror the Rhinestone
        // SDK examples and wait for execution before declaring the
        // account deployed.
        const deployTx = await rhinestoneAccount.sendTransaction({
          chain,
          calls: [
            {
              to: zeroAddress,
              value: 0n,
              data: '0x',
            },
          ],
          sponsored: true,
        })
        await rhinestoneAccount.waitForExecution(deployTx)
        wasDeployedInThisCall = true
      } catch (error) {
        const wrapped =
          error instanceof Error ? error : new Error(String(error))
        onError?.('deploying', wrapped)
        throw wrapped
      }
    }
  }

  // Hand off to the caller for any post-deploy work (HCA registration,
  // etc.). The caller decides whether to skip when the SCA was already
  // deployed.
  if (onAccountReady) {
    onProgress?.('registering')
    try {
      await onAccountReady({
        rhinestoneAccount,
        accountAddress,
        wasDeployedInThisCall,
      })
    } catch (error) {
      const wrapped = error instanceof Error ? error : new Error(String(error))
      onError?.('registering', wrapped)
      throw wrapped
    }
  }

  onProgress?.('ready')

  return {
    client: rhinestoneAccount,
    address: accountAddress,
    ownerAddress: eoaAddress,
    config: {
      chain,
      rhinestoneApiKey,
    },
  }
}
