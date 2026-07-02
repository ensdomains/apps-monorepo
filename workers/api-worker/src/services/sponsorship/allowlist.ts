/**
 * ENS-only call allowlist for gas sponsorship (FET-3337, part 1).
 *
 * The worker only sponsors gas for ENS operations, so every call in a sponsored
 * intent must target an allowlisted ENS contract and invoke an allowlisted
 * function selector. Contract addresses come from `@ensdomains/ensjs` chain
 * config (single source of truth); selectors are derived from human-readable
 * signatures via viem (no hardcoded hex).
 *
 * All of this is STATIC config, so the per-chain allowlists are derived ONCE at
 * module load (checksummed addresses + a selector set) and `validateCalls` is a
 * pure, synchronous membership check — there is no per-call rebuild.
 *
 * The audited signature + contract lists are ported from PR #914 (author:
 * v1rtl); this module keeps them static rather than lazily rebuilt per request.
 *
 * Note: the remaining half of FET-3337 — the per-name allowance (floor(5×years)
 * − spent) and the global 40k budget, re-derived from the Bigname
 * `gas_sponsorship` projection — is a separate, semantic gate layered on top of
 * this structural one; it is not implemented here.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  getAddress,
  isAddressEqual,
  toFunctionSelector,
} from 'viem'

/**
 * V2 Sepolia deployments the manager emits sponsored calls to that are not (yet)
 * in ensjs chain config. Mirrored from the app's own constants:
 *   - DefaultReverseRegistrar: packages/transaction-manager/src/contracts/ens-sepolia.ts
 *   - ENS_HCA_MODULE:          packages/smart-account/src/providers/rhinestone/registration-policy.ts
 *
 * TODO(mainnet): these are Sepolia-specific. Revisit when V2 mainnet addresses
 * exist (ideally once ensjs exposes them, so they can be chain-derived).
 */
const DEFAULT_REVERSE_REGISTRAR = '0xeb8269fb39290f31c4c29cec548807ca2133abb4'
const ENS_HCA_MODULE = '0x5049ecBd4d961aE6DFEED9b7ccCe7f026454970E'

/**
 * Function selectors the worker will sponsor, derived from human-readable
 * signatures via viem (no hardcoded hex). These mirror every sponsored call the
 * manager emits — see the audit in PR #914. Keep in sync with:
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

/** Allowlisted function selectors, derived once at module load. */
export const ALLOWED_SELECTORS: ReadonlySet<string> = new Set(
  SPONSORED_SIGNATURES.map((sig) => toFunctionSelector(sig)),
)

export interface ChainAllowlist {
  /** Contracts whose calls are sponsored, gated by selector. */
  readonly contracts: readonly Address[]
  /**
   * Contracts whose calldata is opaque/SDK-generated (e.g. the HCA factory
   * deploy): the address must be allowlisted but the selector is not checked.
   */
  readonly anySelectorContracts: readonly Address[]
}

/** Build Sepolia's allowlist from static ensjs chain config (once, at load). */
function buildSepoliaAllowlist(): ChainAllowlist {
  const contracts = ensL1Contracts[supportedL1Chains.sepolia]
  if (!contracts) {
    throw new Error('ensjs chain config is missing Sepolia L1 contracts')
  }
  return {
    contracts: [
      contracts.ensRegistry.address, // setResolver
      contracts.ensEthRegistrar.address, // commit / register / renew (v2)
      contracts.ensEthRegistrarController.address, // renew (V1)
      contracts.ensReverseRegistrar.address, // setName
      contracts.ensVerifiableFactory.address, // deployProxy (resolver deploy)
      contracts.usdc.address, // approve / permit
      contracts.dai.address, // approve / permit
      DEFAULT_REVERSE_REGISTRAR, // setName / setNameForAddrWithSignature
      ENS_HCA_MODULE, // updateConfig (session enable)
    ].map((address) => getAddress(address)),
    anySelectorContracts: [contracts.ensHcaFactory.address].map((address) =>
      getAddress(address),
    ),
  }
}

/**
 * Per-chain allowlists, derived once at module load. Sepolia only for launch;
 * add a chain here once its V2 addresses are chain-derivable. A sponsorable
 * chain absent from this map has no allowlist, so its calls are denied
 * (deny-by-default) — the chain gate still restricts *which* chains reach here.
 */
export const ALLOWLIST_BY_CHAIN_ID: ReadonlyMap<number, ChainAllowlist> =
  new Map([[supportedL1Chains.sepolia, buildSepoliaAllowlist()]])

/** The allowlist `validateCalls` checks against: contracts + selectors. */
export interface ResolvedAllowlist extends ChainAllowlist {
  readonly selectors: ReadonlySet<string>
}

/**
 * Resolve the allowlist for the sponsorable chains — the union of the static
 * per-chain allowlists. Cheap (spreads pre-checksummed addresses); the costly
 * derivation already happened at module load. Call once per predicate, not per
 * call.
 */
export function resolveAllowlist(
  chainIds: ReadonlySet<number>,
): ResolvedAllowlist {
  const contracts: Address[] = []
  const anySelectorContracts: Address[] = []
  for (const id of chainIds) {
    const allowlist = ALLOWLIST_BY_CHAIN_ID.get(id)
    if (allowlist) {
      contracts.push(...allowlist.contracts)
      anySelectorContracts.push(...allowlist.anySelectorContracts)
    }
  }
  return { contracts, anySelectorContracts, selectors: ALLOWED_SELECTORS }
}

/** A single call from a sponsored intent (a subset of the SDK's call shape). */
export interface SponsoredCall {
  readonly to: string
  readonly data?: string
}

/**
 * Validate that every call targets an allowlisted contract + selector.
 *
 * `anySelectorContracts` are trusted addresses (e.g. the HCA factory) whose
 * calldata is opaque/SDK-generated; for those the address must be allowlisted
 * but the selector is not checked. Pure and synchronous.
 */
export function validateCalls(
  calls: readonly SponsoredCall[],
  allowlist: ResolvedAllowlist,
): { ok: true } | { ok: false; reason: string } {
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
    if (
      allowlist.anySelectorContracts.some((allowed) =>
        isAddressEqual(allowed, to),
      )
    ) {
      continue
    }

    if (!allowlist.contracts.some((allowed) => isAddressEqual(allowed, to))) {
      return { ok: false, reason: `Contract not allowlisted: ${to}` }
    }

    // Function selectors are 4-byte hex — compare as canonical lowercase hex
    // (what `toFunctionSelector` produces). A call with no/empty calldata has
    // no selector to check.
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
