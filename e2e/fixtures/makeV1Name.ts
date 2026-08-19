/**
 * makeV1Name fixture — creates .eth names on the Anvil Sepolia fork in the V1 stack the
 * manager app and the deployed migration controllers actually read.
 *
 * Names are minted straight on the BaseRegistrar after granting ourselves controller
 * rights (see `ensureBaseRegistrarController`). The forked Sepolia stack has no
 * ETHRegistrarController authorised, so the commit/reveal path is unavailable — and
 * direct minting is faster anyway: no commitment wait and no rent to pay.
 *
 * After each V1 registration, reserveInV2() creates the RESERVED placeholder
 * in the V2 ETH Registry. Migration controllers only hold ROLE_REGISTER_RESERVED —
 * they cannot register AVAILABLE names. Without this step, MigrationHelper.migrate()
 * reverts when the migration controller tries to claim the V2 slot.
 *
 * The registered name is owned by the specified account's EOA address.
 */

import {
  extendChainWithEns,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import {
  type Address,
  encodeFunctionData,
  type Hash,
  keccak256,
  namehash,
  parseAbi,
  parseEther,
  toHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'

// ---------------------------------------------------------------------------
// Contract addresses
//
// Resolved from the SAME source the manager app uses (`@ensdomains/ensjs` chain config),
// not hardcoded. Hardcoding these previously desynced the suite from the app after a
// redeploy: the fixtures wrapped names in one NameWrapper while the app read a different
// one, so every migration spec saw "No eligible names found for this wallet".
// ---------------------------------------------------------------------------
const chainWithEns = extendChainWithEns(sepolia)
const ensContract = (contract: string): Address =>
  getChainContractAddress({
    chain: chainWithEns,
    // biome-ignore lint/suspicious/noExplicitAny: contract names are validated at runtime
    contract: contract as any,
  })

export const V1_BASE_REGISTRAR = ensContract('ensBaseRegistrarImplementation')
export const V1_NAME_WRAPPER = ensContract('ensNameWrapper')
export const V1_PUBLIC_RESOLVER = ensContract('ensPublicResolver')
export const V1_ENS_REGISTRY = ensContract('ensLegacyRegistry')

// V2 .eth `PermissionedRegistry`. ensjs exposes it as `ensRegistry`.
const V2_ETH_REGISTRY = ensContract('ensRegistry')
// V2 ETHRegistrar — holds ROLE_REGISTRAR on the registry root. We impersonate it to
// create the RESERVED premigration entries that migration requires.
const V2_ETH_REGISTRAR = ensContract('ensEthRegistrar')

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------
const BASE_REGISTRAR_ABI = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function nameExpires(uint256 id) view returns (uint256)',
  'function register(uint256 id, address owner, uint256 duration) returns (uint256)',
  'function addController(address controller)',
  'function controllers(address) view returns (bool)',
  'function owner() view returns (address)',
])

const NAME_WRAPPER_ABI = parseAbi([
  'function wrapETH2LD(string label, address wrappedOwner, uint16 ownerControlledFuses, address resolver)',
  'function isWrapped(bytes32 node) view returns (bool)',
])

const ENS_REGISTRY_ABI = parseAbi([
  'function setResolver(bytes32 node, address resolver)',
  'function resolver(bytes32 node) view returns (address)',
])

const RESOLVER_ABI = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function setAddr(bytes32 node, uint256 coinType, bytes a)',
  'function text(bytes32 node, string key) view returns (string)',
])

// PermissionedRegistry.register() — creates AVAILABLE→RESERVED when owner=0.
// Caller must have ROLE_REGISTRAR on the root resource (we impersonate ETH_REGISTRAR).
const V2_ETH_REGISTRY_ABI = parseAbi([
  'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)',
  'function getStatus(uint256 anyId) view returns (uint8)',
])

// ---------------------------------------------------------------------------
// Fuse constants
// ---------------------------------------------------------------------------

/**
 * Owner-controlled NameWrapper fuses (bits 0-6).
 *
 * These are the only fuses `wrapETH2LD` accepts — its `ownerControlledFuses` argument is a
 * `uint16`. Passing anything wider throws at encode time in viem.
 */
