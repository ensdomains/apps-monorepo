/**
 * Standalone-HCA registration call builders (commit + reveal batch).
 *
 * Pure encoders + a few read helpers. No SDK/session concerns here — the
 * machine composes these into Rhinestone requests. Every call sets `value: 0`.
 *
 * The reveal batch order is EXACT and load-bearing (per the doc):
 *   1. VerifiableFactory.deployProxy(...)      — omit when the resolver exists
 *   2. paymentToken.approve(ETHRegistrar, price)
 *   3. ETHRegistrar.register(..., wallet as owner, ...)
 *   4. resolver setters                        — only selected records
 *   5. DefaultReverseRegistrarAdapter.setNameWithHCA(wallet, name) — primary only
 *
 * Price MUST be read immediately before the reveal (never cached from commit
 * time) via `readRegisterPrice`, and `approve` must approve exactly that price.
 */

import {
  permissionedResolverInitializeSnippet,
  permissionedResolverSetAddressSnippet,
  permissionedResolverSetTextSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  parseAbi,
  toHex,
  zeroAddress,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { computeVerifiableProxyAddress } from '../../verifiable-factory'
import {
  COIN_TYPE_ETH,
  computeResolverSalt,
  getDestinationContracts,
  REFERER,
  ROLES_ALL,
} from './manifest'

export interface Call {
  readonly to: Address
  readonly value: bigint
  readonly data: Hex
}

const ethRegistrarAbi = parseAbi([
  'function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
  'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer)',
  'function MIN_COMMITMENT_AGE() view returns (uint64)',
  'function MAX_COMMITMENT_AGE() view returns (uint64)',
])
const reverseAdapterAbi = parseAbi([
  'function setNameWithHCA(address addr, string name)',
])
const erc20Abi = parseAbi(['function approve(address spender, uint256 amount)'])

/** `<address-without-0x>.addr.reverse` reverse name for an address. */
export function ethReverseName(address: Address): string {
  return `${address.slice(2).toLowerCase()}.addr.reverse`
}

/**
 * Compute the resolver (PermissionedResolver proxy) address for an HCA, without
 * a chain read — the VerifiableFactory CREATE2 address for the derived salt.
 */
export function computeResolverAddress(params: {
  readonly chainId: number
  readonly hca: Address
}): Address {
  const c = getDestinationContracts(params.chainId)
  const salt = computeResolverSalt(params.hca)
  return computeVerifiableProxyAddress({
    factory: c.verifiableFactory,
    proxyLogic: c.verifiableFactoryProxyLogic,
    deployer: params.hca,
    salt,
  })
}

/** Read the commitment hash from the registrar (matches on-chain derivation). */
export async function readCommitment(params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly label: string
  readonly wallet: Address
  readonly secret: Hex
  readonly resolver: Address
  /** Registration duration (seconds). MUST be identical at commit and reveal. */
  readonly duration: bigint
}): Promise<Hex> {
  const c = getDestinationContracts(params.chainId)
  return params.publicClient.readContract({
    address: c.ethRegistrar,
    abi: ethRegistrarAbi,
    functionName: 'makeCommitment',
    args: [
      params.label,
      params.wallet,
      params.secret,
      // No subregistry: nothing can mint under the name. Verification asserts
      // this same value back (see `verifyHcaRegistrationActor`).
      zeroAddress,
      params.resolver,
      params.duration,
      REFERER,
    ],
  })
}

/**
 * Read the registrar's commitment-age window (immutables — set at deploy, so
 * they must be READ, not hardcoded). Reveal is valid in
 * `(commitTime + min, commitTime + max)`.
 */
