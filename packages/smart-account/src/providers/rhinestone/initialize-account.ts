/**
 * Standalone-HCA account initialization.
 *
 * Creates (or adopts) the ENS **standalone** Hidden Contract Account via the
 * patched Rhinestone SDK (`@rhinestone/sdk@1.8.0` + the standalone-HCA patch).
 *
 * Model (per the "HCA: New" handoff doc):
 *   - `account: { type: 'hca', version: 'ens-standalone-1.1.0', … }` selects the
 *     standalone implementation (a VerifiableFactory proxy over
 *     `StandaloneHCAImplementation`, deployed by `StandaloneHCAFactory`).
 *   - `owners: { type: 'ecdsa', accounts: [walletOwner], module: validator }` —
 *     EXACTLY ONE ECDSA owner. No `ownerExpirations`, no `updateConfig`, no
 *     `type: 'ens'` (that was the old ephemeral-owner model this replaces).
 *   - `experimental_sessions: { enabled: true, module: validator }` — the
 *     standalone validator supports scoped SmartSessions (the old locked-module
 *     HCA did not).
 *   - `userSalt: 0n`. No `initData` when creating fresh; the SDK derives the HCA
 *     address from owner + implementation + salt, and the FIRST Rhinestone
 *     request deploys it. There is NO separate deploy transaction.
 *
 * Adopt-existing: if the derived address already has code, we verify
 * `owner()` + `accountId()` + `VerifiableFactory.verifyContract(...)` before
 * reusing it, and (for primary-name actions) the reverse adapter's
 * `trustedHCAImplementations`. On any mismatch we throw — we NEVER silently
 * select a different HCA.
 *
 * The caller injects the viem `Account` (Para/MetaMask/hardware wrapping is the
 * app's concern), the chain, and the Rhinestone API key + endpoint overrides.
 */

import type { RhinestoneAccount, StandaloneHcaAccount } from '@rhinestone/sdk'
import { RhinestoneSDK } from '@rhinestone/sdk'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Account,
  type Address,
  type Chain,
  getAddress,
  type PublicClient,
  parseAbi,
} from 'viem'
import { AccountInitError, AccountVerificationError } from '../../errors'
import {
  getDestinationContracts,
  ONCHAIN_ACCOUNT_ID,
  STANDALONE_HCA_VERSION,
  USER_SALT,
} from './manifest'

/** Minimal reads against the deployed standalone HCA + reverse adapter. */
const standaloneHcaAbi = parseAbi([
  'function ownerAndSessionNonce() view returns (address owner, uint96 sessionNonce)',
  'function accountId() view returns (string)',
])
const verifiableFactoryAbi = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
])
const reverseAdapterAbi = parseAbi([
  'function trustedHCAImplementations(address implementation) view returns (bool)',
])

export interface RhinestoneInitConfig {
  readonly chain: Chain
  readonly rhinestoneApiKey: string
}

export interface RhinestoneInitResult {
  /** The live SDK account object. */
  readonly client: RhinestoneAccount
  /**
   * The SDK instance the HCA was created with. Reused to derive the source
   * funding Nexus so both accounts share one orchestrator + RPC config; a
   * second `RhinestoneSDK` would need its own key and RPC overrides.
   */
  readonly sdk: RhinestoneSDK
  /** Deterministic HCA address. */
  readonly address: Address
  /** The connected wallet (single ECDSA owner) address. */
  readonly ownerAddress: Address
  /** Whether the HCA already had code on-chain at init time. */
  readonly alreadyDeployed: boolean
  readonly config: RhinestoneInitConfig
}

