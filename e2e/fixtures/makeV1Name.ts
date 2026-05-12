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
 * The registered name is owned by the specified account's EOA address.
 */
import {
  type Address,
  type Hash,
  encodeFunctionData,
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
// V1 Contract addresses (Sepolia)
// ---------------------------------------------------------------------------
const V1_ETH_REGISTRAR_CONTROLLER =
  '0xF42dF26c1b222bee5a6B78cBB8bbfaa0Ba07786a' as const
const V1_BASE_REGISTRAR =
  '0x6409609247722761b8ba96371485de92a6d7b83b' as const
const V1_NAME_WRAPPER =
  '0xc7e033b8836e4bd55d069d113f018b98478cb091' as const
const V1_PUBLIC_RESOLVER =
  '0x640294a2b2d87e7f522db3e3e3e876764bce170d' as const
const V1_ENS_REGISTRY =
  '0x7e89b563f936c68c31a360840eb7f9a4aacaf014' as const

// ---------------------------------------------------------------------------
// ABIs — struct-based controller
// The controller uses a tuple struct for makeCommitment and register:
// (string name, address owner, uint256 duration, bytes32 secret,
//  address resolver, bytes[] data, uint8 reverseRecord, bytes32 referral)
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

/** CANNOT_UNWRAP fuse bit — set this to lock a wrapped name */
const CANNOT_UNWRAP = 1

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Default registration duration: 1 year */
const DEFAULT_DURATION = 365 * 24 * 60 * 60

// Anvil's first default account (has 10 000 ETH — used for gas funding)
const ANVIL_FUNDER = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)

// Para test account private key — owns names as the Para EOA so the
// migration UI detects them without needing a separate transfer step.
const PARA_EOA_KEY =
  (process.env.ANVIL_PARA_PRIVATE_KEY ??
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
  /** Duration in seconds (default: 1 year). */
  duration?: number
  /** Owner user key (default: 'user'). Maps to an Anvil mnemonic account. */
  owner?: string
  /**
   * Type of V1 name to create:
   * - `unwrapped` (default): ERC-721 on BaseRegistrar only
   * - `wrapped`: wrapped in NameWrapper with fuses=0 (unlocked)
   * - `locked`: wrapped in NameWrapper with CANNOT_UNWRAP fuse set
   */
  type?: V1NameType
  /**
   * V1 records to set on the name after registration.
   * For unwrapped names, the resolver is set on the ENS registry first.
   * For wrapped/locked names, the resolver is already set during wrapping.
   */
  records?: {
    texts?: V1TextRecord[]
    addresses?: V1AddressRecord[]
  }
}

// No external dependencies needed — the Para EOA key is built in.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function waitForTx(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash })
}

