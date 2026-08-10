/**
 * Standalone-HCA contract manifest.
 *
 * Provenance: these addresses are the coordinated Sepolia / Base Sepolia
 * deployment that the standalone HCA in `ensdomains/contracts-v2` PR #362
 * (branch `feat/hca-final-maybe`, commit `12712e3`) was deployed against, as
 * published in the "HCA: New" handoff doc.
 *
 * That is no longer true of the ENS-side contracts. ensjs now tracks the
 * deployment the apps actually ship against, so the registrar and registry are
 * read from it — registering somewhere the rest of the app does not read is
 * what made renewal revert `NameNotRenewable`. ensjs still has no entry for
 * `StandaloneHCAImplementation`, `HCAOwnerAndSessionValidator`, the proxy
 * logic, the reverse adapter, or the funding validator, so those stay
 * hardcoded here until it does.
 *
 * When ensjs ships the standalone-HCA deployment, re-point these to
 * `getChainContractAddress(...)`. Until then, this local, chain-keyed table is
 * the only correct source. Keep it grouped per chain so a redeploy is a
 * single-block edit and adding a source chain is additive.
 *
 * SDK patch SHA-256: 5e0a5f328ccf65514b051f255c217e693d81a9bfcf8ccbbd71dc2729e8932867
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { type Address, encodeAbiParameters, keccak256, stringToHex } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'

/**
 * The ENS-side contracts are sourced from ensjs, which is the source of truth
 * for the deployment the apps ship against. The standalone-HCA extras below
 * stay hardcoded only because ensjs has no entry for them yet.
 */
const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const SEPOLIA_CHAIN_ID = sepolia.id
export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id

export const STANDALONE_HCA_VERSION = 'ens-standalone-1.1.0' as const
export const ONCHAIN_ACCOUNT_ID = 'ens-standalone-hca.1.1.0' as const
export const USER_SALT = 0n

/** Contracts on the registration chain (Sepolia). */
export interface DestinationContracts {
  readonly standaloneHcaFactory: Address
  readonly standaloneHcaImplementation: Address
  readonly hcaOwnerAndSessionValidator: Address
  readonly verifiableFactory: Address
  readonly verifiableFactoryProxyLogic: Address
  readonly permissionedResolverImpl: Address
  readonly ethRegistrar: Address
  readonly ethRegistry: Address
  readonly defaultReverseRegistrarHcaAdapter: Address
  readonly usdc: Address
}

/** Contracts on a supported source (funding) chain. */
export interface SourceContracts {
  readonly usdc: Address
  readonly hcaFundingSessionValidator: Address
}

/**
 * Chain-agnostic contracts shared across the Rhinestone route.
 *
 * NOTE: the Across adapter/arbiter is intentionally NOT here. Per the handoff
 * doc, the frontend does not supply an Across adapter address — the source
 * validator reads the active Permit2 Across adapter from the Rhinestone Router
 * at claim time, and it is not part of the source permission ID.
 */
export interface SharedContracts {
  readonly nexusFactory: Address
  readonly permit2: Address
}

export const DESTINATION_CONTRACTS: Record<number, DestinationContracts> = {
  [sepolia.id]: {
    // From ensjs, which tracks the deployment the apps ship against.
    standaloneHcaFactory: ensjsSepolia.ensHcaFactory.address,
    verifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
    permissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
    ethRegistrar: ensjsSepolia.ensEthRegistrar.address,
    ethRegistry: ensjsSepolia.ensRegistry.address,

    // Not in ensjs yet. Addresses from contracts-v2
    // `contracts/docs/addresses/sepolia.md` @ 97a5729 (deployed 2026-07-30).
    standaloneHcaImplementation: '0xD213De41421Fed3a5E475943F9D634A0cf64a385',
    hcaOwnerAndSessionValidator: '0x976D90c51Afb2C11660EaeE94bD42A7e84751D08',
    defaultReverseRegistrarHcaAdapter:
      '0x7a84e241f862D73960D73c26d68c3C8F89F0B18F',
    // Not deployed as its own artifact — VerifiableFactory creates it in its
    // constructor and exposes it as the immutable `proxyLogic`, so this is read
    // off `ensVerifiableFactory` above. It MUST stay paired with that factory:
    // it is the EIP-1167 runtime hashed into every CREATE2 proxy address.
    verifiableFactoryProxyLogic: '0xA136BeE4E37B44586242e516a39893EfD54315e9',

    // MockUSDC: the orchestrator accepts it as a payment token, and the
    // api-worker faucet can mint it, so the whole route runs on one token.
    usdc: ensjsSepolia.usdc.address,
  },
}

