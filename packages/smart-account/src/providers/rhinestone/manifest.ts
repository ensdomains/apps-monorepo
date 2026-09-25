/**
 * Standalone-HCA contract manifest.
 *
 * Provenance: the 2026-09-15 Sepolia v2 redeploy, contracts-v2
 * `contracts/deployments/sepolia` @ `71a3b733`. The ENS-side addresses come
 * from ensjs (ensdomains/ensjs#380, which targets the same deployment); the
 * rest are pinned below because ensjs does not expose them yet.
 *
 * Re-point the remaining hardcoded extras to `getChainContractAddress(...)`
 * when ensjs exposes them. Until then, this local, chain-keyed table remains
 * the complete source. Keep it grouped per chain so a redeploy is a
 * single-block edit and adding a source chain is additive.
 *
 * SDK patch SHA-256: 805bf1463590449f22dea003cae7f68471945c029cb685406c54af47a18714bf
 * (byte-identical to contracts-v2 `patches/@rhinestone%2Fsdk@1.8.0.patch` @ 71a3b733,
 * the patch built for this deployment's validator).
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
  /** Block where this VerifiableFactory was deployed; used as the log-scan floor. */
  readonly verifiableFactoryDeployBlock: bigint
  readonly permissionedResolverImpl: Address
  readonly ethRegistrar: Address
  readonly ethRegistry: Address
  readonly rootRegistry: Address
  readonly migrationHelper: Address
  readonly unlockedMigrationController: Address
  readonly lockedMigrationController: Address
  /** Allowlist used to identify legacy public resolvers during migration. */
  readonly publicResolverSet: Address
  /** Implementation deployed for user registries recreated during migration. */
  readonly userRegistryImpl: Address
  /** Implementation deployed for wrapper registries created by locked migration. */
  readonly wrapperRegistryImpl: Address
  /** Replacement/default resolver written during migration. */
  readonly publicResolverV2: Address
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
    standaloneHcaFactory: ensjsSepolia.ensHcaFactory.address,
    verifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
    permissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
    ethRegistrar: ensjsSepolia.ensEthRegistrar.address,
    ethRegistry: ensjsSepolia.ensRegistry.address,
    // HCA-aware: resolves an HCA caller to its owner through the standalone
    // HCA factory's `authorizedOwnerOf`.
    migrationHelper: ensjsSepolia.ensMigrationHelper.address,
    unlockedMigrationController:
      ensjsSepolia.ensUnlockedMigrationController.address,
    lockedMigrationController:
      ensjsSepolia.ensLockedMigrationController.address,
    userRegistryImpl: ensjsSepolia.ensUserRegistryImpl.address,

    // Not in ensjs yet — contracts-v2 `deployments/sepolia` @ 71a3b733.
    //
    // The validator pins the whole registration batch: it rebuilds the
    // expected `deployProxy` calldata and compares keccak hashes, and only
    // accepts known selectors on known targets. Its `VERIFIABLE_PROXY_LOGIC()`,
    // `PERMITTED_RESOLVER_IMPL()`, `VERIFIABLE_FACTORY()`, `ETH_REGISTRY()` and
    // `DEFAULT_REVERSE_REGISTRAR_HCA_ADAPTER()` getters all agree with the
    // values here. Re-read them after any redeploy.
    //
    // The implementation is the one the factory approves
    // (`approvedImplementations`), and was constructed with this validator.
    standaloneHcaImplementation: '0xdF4a24c42921810fed9363b07292E9152578D706',
    hcaOwnerAndSessionValidator: '0x6A62Af42D4241a02547b096C7DB43ca6411AF813',
    defaultReverseRegistrarHcaAdapter:
      '0x4F32A1c62E202922d4d6307126F43218DB9dA6f5',
    // Not deployed as its own artifact — VerifiableFactory creates it in its
    // constructor and exposes it as the immutable `proxyLogic`, so this is read
    // off `ensVerifiableFactory` above. It MUST stay paired with that factory:
    // it is the EIP-1167 runtime hashed into every CREATE2 proxy address.
    verifiableFactoryProxyLogic: '0xC6dbA04e7c6264e85A459Dd592a6CBC2D2a6Ad8E',
    verifiableFactoryDeployBlock: 11_708_995n,
    rootRegistry: '0x9703DBD26dAB89504490994138cF2c575251a9cE',
    publicResolverSet: '0xd12aF6aC82648056Fe7D6B2a9dB97235Aa509021',
    wrapperRegistryImpl: '0x2741543c3B14640b97bC70a233318032f7E35bAC',
    publicResolverV2: '0xd7e590Ad0E92A6aC1d81f4483A9B951D3585a50F',

    // MockUSDC — the ETHRegistrar payment token, mintable via the api-worker
    // faucet (`POST /wallet/fund`).
    //
    // Only usable as the intent fee asset once Rhinestone's `ensUSDC` registry
    // entry points at this address. It has lagged every redeploy so far; while
    // it does, the orchestrator's portfolio for an HCA holding the token reads
    // zero and every planner fails NO_PLAN_AVAILABLE / `sourceChains: []`,
    // before any signing, so it looks nothing like a policy failure. Check
    // `GET /accounts/{hca}/portfolio` first. Nothing app-side can work around a
    // stale entry.
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
