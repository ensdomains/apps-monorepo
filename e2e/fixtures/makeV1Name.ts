/**
 * makeV1Name fixture — registers .eth names on the Anvil Sepolia fork
 * using the V1 ETHRegistrarController (unwrapped controller).
 *
 * V1 registration differs from V2:
 *   - Payment is in ETH (msg.value), not ERC-20 tokens
 *   - Uses struct-based ABI: (name, owner, duration, secret, resolver, data[], reverseRecord, referral)
 *   - Creates an unwrapped ERC-721 token on the BaseRegistrar
 *   - Has a 60-second minCommitmentAge (requires time advancement)
 *
 * After each V1 registration, reserveInV2() creates the RESERVED placeholder
 * in the V2 ETH Registry. Migration controllers only hold ROLE_REGISTER_RESERVED —
 * they cannot register AVAILABLE names. Without this step, MigrationHelper.migrate()
 * reverts when the migration controller tries to claim the V2 slot.
 *
 * The registered name is owned by the specified account's EOA address.
 */
import {
  type Address,
  encodeFunctionData,
  type Hash,
  keccak256,
  namehash,
  parseAbi,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'

// ---------------------------------------------------------------------------
// V1 Contract addresses (Sepolia fork)
// ---------------------------------------------------------------------------
const V1_ETH_REGISTRAR_CONTROLLER =
  '0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968' as const
export const V1_BASE_REGISTRAR =
  '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85' as Address
const V1_BASE_REGISTRAR_OWNER =
  '0xf2ece44980778966b8a0FccB3A9E339440f6e045' as Address
export const V1_NAME_WRAPPER =
  '0x0635513f179D50A207757E05759CbD106d7dFcE8' as Address
export const V1_PUBLIC_RESOLVER =
  '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as Address
export const V1_ENS_REGISTRY =
  '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as Address

// ---------------------------------------------------------------------------
// V2 Contract addresses — used by reserveInV2()
// ---------------------------------------------------------------------------
// ETH Registry (PermissionedRegistry for .eth)
const V2_ETH_REGISTRY = '0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4' as Address
// ETH Registrar — has ROLE_REGISTRAR on V2_ETH_REGISTRY (baked by bake-contracts.py)
// We impersonate it to create RESERVED entries for dynamically-created test names.
const V2_ETH_REGISTRAR = '0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3' as Address

// ---------------------------------------------------------------------------
// ABIs — struct-based V1 controller
// ---------------------------------------------------------------------------
const V1_CONTROLLER_ABI = parseAbi([
  'function makeCommitment((string,address,uint256,bytes32,address,bytes[],uint8,bytes32)) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32)) payable',
  'function rentPrice(string name, uint256 duration) view returns (uint256)',
  'function minCommitmentAge() view returns (uint256)',
  'function available(string name) view returns (bool)',
])

const BASE_REGISTRAR_ABI = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function controllers(address controller) view returns (bool)',
  'function addController(address controller)',
  'function nameExpires(uint256 id) view returns (uint256)',
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
])

