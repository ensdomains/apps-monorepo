/**
 * Allowlist + call-validation for the Rhinestone orchestrator proxy.
 *
 * The proxy only sponsors gas for ENS operations, so every call in an
 * incoming Intent must target an allowlisted ENS contract and invoke an
 * allowlisted function selector. Contract addresses are resolved from
 * `@ensdomains/ensjs` chain config (single source of truth) and selectors
 * are derived from ensjs-abi snippets via viem (no hardcoded hex).
 */

import {
  type Address,
  getAddress,
  isAddressEqual,
  toFunctionSelector,
} from 'viem'

/**
 * Addresses the manager emits sponsored calls to that are NOT (yet) in ensjs
 * chain config. These are the canonical Sepolia V2 deployments mirrored from
 * the app's own constants:
 *   - DefaultReverseRegistrar: packages/transaction-manager/src/contracts/ens-sepolia.ts
 *   - ENS_HCA_MODULE:          packages/smart-account/src/providers/rhinestone/registration-policy.ts
 *
 * TODO(mainnet): these are Sepolia-specific. Revisit when V2 mainnet addresses
 * exist (ideally once ensjs exposes them, so they can be chain-derived).
 */
const DEFAULT_REVERSE_REGISTRAR = '0xeb8269fb39290f31c4c29cec548807ca2133abb4'
const ENS_HCA_MODULE = '0x5049ecBd4d961aE6DFEED9b7ccCe7f026454970E'

/**
 * Function selectors the proxy will sponsor, derived from human-readable
 * signatures via viem (no hardcoded hex). These mirror every sponsored call
 * the manager emits — see the audit in PR #914. Keep in sync with:
 *   - packages/transaction-manager/src/machines/registration/*.actors.ts
 *   - packages/smart-account/src/providers/rhinestone/registration-policy.ts
 */
const SPONSORED_SIGNATURES = [
  // v2 ETHRegistrar
  'function commit(bytes32 commitment)',
  'function register(string name, address owner, bytes32 secret, address resolver, address subregistry, uint64 duration, address referrer, bytes32 extraData)',
  'function renew(string name, uint64 duration, address referrer, bytes32 extraData)',
  // V1 ETHRegistrarController renewal (smart-account renewal path)
  'function renew(string name, uint256 duration)',
  // Payment tokens (USDC/DAI)
  'function approve(address spender, uint256 amount)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  // Resolver deploy (VerifiableFactory) + resolver wiring (v2 registry)
  'function deployProxy(address implementation, uint256 salt, bytes data)',
  'function setResolver(uint256 id, address resolver)',
  // Primary-name (ReverseRegistrar + DefaultReverseRegistrar)
  'function setName(string name)',
  'function setNameForAddrWithSignature(address addr, uint256 coinType, string name, uint256[] coinTypes, bytes signature)',
  // Session enable (HCA OwnableValidator self-call)
  'function updateConfig(uint256 newThreshold, (address addr, uint48 expiration)[] ownersToAdd, address[] ownersToRemove)',
] as const

export const ALLOWED_SELECTORS: ReadonlySet<string> = new Set(
  SPONSORED_SIGNATURES.map((sig) => toFunctionSelector(sig)),
)

/**
 * Build the list of allowlisted contract addresses for the given chain.
 *
 * ensjs-sourced addresses are chain-derived (single source of truth); the two
 * non-ensjs addresses above are appended. Every address is normalised to its
 * EIP-55 checksum via `getAddress` (ensjs does not guarantee checksummed
 * output) so comparisons can use `isAddressEqual` rather than case folding.
 */
