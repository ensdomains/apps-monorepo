/**
 * Rhinestone HCA smart-account initialization.
 *
 * Pure async function that creates a Hidden Contract Account (HCA) via
 * the Rhinestone SDK (`@rhinestone/sdk@1.7.0`), ensures it is deployed
 * on-chain, and returns the live account + config.
 *
 * HCA model (SDK 1.7.0):
 *   - `account: { type: 'hca' }` selects the audited HCA implementation
 *     (CREATE3 ERC-1967 proxy behind the ENS HCA factory).
 *   - `owners: { type: 'ens', … }` installs the ENS ownership validator
 *     at construction. The owning EOA (the connected wallet / Para
 *     account) signs every intent — there is **no smart-session path**.
 *     The SDK throws `AccountConfigurationNotSupportedError` if you pass
 *     `experimental_sessions`, `recovery`, or extra `modules` for an HCA,
 *     because the account permanently locks its module set
 *     (`installModule` reverts `NoModuleChangeAllowed()`).
 *
 * Because sessions are impossible, every ENS operation is an
 * owner-signed, relayer-sponsored Intent (gas is still sponsored — only
 * the authorization signature comes from the user).
 *
 * The caller is responsible for:
 *   - Producing a viem `Account` from whatever wallet provider it uses
 *     (Para, MetaMask, hardware, etc.). Vendor-specific signing quirks
 *     (e.g. Para's 0/1 v-byte adjustment) are NOT this package's
 *     concern — wrap before passing in.
 *   - Reading env vars / wagmi config and threading them in as named
 *     parameters.
 *   - Surfacing progress and errors to the user via the optional
 *     `onProgress` / `onError` callbacks.
 */

import type { RhinestoneAccount } from '@rhinestone/sdk'
import { RhinestoneSDK } from '@rhinestone/sdk'
import { type Account, type Address, type Chain, maxUint48 } from 'viem'

/**
 * ENS HCA owner expiration sentinel.
 *
 * `owners.ownerExpirations[i]` is a `uint48` unix timestamp after which
 * owner `i` can no longer authorize the account. We pin owners to
 * `maxUint48` ("never expires") so the account stays usable for the full
 * lifetime of the connected wallet; ENS-name-tied expiry is enforced
 * elsewhere, not at the validator level. Matches the reference HCA flow.
 */
const HCA_OWNER_NEVER_EXPIRES = Number(maxUint48)

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
 *   - `deploying` — the HCA is not yet on-chain; we're submitting the
 *     sponsored Intent that runs the factory `createAccount(initData)`
 *     deploy.
 *   - `ready` — setup complete (only emitted via `onProgress`, never
 *     `onError`). Useful for closing out a "deploying…" toast.
 */
export type InitProgressStage = 'deploying' | 'ready'

export interface InitializeRhinestoneAccountParams {
  /**
   * Pre-built viem `Account` to use as the HCA owner (installed via the
   * ENS ownership validator). The caller is responsible for wrapping
   * vendor-specific accounts (e.g. Para's MPC signatures need v-byte
   * adjustment) before passing in.
   */
  readonly ownerAccount: Account

  /**
   * EOA address that owns the HCA. Usually `ownerAccount.address` but
   * accepted explicitly so the caller doesn't have to second-guess
   * (some wrapped accounts expose only the wrapped address, not the
   * underlying EOA).
   */
  readonly eoaAddress: Address

  /** Chain the HCA lives on. */
  readonly chain: Chain

  /** Rhinestone API key. Required. */
  readonly rhinestoneApiKey: string

  /** Override the Rhinestone orchestrator endpoint (e.g. for local dev). */
  readonly rhinestoneEndpointUrl?: string

  /** Per-chain RPC overrides for the SDK. */
  readonly rhinestoneCustomRpcUrls?: Record<number, string>

  /** Progress callback for UX wiring. See `InitProgressStage`. */
  readonly onProgress?: (stage: InitProgressStage) => void

  /** Error callback for UX wiring. Re-throwing is NOT this hook's job — the function still throws after invoking it. */
  readonly onError?: (
    stage: Exclude<InitProgressStage, 'ready'>,
    error: Error,
  ) => void
}

/**
 * Create a Rhinestone HCA smart account in-memory (no on-chain deploy).
 *
 * Returns the live SDK account object, deterministic address, and
 * config. The HCA is **not** deployed on-chain — call
 * `deployRhinestoneAccountCore` later to deploy when first needed.
 *
 * This split lets callers defer the on-chain deploy to the point of
 * first use (e.g. the registration commit step), avoiding wasted gas
 * if the user never registers.
 */