// ---------------------------------------------------------------------------
// Fuse constants (NameWrapper owner-controlled fuses, bits 0-6)
// ---------------------------------------------------------------------------
export const FUSES = {
  CANNOT_UNWRAP: 1,
  CANNOT_BURN_FUSES: 2,
  CANNOT_TRANSFER: 4,
  CANNOT_SET_RESOLVER: 8,
  CANNOT_SET_TTL: 16,
  CANNOT_CREATE_SUBDOMAIN: 32,
  CANNOT_APPROVE: 64,
  CAN_EXTEND_EXPIRY: 1 << 18, // parent-controlled, but setChildFuses can set on child
} as const

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_DURATION = 365 * 24 * 60 * 60
const PREMIGRATION_BONUS_PERIOD = 62n * 24n * 60n * 60n + 1n
const FIXTURE_TRANSACTION_GAS = 2_000_000n
const IMPERSONATED_ACCOUNT_BALANCE = 10_000_000_000_000_000_000n

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
export async function reserveInV2(
  label: string,
  v1Expiry: bigint,
): Promise<void> {
  console.log(`[reserveInV2] reserving ${label}.eth in V2 (expiry=${v1Expiry})`)

  await testClient.setBalance({
    address: V2_ETH_REGISTRAR,
    value: IMPERSONATED_ACCOUNT_BALANCE,
  })
  await testClient.impersonateAccount({ address: V2_ETH_REGISTRAR })
  try {
    const hash = await walletClient.sendTransaction({
      account: V2_ETH_REGISTRAR,
      to: V2_ETH_REGISTRY,
      gas: FIXTURE_TRANSACTION_GAS,
      data: encodeFunctionData({
        abi: V2_ETH_REGISTRY_ABI,
        functionName: 'register',
        args: [
          label,
          zeroAddress, // owner = 0 → creates RESERVED (not REGISTERED)
          zeroAddress, // no subregistry yet
          V1_PUBLIC_RESOLVER, // fallback resolver for resolution during unmigrated state
          0n, // roleBitmap must be 0 when owner is zero
          v1Expiry,
        ],
      }),
    })
    await waitForTx(hash)
    console.log(`[reserveInV2] ✅ ${label}.eth RESERVED in V2`)
  } catch (err: unknown) {
    // LabelAlreadyReserved → already RESERVED, nothing to do
    const msg = err instanceof Error ? err.message : String(err)
    if (
      msg.includes('LabelAlreadyReserved') ||
      msg.includes('AlreadyRegistered')
    ) {
      console.log(`[reserveInV2] ${label}.eth already RESERVED, skipping`)
    } else {
      throw err
    }
  } finally {
    await testClient.stopImpersonatingAccount({ address: V2_ETH_REGISTRAR })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function waitForTx(hash: Hash): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === 'reverted') {
    throw new Error(`Fixture transaction reverted: ${hash}`)
  }
}

async function ensureV1ControllerAuthorized(): Promise<void> {
  const authorized = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'controllers',
    args: [V1_ETH_REGISTRAR_CONTROLLER],
  })
  if (authorized) return

  await testClient.setBalance({
    address: V1_BASE_REGISTRAR_OWNER,
    value: IMPERSONATED_ACCOUNT_BALANCE,
  })
  await testClient.impersonateAccount({ address: V1_BASE_REGISTRAR_OWNER })
  try {
    const hash = await walletClient.sendTransaction({
      account: V1_BASE_REGISTRAR_OWNER,
      to: V1_BASE_REGISTRAR,
      gas: FIXTURE_TRANSACTION_GAS,
      data: encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'addController',
        args: [V1_ETH_REGISTRAR_CONTROLLER],
      }),
    })
    await waitForTx(hash)
  } finally {
    await testClient.stopImpersonatingAccount({
      address: V1_BASE_REGISTRAR_OWNER,
    })
  }
}