type RegistrationStruct = readonly [
  string,    // name
  Address,   // owner
  bigint,    // duration
  `0x${string}`, // secret
  Address,   // resolver
  readonly `0x${string}`[], // data
  number,    // reverseRecord
  `0x${string}`, // referral
]

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createMakeV1Name() {
  /**
   * Register a V1 (legacy, unwrapped) .eth name on the Anvil fork.
   *
   * The name is registered as an unwrapped ERC-721 on the BaseRegistrar,
   * owned by the specified user's EOA address.
   */
  return async function makeV1Name(
    config: V1NameConfig,
  ): Promise<string> {
    // Default: register to the Para EOA so migration UI detects the name.
    // The Anvil funder sends the ETH for registration on behalf of the EOA.
    const ownerAddress = PARA_EOA.address
    const ownerAccount = PARA_EOA
    const timestamp = Math.floor(Date.now() / 1000)
    const uniqueLabel = `${config.label}-${timestamp}`
    const duration = BigInt(config.duration ?? DEFAULT_DURATION)
    const secret = keccak256(toHex(`v1-${uniqueLabel}:${Math.random()}`))

    console.log(
      `[makeV1Name] registering V1 name ${uniqueLabel}.eth (duration=${duration}s)`,
    )

    // ── 0. Ensure the Para EOA has ETH for the commit tx gas ──────
    // The register tx is sent by the Anvil funder, but commit needs
    // to come from the owner for the commitment to be valid.
    const balance = await publicClient.getBalance({ address: ownerAddress })
    if (balance < 10000000000000000n) { // < 0.01 ETH
      const fundTx = await walletClient.sendTransaction({
        account: ANVIL_FUNDER,
        to: ownerAddress,
        value: 100000000000000000n, // 0.1 ETH
      })
      await waitForTx(fundTx)
    }

    // Build the registration struct
    const regStruct: RegistrationStruct = [
      uniqueLabel,
      ownerAddress,
      duration,
      secret,
      zeroAddress,  // resolver (none for unwrapped)
      [],           // data
      0,            // reverseRecord (false)
      zeroHash as `0x${string}`,     // referral (none)
    ]

    // ── 1. Make commitment ────────────────────────────────────────
    const commitment = await publicClient.readContract({
      address: V1_ETH_REGISTRAR_CONTROLLER,
      abi: V1_CONTROLLER_ABI,
      functionName: 'makeCommitment',
      args: [regStruct],
    })

    console.log(`[makeV1Name] commitment: ${commitment}`)

    // ── 2. Submit commitment ──────────────────────────────────────
    const commitData = encodeFunctionData({
      abi: V1_CONTROLLER_ABI,
      functionName: 'commit',
      args: [commitment],
    })
    const commitTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_ETH_REGISTRAR_CONTROLLER,
      data: commitData,
    })
    await waitForTx(commitTx)

    // ── 3. Wait for minCommitmentAge ──────────────────────────────
    let minAge = 0n
    try {
      minAge = await publicClient.readContract({
        address: V1_ETH_REGISTRAR_CONTROLLER,
        abi: V1_CONTROLLER_ABI,
        functionName: 'minCommitmentAge',
      })
    } catch {
      // Default to 0
    }

    if (minAge > 0n) {
      const waitSec = Number(minAge) + 1
      console.log(`[makeV1Name] advancing time ${waitSec}s for minCommitmentAge`)
      await testClient.increaseTime({ seconds: waitSec })
      await testClient.mine({ blocks: 1 })
    }

    // ── 4. Get rent price (ETH) and register ──────────────────────
    const price = await publicClient.readContract({
      address: V1_ETH_REGISTRAR_CONTROLLER,
      abi: V1_CONTROLLER_ABI,
      functionName: 'rentPrice',
      args: [uniqueLabel, duration],
    })

    // Add 10% buffer
    const value = (price * 110n) / 100n

    const registerData = encodeFunctionData({
      abi: V1_CONTROLLER_ABI,
      functionName: 'register',
      args: [regStruct],
    })
    const registerTx = await walletClient.sendTransaction({
      account: ownerAccount,
      to: V1_ETH_REGISTRAR_CONTROLLER,
      data: registerData,
      value,
    })
    await waitForTx(registerTx)

    const ethName = `${uniqueLabel}.eth`
    const nameType = config.type ?? 'unwrapped'

    // ── 5. Optionally wrap the name ────────────────────────────────
    if (nameType === 'wrapped' || nameType === 'locked') {
      await wrapName(uniqueLabel, ownerAddress, ownerAccount, nameType)
    }

    // ── 6. Optionally set V1 records ──────────────────────────────
    if (config.records) {
      await setV1Records(uniqueLabel, ownerAccount, nameType, config.records)
    }

    console.log(
      `[makeV1Name] ✅ registered V1 name: ${ethName} (type: ${nameType}, owner: ${ownerAddress})`,
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
) {
  // 1. Approve NameWrapper as operator on BaseRegistrar (if not already)
  const approved = await publicClient.readContract({
    address: V1_BASE_REGISTRAR,
    abi: BASE_REGISTRAR_ABI,
    functionName: 'isApprovedForAll',
    args: [ownerAddress, V1_NAME_WRAPPER],
  })

  if (!approved) {
    console.log('[makeV1Name] approving NameWrapper on BaseRegistrar')
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

  // 2. Wrap via NameWrapper.wrapETH2LD
  const fuses = nameType === 'locked' ? CANNOT_UNWRAP : 0
  console.log(
    `[makeV1Name] wrapping ${label}.eth (fuses=${fuses}, type=${nameType})`,
  )

  const wrapTx = await walletClient.sendTransaction({
    account: ownerAccount,
    to: V1_NAME_WRAPPER,
    data: encodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      functionName: 'wrapETH2LD',
      args: [label, ownerAddress, fuses, V1_PUBLIC_RESOLVER],
    }),
  })
  await publicClient.waitForTransactionReceipt({ hash: wrapTx })

  // 3. Verify wrapping succeeded
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

  // For unwrapped names, the resolver is not set during registration.
  // We need to set it on the ENS registry first.
  if (nameType === 'unwrapped') {
    console.log(`[makeV1Name] setting resolver on registry for ${label}.eth`)
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
  // For wrapped/locked names, the resolver was already set during wrapETH2LD.

  // Set text records
  for (const { key, value } of records.texts ?? []) {
    console.log(`[makeV1Name] setText(${key}=${value}) on ${label}.eth`)
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

  // Set address records
  for (const { coinType, value } of records.addresses ?? []) {
    console.log(`[makeV1Name] setAddr(coinType=${coinType}) on ${label}.eth`)
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