export async function readCommitmentAges(params: {
  readonly publicClient: PublicClient
  readonly chainId: number
}): Promise<{ minCommitmentAge: bigint; maxCommitmentAge: bigint }> {
  const c = getDestinationContracts(params.chainId)
  const [minCommitmentAge, maxCommitmentAge] = await Promise.all([
    params.publicClient.readContract({
      address: c.ethRegistrar,
      abi: ethRegistrarAbi,
      functionName: 'MIN_COMMITMENT_AGE',
    }),
    params.publicClient.readContract({
      address: c.ethRegistrar,
      abi: ethRegistrarAbi,
      functionName: 'MAX_COMMITMENT_AGE',
    }),
  ])
  return { minCommitmentAge, maxCommitmentAge }
}

/** Build the `ETHRegistrar.commit(commitment)` call. */
export function buildCommitCall(params: {
  readonly chainId: number
  readonly commitment: Hex
}): Call {
  const c = getDestinationContracts(params.chainId)
  return {
    to: c.ethRegistrar,
    value: 0n,
    data: encodeFunctionData({
      abi: ethRegistrarAbi,
      functionName: 'commit',
      args: [params.commitment],
    }),
  }
}

/** Read the current registration price (base + premium). Call immediately before reveal. */
export async function readRegisterPrice(params: {
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly label: string
  /** Registration duration (seconds) — same value as the commitment. */
  readonly duration: bigint
}): Promise<bigint> {
  const c = getDestinationContracts(params.chainId)
  const [base, premium] = await params.publicClient.readContract({
    address: c.ethRegistrar,
    abi: ethRegistrarAbi,
    functionName: 'getRegisterPrice',
    args: [params.label, params.duration, c.usdc],
  })
  return base + premium
}

export interface ResolverRecord {
  readonly type: 'addr' | 'text'
  readonly key?: string
  readonly value: string
}

export interface RevealBatchParams {
  readonly chainId: number
  readonly hca: Address
  readonly resolver: Address
  /** True when the resolver already has code (skip deployProxy). */
  readonly resolverDeployed: boolean
  readonly label: string
  readonly wallet: Address
  readonly secret: Hex
  /** Current price from `readRegisterPrice`, read immediately before reveal. */
  readonly price: bigint
  /** Registration duration (seconds). MUST equal the commitment's duration. */
  readonly duration: bigint
  /** Optional resolver records to write (addr for the wallet is added by default). */
  readonly records?: readonly ResolverRecord[]
  /** When set, adds the primary-name (default.reverse) call. */
  readonly setPrimaryName?: string
}

/**
 * Build the exact-ordered reveal batch. See module doc for the ordering
 * contract. Every call has `value: 0`; if any call reverts the whole batch
 * reverts.
 */
