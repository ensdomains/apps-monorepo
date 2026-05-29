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
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { RhinestoneSDK } from '@rhinestone/sdk'
import { type Account, type Address, type Chain, zeroAddress } from 'viem'

/**
 * Infrastructure for routing smart-account transactions. Mirrors the
 * type exported by `@ens-apps/transaction-manager` — kept local here so
 * the package doesn't have to take a workspace dep just for one union.
 */
export type SmartAccountInfrastructure = 'warp'

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
 *   - `deploying` — the SCA is not yet on-chain; we're sending the
 *     bootstrap user-op that deploys it.
 *   - `registering` — handing control to the caller's `onAccountReady`
 *     hook for post-deploy work (e.g. HCA ownership registration).
 *     Only emitted when `onAccountReady` is provided.
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

  /** Override the Rhinestone orchestrator endpoint (e.g. for local dev). */
  readonly rhinestoneEndpointUrl?: string

  /** Per-chain RPC overrides for the SDK. */
  readonly rhinestoneCustomRpcUrls?: Record<number, string>

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
    rhinestoneEndpointUrl,
    rhinestoneCustomRpcUrls,
    onAccountReady,
    onProgress,
    onError,
  } = params

  if (!rhinestoneApiKey) {
    throw new Error('rhinestoneApiKey is required')
  }

  const sdkOptions: ConstructorParameters<typeof RhinestoneSDK>[0] = {
    apiKey: rhinestoneApiKey,
    ...(rhinestoneEndpointUrl && { endpointUrl: rhinestoneEndpointUrl }),
    ...(rhinestoneCustomRpcUrls && { customRpcUrls: rhinestoneCustomRpcUrls }),
  }

  const sdk = new RhinestoneSDK(sdkOptions)

  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa' as const,
      accounts: [ownerAccount],
    },
    experimental_sessions: { enabled: true },
  })

  const accountAddress = rhinestoneAccount.getAddress() as Address

  // SCA must be on-chain before routing real txs through it. A bare
  // `.deploy()` 422s the intents path with ZERO_BALANCE because the
  // tokenRequests array is empty; deploying via a noop call works
  // (confirmed with Rhinestone). Per call: keep this in sync with
  // their guidance.
  let wasDeployedInThisCall = false
  const deployed = await rhinestoneAccount.isDeployed(chain)
  if (!deployed) {
    onProgress?.('deploying')
    try {
      // `sendTransaction` only submits — it does not wait for the fill
      // to land. Without an explicit `waitForExecution` here, callers'
      // `onAccountReady` hooks (e.g. HCA ownership registration in
      // manager) can race the bootstrap deploy and intermittently fail
      // on fresh wallets. Mirror the Rhinestone SDK examples and wait
      // for execution before declaring the account deployed.
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
      const wrapped = error instanceof Error ? error : new Error(String(error))
      onError?.('deploying', wrapped)
      throw wrapped
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