export const FUSES = {
  CANNOT_UNWRAP: 1,
  CANNOT_BURN_FUSES: 2,
  CANNOT_TRANSFER: 4,
  CANNOT_SET_RESOLVER: 8,
  CANNOT_SET_TTL: 16,
  CANNOT_CREATE_SUBDOMAIN: 32,
  CANNOT_APPROVE: 64,
} as const

/**
 * Parent-controlled NameWrapper fuses (bits 16-18).
 *
 * NOT settable via `wrapETH2LD` — the wrapper sets `PARENT_CANNOT_CONTROL | IS_DOT_ETH`
 * itself when wrapping a `.eth` 2LD, and `CAN_EXTEND_EXPIRY` can only be granted by a
 * parent via `setSubnodeOwner` / `setChildFuses`, so it is unreachable on a 2LD.
 *
 * Exported for building expected fuse words when mocking the V1 subgraph.
 */
export const PARENT_FUSES = {
  PARENT_CANNOT_CONTROL: 1 << 16,
  IS_DOT_ETH: 1 << 17,
  CAN_EXTEND_EXPIRY: 1 << 18,
} as const

/** Every owner-controlled fuse OR'd together — the widest legal `wrapETH2LD` argument. */
const ALL_OWNER_FUSES = Object.values(FUSES).reduce((a, b) => a | b, 0)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_DURATION = 365 * 24 * 60 * 60

const ANVIL_FUNDER = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

const PARA_EOA_KEY = (process.env.ANVIL_PARA_PRIVATE_KEY ??
  '0x4d1cf5e322e2a7dbfc9e3eccde100ed93167879de7449d18872911ed3a957a81') as `0x${string}`
const PARA_EOA = privateKeyToAccount(PARA_EOA_KEY)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type V1NameType = 'unwrapped' | 'wrapped' | 'locked'

export type V1TextRecord = { key: string; value: string }
export type V1AddressRecord = { coinType: number; value: `0x${string}` }

export type V1NameConfig = {
  /** The label (without `.eth`). A timestamp suffix is appended for uniqueness. */
  label: string
  /**
   * Duration in seconds. Positive = future expiry from now. Negative = the
   * name will be expired by `|duration|` seconds at test time (time is
   * advanced after reservation so the V2 RESERVED slot has a past expiry —
   * useful for testing grace-period UI and renewal flows, NOT migration
   * itself which requires ROLE_REGISTRAR for expired slots).
   *
   * Default: 1 year.
   */
  duration?: number
  /** Owner user key (default: 'user'). Maps to an Anvil mnemonic account. */
  owner?: string
  /**
   * Type of V1 name to create:
   * - `unwrapped` (default): ERC-721 on BaseRegistrar only
   * - `wrapped`: wrapped in NameWrapper with zero owner-controlled fuses (unlocked)
   * - `locked`: wrapped in NameWrapper with at least CANNOT_UNWRAP set
   */
  type?: V1NameType
  /**
   * Additional owner-controlled fuses bitmap (uint16).
   * - For `locked` type: OR'd with CANNOT_UNWRAP (e.g. `FUSES.CANNOT_BURN_FUSES | FUSES.CANNOT_TRANSFER`)
   * - For `wrapped` type: sets fuses directly (CANNOT_UNWRAP is NOT forced)
   * - For `unwrapped` type: ignored
   */
  fuses?: number
  /**
   * Resolver to set on the wrapped name (default: the V1 PublicResolver).
   *
   * Pass `zeroAddress` to wrap with NO resolver. That matters for
   * `CANNOT_SET_RESOLVER` tests: with a resolver pinned, the app refuses to migrate
   * unless that resolver is certified in the on-chain `PublicResolverSet`, because the
   * atomic plan cannot replay records into the replacement resolver. With no resolver
   * there is nothing to lose, so the fuse's role mapping can be tested in isolation.
   */
  v1Resolver?: Address
  /**
   * V1 records to set on the name after registration.
   */
  records?: {
    texts?: V1TextRecord[]
    addresses?: V1AddressRecord[]
  }
}

// ---------------------------------------------------------------------------
// reserveInV2 — creates the RESERVED placeholder in V2 ETH Registry
// ---------------------------------------------------------------------------

/**
 * Create a RESERVED entry in the V2 ETH Registry for a V1 name.
 *
 * Migration controllers have ROLE_REGISTER_RESERVED (not ROLE_REGISTRAR), so
 * they can only migrate names that are already RESERVED in V2. For dynamically-
 * created test names that don't exist in the premigration snapshot, we must call
 * this manually by impersonating the ETH_REGISTRAR (which has ROLE_REGISTRAR).
 *
 * Silently succeeds if the slot is already RESERVED (idempotent guard).
 */