export interface InitializeRhinestoneAccountParams {
  /** Pre-built viem `Account` used as the single ECDSA HCA owner. */
  readonly ownerAccount: Account
  /** EOA address that owns the HCA (usually `ownerAccount.address`). */
  readonly eoaAddress: Address
  /** Registration chain the HCA lives on (Sepolia). */
  readonly chain: Chain
  /** Public client for on-chain adopt-existing verification reads. */
  readonly publicClient: PublicClient
  /** Rhinestone API key. Required. */
  readonly rhinestoneApiKey: string
  /** Override the Rhinestone orchestrator endpoint (e.g. local `/orchestrator`). */
  readonly rhinestoneEndpointUrl?: string
  /** Per-chain RPC overrides for the SDK. */
  readonly rhinestoneCustomRpcUrls?: Record<number, string>
  /**
   * When true, and the HCA is already deployed, ALSO require the current
   * implementation to be trusted by the reverse adapter (needed before a
   * primary-name action).
   */
  readonly requireTrustedForPrimary?: boolean
}

/** Build the standalone-HCA account config block from the chain's manifest. */
export function buildStandaloneAccountConfig(
  chainId: number,
): StandaloneHcaAccount {
  const c = getDestinationContracts(chainId)
  return {
    type: 'hca',
    version: STANDALONE_HCA_VERSION,
    factory: c.standaloneHcaFactory,
    implementation: c.standaloneHcaImplementation,
    validator: c.hcaOwnerAndSessionValidator,
    verifiableFactory: c.verifiableFactory,
    proxyLogic: c.verifiableFactoryProxyLogic,
    userSalt: USER_SALT,
  }
}

function makeSdk(params: {
  chain: Chain
  rhinestoneApiKey: string
  rhinestoneEndpointUrl?: string
  rhinestoneCustomRpcUrls?: Record<number, string>
}): RhinestoneSDK {
  const defaultRpcUrl = params.chain.rpcUrls.default.http[0]
  const urls: Record<number, string> = {
    ...(defaultRpcUrl ? { [params.chain.id]: defaultRpcUrl } : {}),
    ...(params.rhinestoneCustomRpcUrls ?? {}),
  }
  return new RhinestoneSDK({
    auth: { mode: 'apiKey', apiKey: params.rhinestoneApiKey },
    provider: { type: 'custom', urls },
    ...(params.rhinestoneEndpointUrl
      ? { endpointUrl: params.rhinestoneEndpointUrl }
      : {}),
  })
}

/**
 * Verify an already-deployed HCA matches what we expect before adopting it.
 * Returns the verified current implementation. Throws `AccountVerificationError`
 * (never silently adopts a mismatched account).
 */
async function verifyExistingHca(params: {
  publicClient: PublicClient
  hca: Address
  expectedOwner: Address
  destinationChainId: number
  requireTrustedForPrimary: boolean
}): Promise<Address> {
  const { publicClient, hca, expectedOwner, destinationChainId } = params
  const c = getDestinationContracts(destinationChainId)

  const [ownerResult, accountId] = await Promise.all([
    publicClient.readContract({
      address: hca,
      abi: standaloneHcaAbi,
      functionName: 'ownerAndSessionNonce',
    }),
    publicClient.readContract({
      address: hca,
      abi: standaloneHcaAbi,
      functionName: 'accountId',
    }),
  ])

  const actualOwner = ownerResult[0]
  if (getAddress(actualOwner) !== getAddress(expectedOwner)) {
    throw new AccountVerificationError({
      message: 'Existing HCA owner does not match the connected wallet',
      field: 'owner',
      expected: getAddress(expectedOwner),
      actual: getAddress(actualOwner),
    })
  }

  if (accountId !== ONCHAIN_ACCOUNT_ID) {
    throw new AccountVerificationError({
      message: 'Existing HCA accountId does not match the standalone HCA',
      field: 'accountId',
      expected: ONCHAIN_ACCOUNT_ID,
      actual: accountId,
    })
  }

  const implementation = await publicClient.readContract({
    address: c.verifiableFactory,
    abi: verifiableFactoryAbi,
    functionName: 'verifyContract',
    args: [hca],
  })
  // At launch the implementation must equal the configured initial
  // implementation. (Post-upgrade, this expands to any DAO-approved
  // implementation — tracked separately once upgrades exist.)
  if (
    getAddress(implementation) !== getAddress(c.standaloneHcaImplementation)
  ) {
    throw new AccountVerificationError({
      message: 'Existing HCA implementation is not the expected implementation',
      field: 'implementation',
      expected: getAddress(c.standaloneHcaImplementation),
      actual: getAddress(implementation),
    })
  }

  if (params.requireTrustedForPrimary) {
    const trusted = await publicClient.readContract({
      address: c.defaultReverseRegistrarHcaAdapter,
      abi: reverseAdapterAbi,
      functionName: 'trustedHCAImplementations',
      args: [implementation],
    })
    if (!trusted) {
      throw new AccountVerificationError({
        message:
          'Existing HCA implementation is not trusted for primary-name actions',
        field: 'trustedImplementation',
        expected: 'true',
        actual: 'false',
      })
    }
  }

  return implementation
}