export function buildRevealBatch(params: RevealBatchParams): Call[] {
  const c = getDestinationContracts(params.chainId)
  const name = `${params.label}.eth`
  const calls: Call[] = []

  // The record writes for this name: the default `addr` (the wallet) plus any
  // selected text records. Always issued as standalone calls (step 4).
  //
  // These are the V2 `PermissionedResolver` setters, which take the DNS-encoded
  // name rather than `bytes32 node` — `setAddress` 0xb4436dde and `setText`
  // 0xc7279f88, both on the validator's record-setter list
  // (`HCAResolverPolicyLib._isRecordSelector`). The v1 `PublicResolver` shapes
  // are rejected twice over: the policy does not accept their selectors, and
  // the resolver does not implement them.
  const dnsName = toHex(packetToBytes(name))
  const recordSetters: Hex[] = [
    encodeFunctionData({
      abi: permissionedResolverSetAddressSnippet,
      functionName: 'setAddress',
      args: [dnsName, COIN_TYPE_ETH, params.wallet],
    }),
    ...(params.records ?? [])
      .filter((record) => record.type === 'text' && record.key)
      .map((record) =>
        encodeFunctionData({
          abi: permissionedResolverSetTextSnippet,
          functionName: 'setText',
          // biome-ignore lint/style/noNonNullAssertion: filtered on `key` above
          args: [dnsName, record.key!, record.value],
        }),
      ),
  ]

  // 1. deployProxy (omit when resolver exists).
  //
  //    `HCAResolverPolicyLib.checkDeployment` decodes our initializer, checks
  //    it, then re-encodes it as
  //      deployProxy(PERMITTED_RESOLVER_IMPL, salt, initialize(grants, calls))
  //    and compares `keccak256(callData)` against that, so the encoding must be
  //    canonical. A mismatch reverts `PolicyRuleFailed()` (0xe50c42ea), which
  //    the emissary re-wraps as `InvalidSignature()`.
  //
  //    The grants array must be EXACTLY two entries in this order:
  //      grants.length == 2
  //      grants[0] == (hca,    ALL_ROLES)
  //      grants[1] == (owner,  ALL_ROLES)
  //    This is what replaced the old standalone `authorizeNameRoles` call: the
  //    wallet's roles are granted at init rather than afterwards, which is why
  //    the initializer takes a list.
  //
  //    `calls` is left empty. The deployed policy would accept record setters
  //    there (it runs each through `checkCall`), but the existing-resolver path
  //    has no initializer, so the records go out as standalone calls in step 4
  //    on both paths.
  if (!params.resolverDeployed) {
    const salt = computeResolverSalt(params.hca)
    calls.push({
      to: c.verifiableFactory,
      value: 0n,
      data: encodeFunctionData({
        abi: verifiableFactoryDeployProxySnippet,
        functionName: 'deployProxy',
        args: [
          c.permissionedResolverImpl,
          salt,
          encodeFunctionData({
            abi: permissionedResolverInitializeSnippet,
            functionName: 'initialize',
            args: [
              [
                { account: params.hca, roleBitmap: ROLES_ALL },
                { account: params.wallet, roleBitmap: ROLES_ALL },
              ],
              [],
            ],
          }),
        ],
      }),
    })
  }

  // 2. approve(price)
  calls.push({
    to: c.usdc,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [c.ethRegistrar, params.price],
    }),
  })

  // 3. register(wallet as owner)
  calls.push({
    to: c.ethRegistrar,
    value: 0n,
    data: encodeFunctionData({
      abi: ethRegistrarAbi,
      functionName: 'register',
      args: [
        params.label,
        params.wallet,
        params.secret,
        // Must match the commitment's subregistry (see `readCommitment`).
        zeroAddress,
        params.resolver,
        params.duration,
        c.usdc,
        REFERER,
      ],
    }),
  })

  // 4. resolver setters — ALWAYS standalone, on both the fresh-deploy and the
  //    existing-resolver path (see step 1). These are ordinary permissioned
  //    writes, authorized because the HCA holds the root roles granted by
  //    `initialize`.
  for (const data of recordSetters) {
    calls.push({ to: params.resolver, value: 0n, data })
  }

  // 5. primary name (default.reverse) — only when selected
  if (params.setPrimaryName) {
    calls.push({
      to: c.defaultReverseRegistrarHcaAdapter,
      value: 0n,
      data: encodeFunctionData({
        abi: reverseAdapterAbi,
        functionName: 'setNameWithHCA',
        args: [params.wallet, params.setPrimaryName],
      }),
    })
  }

  // NOTE: there is no trailing `authorizeNameRoles` call. It used to grant the
  // wallet its roles after the fact, but the function no longer exists on
  // `PermissionedResolver` and the policy does not whitelist its selector — the
  // wallet is granted at deploy time via `initialize`'s second grant (step 1).
  // On the existing-resolver path it already holds them from that deploy.

  return calls
}

/** Build the USDC `approve(spender, amount)` call (used for source funding). */
export function buildUsdcApproveCall(params: {
  readonly chainId: number
  readonly spender: Address
  readonly amount: bigint
}): Call {
  const c = getDestinationContracts(params.chainId)
  return {
    to: c.usdc,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [params.spender, params.amount],
    }),
  }
}