/**
 * Grant the Anvil funder `controller` rights on the V1 BaseRegistrar so tests can mint
 * `.eth` names directly, and make sure the NameWrapper can reclaim them when wrapping.
 *
 * Idempotent — safe to call before every registration.
 */
let baseRegistrarControllerReady = false
async function ensureBaseRegistrarController(): Promise<void> {
  if (baseRegistrarControllerReady) return

  const alreadyController = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'controllers',
    args: [ANVIL_FUNDER.address],
  })
  if (alreadyController) {
    baseRegistrarControllerReady = true
    return
  }

  // On this fork the BaseRegistrar is owned by ETHRenewerV1, a contract. Impersonating a
  // contract address is fine on Anvil, but it still needs gas.
  const registrarOwner = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'owner',
  })
  console.log(
    `[makeV1Name] granting BaseRegistrar controller rights via owner ${registrarOwner}`,
  )

  await testClient.impersonateAccount({ address: registrarOwner })
  try {
    await testClient.setBalance({
      address: registrarOwner,
      value: parseEther('10'),
    })
    for (const controller of [ANVIL_FUNDER.address, V1_NAME_WRAPPER]) {
      const has = await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: BASE_REGISTRAR_ABI,
        functionName: 'controllers',
        args: [controller],
      })
      if (has) continue
      const hash = await walletClient.sendTransaction({
        account: registrarOwner,
        to: V1_BASE_REGISTRAR,
        data: encodeFunctionData({
          abi: BASE_REGISTRAR_ABI,
          functionName: 'addController',
          args: [controller],
        }),
      })
      await waitForTx(hash)
    }
  } finally {
    await testClient.stopImpersonatingAccount({ address: registrarOwner })
  }

  baseRegistrarControllerReady = true
}

/** V2 registry status enum (`PermissionedRegistry.getStatus`). */
const V2_STATUS = { AVAILABLE: 0, RESERVED: 1, REGISTERED: 2 } as const

async function readV2Status(label: string): Promise<number> {
  return publicClient.readContract({
    address: V2_ETH_REGISTRY,
    abi: V2_ETH_REGISTRY_ABI,
    functionName: 'getStatus',
    args: [BigInt(keccak256(toHex(label)))],
  })
}

