/**
 * Standalone-HCA contract manifest.
 *
 * Provenance: these addresses are the coordinated Sepolia / Base Sepolia
 * deployment that the standalone HCA in `ensdomains/contracts-v2` PR #362
 * (branch `feat/hca-final-maybe`, commit `12712e3`) was deployed against, as
 * published in the "HCA: New" handoff doc. They are NOT sourced from
 * `@ensdomains/ensjs`: ensjs' Sepolia v2 block points at a DIFFERENT, older
 * deployment (every overlapping contract — registrar, registry, verifiable
 * factory, resolver impl, USDC test token — has a different address there), and
 * ensjs' `ensHcaFactory` is the SDK's built-in *non-standalone* HCA factory
 * (`0x3586…Cf943`) that this migration replaces. ensjs has no entry at all for
 * `StandaloneHCAImplementation`, `HCAOwnerAndSessionValidator`, the proxy
 * logic, the reverse adapter, or the funding validator.
 *
 * When ensjs ships the standalone-HCA deployment, re-point these to
 * `getChainContractAddress(...)`. Until then, this local, chain-keyed table is
 * the only correct source. Keep it grouped per chain so a redeploy is a
 * single-block edit and adding a source chain is additive.
 *
 * SDK patch SHA-256: 5e0a5f328ccf65514b051f255c217e693d81a9bfcf8ccbbd71dc2729e8932867
 */

import { type Address, encodeAbiParameters, keccak256, stringToHex } from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'

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

/** Chain-agnostic contracts shared across the Rhinestone route. */
export interface SharedContracts {
  readonly nexusFactory: Address
  readonly permit2: Address
  readonly acrossArbiter: Address
}

export const DESTINATION_CONTRACTS: Record<number, DestinationContracts> = {
  [sepolia.id]: {
    standaloneHcaFactory: '0x1915b0c8ae2c133b2b43845b5c545d1eea081c9a',
    standaloneHcaImplementation: '0xaff1833a2746373b749bca6f416b9d4eb5f4d7c4',
    hcaOwnerAndSessionValidator: '0x67a4f4f3ba93b7c1299cc79b901c4b2e4375ef42',
    verifiableFactory: '0x118bc31a50d559f7015a8da26d54b3b030cdb70f',
    verifiableFactoryProxyLogic: '0x7E98c31ae2Ac5C3C88f2CE00c22a10B8cb84BcE2',
    permissionedResolverImpl: '0x7e4b2d59938930168024201752ee5503df402303',
    ethRegistrar: '0xa4449a0dd2b83007553d9b1d28b583a46a805a30',
    ethRegistry: '0x67b728a792e789a8978b30cf1b3b641f19354b43',
    defaultReverseRegistrarHcaAdapter:
      '0x5e2d105f1e6be8444c4ed96c06806093b829644e',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
}

export const SOURCE_CONTRACTS: Record<number, SourceContracts> = {
  [baseSepolia.id]: {
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    hcaFundingSessionValidator: '0xCd3498554f08AB38ACCa8eFcB0839421598364a1',
  },
}

export const SHARED_CONTRACTS: SharedContracts = {
  nexusFactory: '0x0000000000679A258c64d2F20F310e12B64b7375',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  acrossArbiter: '0x28a4d41776968c1201a807ec51ffb405362b8882',
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

export const MAX_REFUND_EXCHANGE_RATE = 5_000_000_000n
export const MAX_REFUND_GAS_OVERHEAD = 100_000n
export const MAX_REFUND_AMOUNT = 25_000_000n
export const SAME_CHAIN_USDC_BUDGET = 20_000_000n

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