export const SOURCE_CONTRACTS: Record<number, SourceContracts> = {
  [baseSepolia.id]: {
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    hcaFundingSessionValidator: '0x6Fc0FdE0960003acb24810fFd5dB6224b3d88974',
  },
}

export const SHARED_CONTRACTS: SharedContracts = {
  nexusFactory: '0x0000000000679A258c64d2F20F310e12B64b7375',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
}

/**
 * Resolve the destination contract table for a chain, throwing a clear error if
 * the chain is not a supported registration chain.
 */
export function getDestinationContracts(chainId: number): DestinationContracts {
  const contracts = DESTINATION_CONTRACTS[chainId]
  if (!contracts) {
    throw new Error(
      `No standalone-HCA destination contracts configured for chain ${chainId}`,
    )
  }
  return contracts
}

/**
 * Resolve the source contract table for a chain, throwing a clear error if the
 * chain is not an enabled source (funding) chain. Arbitrum Sepolia is
 * intentionally absent — it has no approved source validator.
 */
export function getSourceContracts(chainId: number): SourceContracts {
  const contracts = SOURCE_CONTRACTS[chainId]
  if (!contracts) {
    throw new Error(
      `No standalone-HCA source contracts configured for chain ${chainId}`,
    )
  }
  return contracts
}

/**
 * `ROLES.ALL` from contracts-v2 `script/deploy-constants.ts` — every nibble set
 * to 1 (role bit per 4-bit group), NOT all bits set. Verified against the
 * `feat/hca-final-maybe` branch.
 */
export const ROLES_ALL =
  0x1111111111111111111111111111111111111111111111111111111111111111n

export const COIN_TYPE_ETH = 60n

/**
 * Default registration duration (1 year). Duration is part of the commitment
 * hash, so the SAME value must flow through makeCommitment → register; builders
 * take it as a parameter and this is only the app-level default.
 */
export const DEFAULT_REGISTRATION_DURATION = 31536000n
/** `referrer` is a bytes32 arg on makeCommitment/register (NOT an address). */
export const REFERER =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const
/** `subregistry` is an address arg (address(0) = default). */
export const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const

export const DEFAULT_SESSION_VALIDITY_SECONDS = 24 * 60 * 60

// Session gas-refund CAPS (baked into the destination session salt via
// `computeDestinationSessionSalt`). These bound the executor reimbursement the
// orchestrator may pull from the HCA inside a session action — the on-chain
// `HCAOwnerAndSessionValidator._checkGasRefund` reverts `GasRefundNotAllowed()`
// (wrapped by the emissary as `InvalidSignature()`) when the orchestrator's
// quoted refund exceeds any cap. They are NOT the amount actually charged; they
// are ceilings, so they are set generously to absorb Sepolia gas spikes.
//
// Observed on a live Sepolia commit: the orchestrator quoted refundAmount ≈
// 33.5 USDC, gasOverhead ≈ 50k, exchangeRate ≈ 1.9e9 — the previous
// `MAX_REFUND_AMOUNT` of 25 USDC was below the quote and reverted. Caps are
// bumped well clear of that.
export const MAX_REFUND_EXCHANGE_RATE = 20_000_000_000n
export const MAX_REFUND_GAS_OVERHEAD = 500_000n
export const MAX_REFUND_AMOUNT = 100_000_000n // 100 USDC ceiling

/**
 * Derive the per-HCA resolver salt passed to `VerifiableFactory.deployProxy`.
 *
 * The doc says "the frontend selects one resolver salt for the HCA"; we make
 * that selection deterministic per HCA so the same HCA always resolves to the
 * same resolver proxy (one stable resolver per HCA, reusable across
 * registrations under the same session).
 *
 * NOTE: this deploys a **PermissionedResolver** proxy — initialized with
 * `PermissionedResolver.initialize(HCA, ROLES.ALL, [])`. The `"OwnedResolver"`
 * string below is only a domain-separator seed inside the salt derivation
 * (matching the reference `liveHcaRhinestoneRegistration` script); it does NOT
 * mean an OwnedResolver contract is deployed.
 *
 * Returns a `uint256` (bigint) — `deployProxy`'s `salt` arg — not a `bytes32`.
 */
export function computeResolverSalt(hca: Address): bigint {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [
          { name: 'id', type: 'bytes32' },
          { name: 'owner', type: 'address' },
          { name: 'version', type: 'uint256' },
        ],
        [keccak256(stringToHex('OwnedResolver')), hca, 0n],
      ),
    ),
  )
}