export async function reserveInV2(
  label: string,
  v1Expiry: bigint,
): Promise<void> {
  // Migration requires a premigrated RESERVED slot: the controllers only hold
  // ROLE_REGISTER_RESERVED, so they can promote a reservation but cannot create a name.
  // Without this the app's preflight classifies the name `notPremigrated` and the
  // migration UI reports "No eligible names found".
  const existing = await readV2Status(label)
  if (existing !== V2_STATUS.AVAILABLE) {
    console.log(
      `[reserveInV2] ${label}.eth already present in V2 (status=${existing}), skipping`,
    )
    return
  }

  console.log(`[reserveInV2] reserving ${label}.eth in V2 (expiry=${v1Expiry})`)

  await testClient.impersonateAccount({ address: V2_ETH_REGISTRAR })
  try {
    // The registrar is a contract address with no ETH balance; impersonating it is not
    // enough, it also has to be able to pay for gas.
    await testClient.setBalance({
      address: V2_ETH_REGISTRAR,
      value: parseEther('10'),
    })
    const hash = await walletClient.sendTransaction({
      account: V2_ETH_REGISTRAR,
      to: V2_ETH_REGISTRY,
      data: encodeFunctionData({
        abi: V2_ETH_REGISTRY_ABI,
        functionName: 'register',
        args: [
          label,
          zeroAddress, // owner = 0 → creates RESERVED (not REGISTERED)
          zeroAddress, // no subregistry yet
          V1_PUBLIC_RESOLVER, // fallback resolver for resolution during unmigrated state
          0n, // roleBitmap must be 0 when owner is zero
          v1Expiry, // sync V1 expiry into V2
        ],
      }),
    })
    await waitForTx(hash)
  } finally {
    await testClient.stopImpersonatingAccount({ address: V2_ETH_REGISTRAR })
  }

  // Verify rather than assume. A silently-failed reservation used to surface much later
  // as an unexplained "no eligible names" in the migration UI.
  const status = await readV2Status(label)
  if (status !== V2_STATUS.RESERVED) {
    throw new Error(
      `[reserveInV2] ${label}.eth is status=${status} after reserving, expected RESERVED (1)`,
    )
  }
  console.log(`[reserveInV2] ✅ ${label}.eth RESERVED in V2`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function waitForTx(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash })
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
type MakeV1NameDependencies = {
  userAccount?: ReturnType<typeof privateKeyToAccount>
}

export function createMakeV1Name(deps: MakeV1NameDependencies = {}) {
  const resolvedUser = deps.userAccount ?? PARA_EOA

  return async function makeV1Name(config: V1NameConfig): Promise<string> {
    const ownerAddress = resolvedUser.address
    const ownerAccount = resolvedUser
    const timestamp = Math.floor(Date.now() / 1000)
    const uniqueLabel = `${config.label}-${timestamp}`
    const absDuration = Math.abs(config.duration ?? DEFAULT_DURATION)
    const isNegativeDuration = (config.duration ?? DEFAULT_DURATION) < 0
    const duration = BigInt(absDuration)

    console.log(
      `[makeV1Name] registering V1 name ${uniqueLabel}.eth (duration=${duration}s, type=${config.type ?? 'unwrapped'})`,
    )

    // ── 0. Fund owner if needed ────────────────────────────────────
    const balance = await publicClient.getBalance({ address: ownerAddress })
    if (balance < 10000000000000000n) {
      const fundTx = await walletClient.sendTransaction({
        account: ANVIL_FUNDER,
        to: ownerAddress,
        value: 100000000000000000n,
      })
      await waitForTx(fundTx)
    }

    // ── 1. Register directly on the BaseRegistrar ──────────────────
    // The forked Sepolia V1 stack has no ETHRegistrarController wired up as a
    // BaseRegistrar controller, so the commit/reveal path reverts. On a fork we can grant
    // ourselves controller rights and mint directly, which is also faster (no commitment
    // wait, no rent payment) and independent of whichever controller ABI is deployed.
    await ensureBaseRegistrarController()

    const tokenId = BigInt(keccak256(toHex(uniqueLabel)))
    const registerTx = await walletClient.sendTransaction({
      account: ANVIL_FUNDER,
      to: V1_BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'register',
        args: [tokenId, ownerAddress, BigInt(duration)],
      }),
    })
    await waitForTx(registerTx)

    // ── 2. Read V1 expiry from BaseRegistrar ───────────────────────
    const v1Expiry = await publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'nameExpires',
      args: [tokenId],
    })

    // ── 5. Reserve in V2 BEFORE any time advancement ───────────────
    // The reservation must be created while v1Expiry is still in the future
    // so the V2 slot gets the correct active expiry.
    await reserveInV2(uniqueLabel, v1Expiry)

    // ── 6. Wrap if requested ────────────────────────────────────────
    const nameType = config.type ?? 'unwrapped'
    if (nameType === 'wrapped' || nameType === 'locked') {
      await wrapName(
        uniqueLabel,
        ownerAddress,
        ownerAccount,
        nameType,
        config.fuses,
        config.v1Resolver,
      )
    }

    // ── 7. Set V1 records if provided ──────────────────────────────
    if (config.records) {
      await setV1Records(uniqueLabel, ownerAccount, nameType, config.records)
    }

    // ── 8. Advance time for negative-duration scenario ─────────────
    // Done LAST so wrapping and records use an active timestamp.
    // Note: names with a past V2 reservation expiry are AVAILABLE in V2
    // (not RESERVED), so migration controllers cannot claim them — these
    // scenarios are for testing expired-name UI and renewal flows, not migration.
    if (isNegativeDuration) {
      const overageSeconds = absDuration + 1
      console.log(
        `[makeV1Name] advancing time ${overageSeconds}s to put ${uniqueLabel}.eth past expiry`,
      )
      await testClient.increaseTime({ seconds: overageSeconds })
      await testClient.mine({ blocks: 1 })
    }

    const ethName = `${uniqueLabel}.eth`
    console.log(
      `[makeV1Name] ✅ ${ethName} (type: ${nameType}, owner: ${ownerAddress})`,
    )
    return ethName
  }
}