export async function initializeRhinestoneAccountCore(
  params: InitializeRhinestoneAccountParams,
): Promise<RhinestoneInitResult> {
  const {
    ownerAccount,
    eoaAddress,
    chain,
    rhinestoneApiKey,
    rhinestoneEndpointUrl,
    rhinestoneCustomRpcUrls,
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
    account: { type: 'hca' },
    owners: {
      type: 'ens',
      accounts: [ownerAccount],
      ownerExpirations: [HCA_OWNER_NEVER_EXPIRES],
    },
  })

  const accountAddress = rhinestoneAccount.getAddress() as Address

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

/**
 * Deploy a Rhinestone HCA on-chain if it is not already deployed.
 *
 * Pure async function that takes an already-created `RhinestoneAccount`
 * (in-memory) and ensures the deterministic CREATE3 proxy is deployed
 * on-chain via a sponsored Intent. The account itself holds no funds —
 * gas is paid by the Rhinestone Warp relayer; only the owner signs.
 *
 * This is separated from `initializeRhinestoneAccount` so callers can
 * defer deployment to the point of first use (e.g. the registration
 * commit step), avoiding wasted gas if the user never registers.
 */
export async function deployRhinestoneAccountCore(
  rhinestoneAccount: RhinestoneAccount,
  chain: Chain,
  onProgress?: (stage: 'deploying' | 'ready') => void,
  onError?: (stage: 'deploying', error: Error) => void,
): Promise<void> {
  if (await rhinestoneAccount.isDeployed(chain)) {
    onProgress?.('ready')
    return
  }

  onProgress?.('deploying')
  try {
    const { factory, factoryData } = rhinestoneAccount.getInitData()

    const prepared = await rhinestoneAccount.prepareTransaction({
      chain,
      sponsored: true,
      calls: [
        {
          to: factory,
          value: 0n,
          data: factoryData,
        },
      ],
    })
    const signed = await rhinestoneAccount.signTransaction(prepared)
    const result = await rhinestoneAccount.submitTransaction(signed)

    // `submitTransaction` only submits — it does not wait for the fill
    // to land. Wait for execution so callers can treat a resolved
    // promise as "the HCA is on-chain".
    await rhinestoneAccount.waitForExecution(result)
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error))
    onError?.('deploying', wrapped)
    throw wrapped
  }

  onProgress?.('ready')
}

/**
 * Initialize a Rhinestone HCA smart account.
 *
 * Creates the in-memory SDK account and deploys it on-chain in a single
 * call. For lazy deployment (skip deploy at init, deploy later on first
 * use), call `initializeRhinestoneAccountCore` + `deployRhinestoneAccountCore`
 * separately.
 *
 * @throws when the SDK fails or the bootstrap deploy Intent fails.
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
    onProgress,
    onError,
  } = params

  if (!rhinestoneApiKey) {
    throw new Error('rhinestoneApiKey is required')
  }

  // Gas sponsorship for the HCA is handled by the Rhinestone Warp
  // orchestrator (intent-based, relayer-funded). We deliberately do not
  // configure an ERC-4337 bundler (Pimlico) here — HCA operations route
  // through sponsored Intents, not bundled UserOps.
  const sdkOptions: ConstructorParameters<typeof RhinestoneSDK>[0] = {
    apiKey: rhinestoneApiKey,
    ...(rhinestoneEndpointUrl && { endpointUrl: rhinestoneEndpointUrl }),
    ...(rhinestoneCustomRpcUrls && { customRpcUrls: rhinestoneCustomRpcUrls }),
  }

  const sdk = new RhinestoneSDK(sdkOptions)

  // Native HCA account: the ENS ownership validator is installed at
  // construction by the factory. No `experimental_sessions` — the SDK
  // rejects it for HCA accounts (the module set is permanently locked).
  const rhinestoneAccount = await sdk.createAccount({
    account: { type: 'hca' },
    owners: {
      type: 'ens',
      accounts: [ownerAccount],
      ownerExpirations: [HCA_OWNER_NEVER_EXPIRES],
    },
  })

  const accountAddress = rhinestoneAccount.getAddress() as Address

  // Deploy the HCA on-chain.
  await deployRhinestoneAccountCore(
    rhinestoneAccount,
    chain,
    onProgress,
    onError,
  )

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
