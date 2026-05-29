/**
 * Rhinestone smart-account initialization.
 *
 * Pure async function that creates a `RhinestoneAccount` via the SDK
 * and binds it to a caller-chosen on-chain address.
 *
 * The caller is responsible for:
 *   - Producing a viem `Account` from whatever wallet provider it uses
 *     (Para, MetaMask, hardware, etc.). Vendor-specific signing quirks
 *     (e.g. Para's 0/1 v-byte adjustment) are NOT this package's
 *     concern — wrap before passing in.
 *   - Reading env vars / wagmi config and threading them in as named
 *     parameters.
 *   - Putting the SCA on chain at a known address via
 *     `onPrepareDeploy`. The manager uses `bootstrapHCA` from this
 *     package to deploy the HCA proxy at
 *     `HCAFactory.computeAccountAddress(eoa)` and return that address.
 *   - Surfacing progress and errors to the user. We invoke optional
 *     `onProgress` / `onError` callbacks at well-defined points; the
 *     caller decides whether that becomes a toast, a banner, or
 *     nothing at all.
 *
 * The `infrastructure` parameter is only used to validate that
 * `pimlicoApiKey` is provided when the caller intends to use the
 * ERC-4337 bundler path. The Rhinestone Warp orchestrator (default,
 * intent-based gas sponsorship) does not need Pimlico.
 *
 * No legacy / fallback deploy path: every caller MUST supply
 * `onPrepareDeploy`. The previous "SDK-driven Warp no-op deploy" branch
 * existed only for callers that didn't need HCA-equivalent addressing;
 * no such caller remains. Skipping bootstrap would produce a
 * Rhinestone-derived Nexus CREATE2 address that the ENS protocol
 * cannot resolve as HCA-equivalent to the EOA — see
 * `apps/manager/src/lib/smart-account/hca-bootstrap.ts` (now
 * `./bootstrap.ts`) for the full diagnosis.
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { RhinestoneSDK } from '@rhinestone/sdk'
import type { Account, Address, Chain } from 'viem'

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
 *   - `deploying` — the SCA is not yet on-chain; the caller's
 *     `onPrepareDeploy` is putting it there. The hook owns the actual
 *     deploy transport (typically an EOA-signed, sponsored Rhinestone
 *     Intent against `HCAFactory.createAccount`).
 *   - `ready` — setup complete (only emitted via `onProgress`, never
 *     `onError`). Useful for closing out a "deploying…" toast.
 */
export type InitProgressStage = 'deploying' | 'ready'

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
   * Required. Without a bound address, the SDK would derive its own
   * Nexus CREATE2 address that the ENS protocol cannot resolve as
   * HCA-equivalent to the EOA.
   *
   * Errors thrown from `onPrepareDeploy` propagate out of
   * `initializeRhinestoneAccount` and cause `onError('deploying', ...)`
   * to be emitted.
   */
  readonly onPrepareDeploy: (input: { eoaAddress: Address }) => Promise<{
    /** The address the SDK should bind to (must be deployed by hook return). */
    hcaAddress: Address
    /**
     * Whether the hook actually deployed the SCA in this call (true)
     * or whether it was already on chain from a previous bootstrap
     * (false). Not currently used here but threaded back to the
     * caller's progress callbacks at the manager layer.
     */
    wasDeployedInThisCall: boolean
  }>

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
 * @throws when the SDK fails or `onPrepareDeploy` throws.
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

  // Phase 1 — Put the SCA on chain.
  //
  // `onPrepareDeploy` is the authoritative deploy path. The hook
  // typically calls `bootstrapHCA` from this package to put the HCA
  // proxy on chain at `HCAFactory.computeAccountAddress(eoa)`, which
  // also writes `_hcaOwners[hca] = eoa` atomically. The address it
  // returns is what the SDK will bind to in phase 2.
  onProgress?.('deploying')
  let precomputedAddress: Address
  try {
    const result = await onPrepareDeploy({ eoaAddress })
    precomputedAddress = result.hcaAddress
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error))
    onError?.('deploying', wrapped)
    throw wrapped
  }

  // Phase 2 — Build the `RhinestoneAccount` bound to the precomputed
  // address.
  //
  // `initData: { address }` tells the SDK to skip its
  // CREATE2-over-Nexus address derivation entirely and bind to the
  // address we picked. See `@rhinestone/sdk@1.6.5/src/accounts/nexus.ts:getAddress`
  // — the `if (config.initData?.address) return config.initData.address`
  // branch is what makes this work. Same applies to `getInitCode`.
  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa' as const,
      accounts: [ownerAccount],
    },
    experimental_sessions: { enabled: true },
    initData: { address: precomputedAddress },
  })

  const accountAddress = rhinestoneAccount.getAddress() as Address

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