// ---------------------------------------------------------------------------
// Wrapping helper
// ---------------------------------------------------------------------------
async function wrapName(
  label: string,
  ownerAddress: Address,
  ownerAccount: ReturnType<typeof privateKeyToAccount>,
  nameType: 'wrapped' | 'locked',
  additionalFuses?: number,
  v1Resolver: Address = V1_PUBLIC_RESOLVER,
) {
  const approved = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'isApprovedForAll',
    args: [ownerAddress, V1_NAME_WRAPPER],
  })

  if (!approved) {
    const approveTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_BASE_REGISTRAR,
      data: encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'setApprovalForAll',
        args: [V1_NAME_WRAPPER, true],
      }),
    })
    await publicClient.waitForTransactionReceipt({ hash: approveTx })
  }

  // For locked: always include CANNOT_UNWRAP, then OR in any additional fuses.
  // For wrapped: use additionalFuses directly (CANNOT_UNWRAP is NOT forced).
  const ownerFuses =
    nameType === 'locked'
      ? FUSES.CANNOT_UNWRAP | (additionalFuses ?? 0)
      : (additionalFuses ?? 0)

  // `wrapETH2LD` takes a uint16. Parent-controlled fuses (PARENT_CANNOT_CONTROL,
  // IS_DOT_ETH, CAN_EXTEND_EXPIRY) live above bit 15 and cannot be set here — viem would
  // otherwise fail with an opaque "not in safe 16-bit unsigned integer range" error.
  if ((ownerFuses & ~ALL_OWNER_FUSES) !== 0) {
    throw new Error(
      `[makeV1Name] fuses=0x${ownerFuses.toString(16)} contains bits outside the ` +
        `owner-controlled set (0x${ALL_OWNER_FUSES.toString(16)}). Parent-controlled fuses ` +
        `such as CAN_EXTEND_EXPIRY cannot be set on a .eth 2LD via wrapETH2LD; they are ` +
        `granted by the parent through setSubnodeOwner/setChildFuses.`,
    )
  }

  console.log(
    `[makeV1Name] wrapping ${label}.eth (fuses=0x${ownerFuses.toString(16)}, type=${nameType})`,
  )

  const wrapTx = await walletClient.sendTransaction({
    account: ownerAccount,
    to: V1_NAME_WRAPPER,
    data: encodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      functionName: 'wrapETH2LD',
      args: [label, ownerAddress, ownerFuses, v1Resolver],
    }),
  })
  await publicClient.waitForTransactionReceipt({ hash: wrapTx })

  const isWrapped = await publicClient.readContract({
    address: V1_NAME_WRAPPER,
    abi: NAME_WRAPPER_ABI,
    functionName: 'isWrapped',
    args: [namehash(`${label}.eth`)],
  })
  if (!isWrapped) {
    throw new Error(`[makeV1Name] wrapping failed for ${label}.eth`)
  }
}

// ---------------------------------------------------------------------------
// V1 record-setting helper
// ---------------------------------------------------------------------------
async function setV1Records(
  label: string,
  ownerAccount: ReturnType<typeof privateKeyToAccount>,
  nameType: V1NameType,
  records: NonNullable<V1NameConfig['records']>,
) {
  const node = namehash(`${label}.eth`)
  const hasRecords =
    (records.texts?.length ?? 0) + (records.addresses?.length ?? 0) > 0
  if (!hasRecords) return

  if (nameType === 'unwrapped') {
    const setResolverTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_ENS_REGISTRY,
      data: encodeFunctionData({
        abi: ENS_REGISTRY_ABI,
        functionName: 'setResolver',
        args: [node, V1_PUBLIC_RESOLVER],
      }),
    })
    await waitForTx(setResolverTx)
  }

  for (const { key, value } of records.texts ?? []) {
    const tx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_PUBLIC_RESOLVER,
      data: encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setText',
        args: [node, key, value],
      }),
    })
    await waitForTx(tx)
  }

  for (const { coinType, value } of records.addresses ?? []) {
    const tx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_PUBLIC_RESOLVER,
      data: encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setAddr',
        args: [node, BigInt(coinType), value],
      }),
    })
    await waitForTx(tx)
  }

  console.log(
    `[makeV1Name] set ${records.texts?.length ?? 0} text + ${records.addresses?.length ?? 0} addr records on ${label}.eth`,
  )
}