/**
 * Initialize the standalone HCA in-memory, adopting an existing on-chain HCA
 * when the derived address already has code.
 *
 * Does NOT deploy — the first Rhinestone request performs the lazy deploy.
 */
export function initializeRhinestoneAccount(
  params: InitializeRhinestoneAccountParams,
): ResultAsync<
  RhinestoneInitResult,
  AccountInitError | AccountVerificationError
> {
  if (!params.rhinestoneApiKey) {
    return errAsync(
      new AccountInitError({ message: 'rhinestoneApiKey is required' }),
    )
  }

  return fromPromise(
    (async () => {
      const sdk = makeSdk(params)
      const accountConfig = {
        account: buildStandaloneAccountConfig(params.chain.id),
        owners: {
          type: 'ecdsa' as const,
          accounts: [params.ownerAccount],
          module: getDestinationContracts(params.chain.id)
            .hcaOwnerAndSessionValidator,
        },
        experimental_sessions: {
          enabled: true,
          module: getDestinationContracts(params.chain.id)
            .hcaOwnerAndSessionValidator,
        },
      }

      // Derive the deterministic address with a no-initData config.
      const candidate = await sdk.createAccount(accountConfig)
      const hca = candidate.getAddress() as Address

      const code = await params.publicClient.getCode({ address: hca })
      const alreadyDeployed = Boolean(code && code !== '0x')

      // Bind the account to its deploy state.
      //
      // The SDK's setup-ops (which include the factory deploy call) are gated by
      // `initData`: when `initData: { address }` is set, `getInitCode` returns
      // the address-only form → `getSetupOperationsAndDelegations` returns
      // `setupOps: []` (no deploy). When `initData` is absent, the deploy op is
      // included.
      //
      // Therefore:
      //   - UNDEPLOYED HCA → NO initData, so the first (commit) action's
      //     setup-ops deploy it.
      //   - ALREADY-DEPLOYED HCA → initData: { address }, so no re-deploy op is
      //     emitted (a re-deploy makes the intent's session signature invalid →
      //     `InvalidSignature()`). This also covers the "existing HCA, new
      //     session" case: the enable call runs, but the account is not
      //     re-deployed.
      //
      // NOTE: this is evaluated per `initializeRhinestoneAccount` call. Once the
      // commit deploys a previously-undeployed HCA, the caller must re-init so
      // the reveal (and future registrations) use the deployed (initData)
      // binding — see the manager's re-init on the smart-account machine.
      if (alreadyDeployed) {
        await verifyExistingHca({
          publicClient: params.publicClient,
          hca,
          expectedOwner: params.eoaAddress,
          destinationChainId: params.chain.id,
          requireTrustedForPrimary: params.requireTrustedForPrimary ?? false,
        })
      }

      const client = alreadyDeployed
        ? await sdk.createAccount({
            ...accountConfig,
            initData: { address: hca },
          })
        : candidate

      return {
        client,
        sdk,
        address: hca,
        ownerAddress: params.eoaAddress,
        alreadyDeployed,
        config: {
          chain: params.chain,
          rhinestoneApiKey: params.rhinestoneApiKey,
        },
      }
    })(),
    (error: unknown) => {
      if (error instanceof AccountVerificationError) return error
      return new AccountInitError({
        message: 'Failed to initialize standalone HCA account',
        cause: error,
      })
    },
  )
}
