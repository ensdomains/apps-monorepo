import { localReceipt } from '../helpers/local-receipt.js'
/**
 * Write V1 records onto any level of a name tree.
 *
 * `makeV1Name` can already set records, but only on a `.eth` 2LD it registered
 * itself, and only where wrapping happened to leave a resolver behind. The
 * matrix needs records on the *leaf*, which is a 3LD or 4LD in two thirds of
 * the shapes, and it needs them written by whoever the chain says may write
 * them rather than by whoever the shape nominally calls the holder.
 *
 * Two facts make this more than a copy of that helper:
 *
 * 1. **The resolver has to be set first, and how depends on the wrap class.** A
 *    subname is created with no resolver at all. An unwrapped name takes
 *    `ENSRegistry.setResolver` from its controller; a wrapped one takes
 *    `NameWrapper.setResolver` from the wrapper owner, because the registry
 *    slot belongs to the wrapper and an EOA calling the registry reverts.
 * 2. **A name may already have the resolver it is allowed to have.** A shape
 *    that burned `CANNOT_SET_RESOLVER` still resolves — the fuse freezes the
 *    resolver, it does not remove it — so records are writable there as long as
 *    nothing tries to re-point it. Checking before writing is what keeps that
 *    shape seedable instead of silently recorded as "no records".
 *
 * Everything is read back (ground rule 5). Records that fail to write and are
 * not noticed would turn every positive record cell into an assertion that the
 * page renders nothing, which is what B7 exists to stop doing.
 */

import {
  type Address,
  encodeFunctionData,
  getAddress,
  type Hash,
  type Hex,
  namehash,
  parseAbi,
} from 'viem'
import {
  generatePrivateKey,
  type privateKeyToAccount,
  privateKeyToAddress,
} from 'viem/accounts'
import {
  publicClient,
  testClient,
  walletClient,
} from '../helpers/anvil-client.js'
import {
  V1_ENS_REGISTRY,
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
} from './makeV1Name.js'

type Signer = ReturnType<typeof privateKeyToAccount>

const REGISTRY_ABI = parseAbi([
  'function setResolver(bytes32 node, address resolver)',
  'function resolver(bytes32 node) view returns (address)',
])
const WRAPPER_ABI = parseAbi([
  'function setResolver(bytes32 node, address resolver)',
])
export const RESOLVER_ABI = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function setAddr(bytes32 node, uint256 coinType, bytes a)',
  'function setContenthash(bytes32 node, bytes hash)',
  'function setABI(bytes32 node, uint256 contentType, bytes data)',
  'function setPubkey(bytes32 node, bytes32 x, bytes32 y)',
  'function setInterface(bytes32 node, bytes4 interfaceID, address implementer)',
  'function multicall(bytes[] data) returns (bytes[])',
  'function text(bytes32 node, string key) view returns (string)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
  'function contenthash(bytes32 node) view returns (bytes)',
  'function ABI(bytes32 node, uint256 contentTypes) view returns (uint256, bytes)',
  'function pubkey(bytes32 node) view returns (bytes32 x, bytes32 y)',
  'function interfaceImplementer(bytes32 node, bytes4 interfaceID) view returns (address)',
])

export type V1Records = {
  readonly texts?: readonly { readonly key: string; readonly value: string }[]
  /** Coin type to address. 60 is ETH. */
  readonly addresses?: readonly {
    readonly coinType: number
    readonly value: Hex
  }[]
  readonly contenthash?: Hex
  /** One entry per content type (1 = JSON, 2 = zlib JSON, 4 = CBOR, 8 = URI). */
  readonly abis?: readonly {
    readonly contentType: number
    readonly data: Hex
  }[]
  readonly pubkey?: { readonly x: Hex; readonly y: Hex }
  readonly interfaces?: readonly {
    readonly interfaceId: Hex
    readonly implementer: Address
  }[]
}

const send = async (account: Signer, to: Address, data: Hash, what: string) => {
  const hash = await walletClient.sendTransaction({ account, to, data })
  const receipt = await localReceipt(hash)
  if (receipt.status !== 'success') {
    throw new Error(`[v1-records] ${what} reverted (tx ${hash})`)
  }
}

const currentResolver = (node: `0x${string}`) =>
  publicClient.readContract({
    address: V1_ENS_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'resolver',
    args: [node],
  })

/**
 * Point the name at `resolver`, unless it already is.
 *
 * `isWrapped` decides the contract, not a guess from the signer: calling the
 * registry on a wrapped name reverts with no useful message, and calling the
 * wrapper on an unwrapped one reverts differently.
 */
const ensureResolver = async (
  name: string,
  signer: Signer,
  isWrapped: boolean,
  resolver: Address,
): Promise<void> => {
  const node = namehash(name)
  const existing = await currentResolver(node)
  if (getAddress(existing) === getAddress(resolver)) return

  await send(
    signer,
    isWrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
    encodeFunctionData({
      abi: isWrapped ? WRAPPER_ABI : REGISTRY_ABI,
      functionName: 'setResolver',
      args: [node, resolver],
    }),
    `setResolver(${name}, via ${isWrapped ? 'NameWrapper' : 'ENSRegistry'})`,
  )

  const now = await currentResolver(node)
  if (getAddress(now) !== getAddress(resolver)) {
    throw new Error(
      `[v1-records] ${name}: resolver is ${now} after setResolver, expected ${resolver}`,
    )
  }
}