type RegistrationStruct = readonly [
  string,
  Address,
  bigint,
  `0x${string}`,
  Address,
  readonly `0x${string}`[],
  number,
  `0x${string}`,
]

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
    await ensureV1ControllerAuthorized()

    const timestamp = Math.floor(Date.now() / 1000)
    const uniqueLabel = `${config.label}-${timestamp}`
    const absDuration = Math.abs(config.duration ?? DEFAULT_DURATION)
    const isNegativeDuration = (config.duration ?? DEFAULT_DURATION) < 0
    const duration = BigInt(absDuration)
    const secret = keccak256(toHex(`v1-${uniqueLabel}:${Math.random()}`))

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

    const regStruct: RegistrationStruct = [
      uniqueLabel,
      ownerAddress,
      duration,
      secret,
      zeroAddress,
      [],
      0,
      zeroHash as `0x${string}`,
    ]

    // ── 1. Commit ──────────────────────────────────────────────────
    const commitment = await publicClient.readContract({
      address: V1_ETH_REGISTRAR_CONTROLLER,
      abi: V1_CONTROLLER_ABI,
      functionName: 'makeCommitment',
      args: [regStruct],
    })

    const commitTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_ETH_REGISTRAR_CONTROLLER,
      gas: FIXTURE_TRANSACTION_GAS,
      data: encodeFunctionData({
        abi: V1_CONTROLLER_ABI,
        functionName: 'commit',
        args: [commitment],
      }),
    })
    await waitForTx(commitTx)

    // ── 2. Wait for minCommitmentAge ───────────────────────────────
    let minAge = 0n
    try {
      minAge = await publicClient.readContract({
        address: V1_ETH_REGISTRAR_CONTROLLER,
        abi: V1_CONTROLLER_ABI,
        functionName: 'minCommitmentAge',
      })
    } catch {
      /* default 0 */
    }

    if (minAge > 0n) {
      await testClient.increaseTime({ seconds: Number(minAge) + 1 })
      await testClient.mine({ blocks: 1 })
    }

    // ── 3. Register ────────────────────────────────────────────────
    const price = await publicClient.readContract({
      address: V1_ETH_REGISTRAR_CONTROLLER,
      abi: V1_CONTROLLER_ABI,
      functionName: 'rentPrice',
      args: [uniqueLabel, duration],
    })

    const registerTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_ETH_REGISTRAR_CONTROLLER,
      gas: FIXTURE_TRANSACTION_GAS,
      data: encodeFunctionData({
        abi: V1_CONTROLLER_ABI,
        functionName: 'register',
        args: [regStruct],
      }),
      value: (price * 110n) / 100n,
    })
    await waitForTx(registerTx)

    // ── 4. Read V1 expiry from BaseRegistrar ───────────────────────
    const tokenId = BigInt(keccak256(toHex(uniqueLabel)))
    const v1Expiry = await publicClient.readContract({
      address: V1_BASE_REGISTRAR,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'nameExpires',
      args: [tokenId],
    })

    // ── 5. Reserve in V2 BEFORE any time advancement ───────────────
    // Production pre-migration reserves through the V1 expiry plus the 62-day
    // migration bonus window. Readiness rejects a stale, shorter reservation.
    await reserveInV2(uniqueLabel, v1Expiry + PREMIGRATION_BONUS_PERIOD)

    // ── 6. Wrap if requested ────────────────────────────────────────
    const nameType = config.type ?? 'unwrapped'
    if (nameType === 'wrapped' || nameType === 'locked') {
      await wrapName(
        uniqueLabel,
        ownerAddress,
        ownerAccount,
        nameType,
        config.fuses,
      )
    }

    // ── 7. Set V1 records if provided ──────────────────────────────
    if (config.records) {
      await setV1Records(uniqueLabel, ownerAccount, nameType, config.records)
    }

    // ── 8. Advance time for negative-duration scenario ─────────────
    // Done LAST so wrapping and records use an active timestamp.
    // V2 reservation expiry still follows the bonus window above.
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
      gas: FIXTURE_TRANSACTION_GAS,
      data: encodeFunctionData({
        abi: BASE_REGISTRAR_ABI,
        functionName: 'setApprovalForAll',
        args: [V1_NAME_WRAPPER, true],
      }),
    })
    await waitForTx(approveTx)
  }

  // For locked: always include CANNOT_UNWRAP, then OR in any additional fuses.
  // For wrapped: use additionalFuses directly (CANNOT_UNWRAP is NOT forced).
  const ownerFuses =
    nameType === 'locked'
      ? FUSES.CANNOT_UNWRAP | (additionalFuses ?? 0)
      : (additionalFuses ?? 0)

  console.log(
    `[makeV1Name] wrapping ${label}.eth (fuses=0x${ownerFuses.toString(16)}, type=${nameType})`,
  )

  const wrapTx = await walletClient.sendTransaction({
    account: ownerAccount,
    to: V1_NAME_WRAPPER,
    gas: FIXTURE_TRANSACTION_GAS,
    data: encodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      functionName: 'wrapETH2LD',
      args: [label, ownerAddress, ownerFuses, V1_PUBLIC_RESOLVER],
    }),
  })
  await waitForTx(wrapTx)

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
      gas: FIXTURE_TRANSACTION_GAS,
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
      gas: FIXTURE_TRANSACTION_GAS,
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
      gas: FIXTURE_TRANSACTION_GAS,
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
