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
 * Initialize a Rhinestone HCA smart account.
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

  // Deploy the HCA before routing real txs through it.
  //
  // `rhinestoneAccount.deploy()` is currently bugged (it routes an Intent
  // with empty `calls`, which the orchestrator rejects with a
  // ZERO_BALANCE 422). Instead we drive the deploy through the explicit
  // prepare → sign → submit Intent flow, encoding the factory deploy
  // payload directly into the call.
  //
  // `getInitData()` returns `{ factory, factoryData }` where `factoryData`
  // is the ABI-encoded `HCAFactory.createAccount(initData)` call (the same
  // bytes viem's `encodeFunctionData`/`encodeDeployData` would produce).
  // Executing it deploys the deterministic CREATE3 proxy at
  // `accountAddress`. This is a real, sponsored on-chain transaction — the
  // relayer pays gas, the owner signs the Intent mandate once.
  if (!(await rhinestoneAccount.isDeployed(chain))) {
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