/** Every setter `records` needs, as calldata for the resolver's multicall. */
const setterCalls = (node: Hex, records: V1Records): Hex[] => {
  const call = (
    functionName: Parameters<
      typeof encodeFunctionData<typeof RESOLVER_ABI>
    >[0]['functionName'],
    args: readonly unknown[],
  ) =>
    encodeFunctionData({
      abi: RESOLVER_ABI,
      functionName,
      args,
    } as never)
  return [
    ...(records.texts ?? []).map(({ key, value }) =>
      call('setText', [node, key, value]),
    ),
    ...(records.addresses ?? []).map(({ coinType, value }) =>
      call('setAddr', [node, BigInt(coinType), value]),
    ),
    ...(records.contenthash
      ? [call('setContenthash', [node, records.contenthash])]
      : []),
    ...(records.abis ?? []).map(({ contentType, data }) =>
      call('setABI', [node, BigInt(contentType), data]),
    ),
    ...(records.pubkey
      ? [call('setPubkey', [node, records.pubkey.x, records.pubkey.y])]
      : []),
    ...(records.interfaces ?? []).map(({ interfaceId, implementer }) =>
      call('setInterface', [node, interfaceId, implementer]),
    ),
  ]
}

export type RecordCheck = {
  readonly what: string
  readonly functionName: string
  readonly args: readonly unknown[]
  /** The value as the getter returns it, normalised for comparison. */
  readonly want: string
  readonly normalise: (got: unknown) => string
}

const lower = (got: unknown) => String(got).toLowerCase()

/** One read-back per record in `records`. */
export const recordChecks = (node: Hex, records: V1Records): RecordCheck[] => [
  ...(records.texts ?? []).map(({ key, value }) => ({
    what: `text "${key}"`,
    functionName: 'text',
    args: [node, key],
    want: value,
    normalise: String,
  })),
  ...(records.addresses ?? []).map(({ coinType, value }) => ({
    what: `coin ${coinType}`,
    functionName: 'addr',
    args: [node, BigInt(coinType)],
    want: value.toLowerCase(),
    normalise: lower,
  })),
  ...(records.contenthash
    ? [
        {
          what: 'contenthash',
          functionName: 'contenthash',
          args: [node],
          want: records.contenthash.toLowerCase(),
          normalise: lower,
        },
      ]
    : []),
  ...(records.abis ?? []).map(({ contentType, data }) => ({
    what: `ABI ${contentType}`,
    functionName: 'ABI',
    args: [node, BigInt(contentType)],
    want: `${contentType}:${data.toLowerCase()}`,
    normalise: (got: unknown) => {
      const [type, bytes] = got as [bigint, Hex]
      return `${type}:${bytes.toLowerCase()}`
    },
  })),
  ...(records.pubkey
    ? [
        {
          what: 'pubkey',
          functionName: 'pubkey',
          args: [node],
          want: `${records.pubkey.x},${records.pubkey.y}`.toLowerCase(),
          normalise: (got: unknown) => (got as Hex[]).join(',').toLowerCase(),
        },
      ]
    : []),
  ...(records.interfaces ?? []).map(({ interfaceId, implementer }) => ({
    what: `interface ${interfaceId}`,
    functionName: 'interfaceImplementer',
    args: [node, interfaceId],
    want: implementer.toLowerCase(),
    normalise: lower,
  })),
]

/** Read every record in `records` back from `resolver`; throw on any mismatch. */
const assertRecordsOn = async (
  name: string,
  resolver: Address,
  records: V1Records,
): Promise<void> => {
  for (const check of recordChecks(namehash(name), records)) {
    const got = check.normalise(
      await publicClient.readContract({
        address: resolver,
        abi: RESOLVER_ABI,
        functionName: check.functionName,
        args: check.args,
      } as never),
    )
    if (got !== check.want)
      throw new Error(
        `[v1-records] ${name}: ${check.what} reads ${got} after writing ${check.want}`,
      )
  }
}

/**
 * Write the records and prove each one landed.
 *
 * One `multicall` on the resolver carries every setter, so a name with fifty
 * records costs one transaction, not fifty. `resolver` defaults to the public
 * resolver the app knows; pass another (see `cloneV1PublicResolver`) to seed a
 * name the app has to treat as custom.
 */
export const setV1RecordsOn = async (
  name: string,
  signer: Signer,
  isWrapped: boolean,
  records: V1Records,
  { resolver = V1_PUBLIC_RESOLVER }: { readonly resolver?: Address } = {},
): Promise<void> => {
  const node = namehash(name)
  await ensureResolver(name, signer, isWrapped, resolver)

  const calls = setterCalls(node, records)
  if (calls.length > 0)
    await send(
      signer,
      resolver,
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'multicall',
        args: [calls],
      }),
      `multicall(${name}, ${calls.length} setters)`,
    )
  await assertRecordsOn(name, resolver, records)

  console.log(`[v1-records] ${name}: ${calls.length} record(s) on ${resolver}`)
}

/**
 * A working V1 resolver that is not on the app's known-resolver list.
 *
 * The public resolver's bytecode copied to a fresh address. Its wiring (the
 * registry, the NameWrapper, the trusted controllers) is immutable, so it
 * lives in the code and comes along; its records are per-contract storage, so
 * the copy starts empty. Authorisation reads the registry and the wrapper,
 * exactly as the original does, so a name's owner can write to it.
 */
export const cloneV1PublicResolver = async (): Promise<Address> => {
  const code = await publicClient.getCode({ address: V1_PUBLIC_RESOLVER })
  if (!code || code === '0x')
    throw new Error('[v1-records] the public resolver has no code on this fork')
  const address = privateKeyToAddress(generatePrivateKey())
  await testClient.setCode({ address, bytecode: code })
  return address
}