export async function buildContractAllowlist(
  chain: 'sepolia' | 'mainnet',
): Promise<readonly Address[]> {
  // DEFAULT_REVERSE_REGISTRAR and ENS_HCA_MODULE below are Sepolia-only V2
  // deployments (not yet in ensjs). Appending them for any other chain would
  // silently produce a mixed/wrong allowlist, so fail loudly until mainnet V2
  // addresses exist and can be chain-derived. See TODO(mainnet) above.
  if (chain !== 'sepolia') {
    throw new Error(
      `Orchestrator proxy allowlist only supports 'sepolia'; ` +
        `'${chain}' requires mainnet V2 addresses (DefaultReverseRegistrar, ENS_HCA_MODULE) first.`,
    )
  }

  const { ensL1Contracts, supportedL1Chains } = await import(
    '@ensdomains/ensjs/chain'
  )
  const chainId = supportedL1Chains[chain]
  if (chainId === undefined) {
    throw new Error(`Unknown chain: ${chain}`)
  }
  const contracts = ensL1Contracts[chainId]

  return [
    contracts.ensRegistry.address, // setResolver
    contracts.ensEthRegistrar.address, // commit / register / renew (v2)
    contracts.ensEthRegistrarController.address, // renew (V1)
    contracts.ensReverseRegistrar.address, // setName
    contracts.ensVerifiableFactory.address, // deployProxy (resolver deploy)
    contracts.usdc.address, // approve / permit
    contracts.dai.address, // approve / permit
    DEFAULT_REVERSE_REGISTRAR, // setName / setNameForAddrWithSignature
    ENS_HCA_MODULE, // updateConfig (session enable)
  ].map((address) => getAddress(address))
}

/**
 * Contracts where any selector is allowed. The HCA factory is invoked with
 * opaque, SDK-generated `factoryData` (the account-deploy call), so its
 * selector is not statically knowable and must not be selector-checked.
 */
export async function buildAnySelectorAllowlist(
  chain: 'sepolia' | 'mainnet',
): Promise<readonly Address[]> {
  const { ensL1Contracts, supportedL1Chains } = await import(
    '@ensdomains/ensjs/chain'
  )
  const contracts = ensL1Contracts[supportedL1Chains[chain]]
  return [contracts.ensHcaFactory.address].map((address) => getAddress(address))
}

type Call = { to: string; data?: string }

/**
 * Pull the executed calls out of an orchestrator request body. Warp Intents
 * expose them as either `calls` or `destinationExecutions`.
 */
export function extractCalls(body: unknown): Call[] {
  const obj = body as Record<string, unknown> | undefined
  if (!obj) return []
  if (Array.isArray(obj.calls)) return obj.calls as Call[]
  if (Array.isArray(obj.destinationExecutions)) {
    return obj.destinationExecutions as Call[]
  }
  return []
}

/**
 * Pull the smart-account address out of a request body, checksummed so the
 * same account maps to one rate-limit key regardless of incoming casing.
 * Returns null when absent or malformed.
 */
export function extractAccount(body: unknown): Address | null {
  const obj = body as Record<string, unknown> | undefined
  if (!obj || typeof obj.account !== 'string') return null
  try {
    return getAddress(obj.account)
  } catch {
    return null
  }
}

/**
 * Validate that every call targets an allowlisted contract + selector.
 *
 * `anySelectorContracts` are trusted addresses (e.g. the HCA factory) whose
 * calldata is opaque/SDK-generated; for those the selector check is skipped
 * but the address must still be allowlisted.
 */
export function validateCalls(
  calls: Call[],
  allowlist: {
    contracts: readonly Address[]
    selectors: ReadonlySet<string>
    anySelectorContracts?: readonly Address[]
  },
): { ok: true } | { ok: false; reason: string } {
  const anySelector = allowlist.anySelectorContracts ?? []

  for (const call of calls) {
    if (!call.to) return { ok: false, reason: 'Call missing "to" address' }

    let to: Address
    try {
      to = getAddress(call.to)
    } catch {
      return { ok: false, reason: `Invalid "to" address: ${call.to}` }
    }

    // Trusted contracts with opaque calldata: address must match, selector is
    // not checked.
    if (anySelector.some((allowed) => isAddressEqual(allowed, to))) {
      continue
    }

    if (!allowlist.contracts.some((allowed) => isAddressEqual(allowed, to))) {
      return { ok: false, reason: `Contract not allowlisted: ${to}` }
    }

    // Function selectors are 4-byte hex, not addresses — compare as canonical
    // lowercase hex (what `toFunctionSelector` produces).
    const selector = call.data?.slice(0, 10).toLowerCase()
    if (selector && selector !== '0x' && !allowlist.selectors.has(selector)) {
      return {
        ok: false,
        reason: `Selector not allowlisted: ${selector} on ${to}`,
      }
    }
  }
  return { ok: true }
}
