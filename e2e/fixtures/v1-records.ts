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
  namehash,
  parseAbi,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'
import { publicClient, walletClient } from '../helpers/anvil-client.js'
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
const RESOLVER_ABI = parseAbi([
  'function setText(bytes32 node, string key, string value)',
  'function setAddr(bytes32 node, uint256 coinType, bytes a)',
  'function text(bytes32 node, string key) view returns (string)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
])

export type V1Records = {
  readonly texts?: readonly { readonly key: string; readonly value: string }[]
  /** Coin type to address. 60 is ETH. */
  readonly addresses?: readonly {
    readonly coinType: number
    readonly value: Address
  }[]
}

const send = async (account: Signer, to: Address, data: Hash, what: string) => {
  const hash = await walletClient.sendTransaction({ account, to, data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
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
 * Point the name at the public resolver, unless it already is.
 *
 * `isWrapped` decides the contract, not a guess from the signer: calling the
 * registry on a wrapped name reverts with no useful message, and calling the
 * wrapper on an unwrapped one reverts differently.
 */
const ensureResolver = async (
  name: string,
  signer: Signer,
  isWrapped: boolean,
): Promise<void> => {
  const node = namehash(name)
  const existing = await currentResolver(node)
  if (getAddress(existing) === getAddress(V1_PUBLIC_RESOLVER)) return

  await send(
    signer,
    isWrapped ? V1_NAME_WRAPPER : V1_ENS_REGISTRY,
    encodeFunctionData({
      abi: isWrapped ? WRAPPER_ABI : REGISTRY_ABI,
      functionName: 'setResolver',
      args: [node, V1_PUBLIC_RESOLVER],
    }),
    `setResolver(${name}, via ${isWrapped ? 'NameWrapper' : 'ENSRegistry'})`,
  )

  const now = await currentResolver(node)
  if (getAddress(now) !== getAddress(V1_PUBLIC_RESOLVER)) {
    throw new Error(
      `[v1-records] ${name}: resolver is ${now} after setResolver, expected ${V1_PUBLIC_RESOLVER}`,
    )
  }
}

/** Write the records and prove each one landed. */
export const setV1RecordsOn = async (
  name: string,
  signer: Signer,
  isWrapped: boolean,
  records: V1Records,
): Promise<void> => {
  const node = namehash(name)
  await ensureResolver(name, signer, isWrapped)

  for (const { key, value } of records.texts ?? []) {
    await send(
      signer,
      V1_PUBLIC_RESOLVER,
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setText',
        args: [node, key, value],
      }),
      `setText(${name}, ${key})`,
    )
    const written = await publicClient.readContract({
      address: V1_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: 'text',
      args: [node, key],
    })
    if (written !== value) {
      throw new Error(
        `[v1-records] ${name}: text "${key}" reads "${written}" after writing "${value}"`,
      )
    }
  }

  for (const { coinType, value } of records.addresses ?? []) {
    await send(
      signer,
      V1_PUBLIC_RESOLVER,
      encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: 'setAddr',
        args: [node, BigInt(coinType), value],
      }),
      `setAddr(${name}, coin ${coinType})`,
    )
    const written = await publicClient.readContract({
      address: V1_PUBLIC_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: 'addr',
      args: [node, BigInt(coinType)],
    })
    if (getAddress(written as Address) !== getAddress(value)) {
      throw new Error(
        `[v1-records] ${name}: coin ${coinType} reads ${written} after writing ${value}`,
      )
    }
  }

  console.log(
    `[v1-records] ${name}: ${records.texts?.length ?? 0} text + ${records.addresses?.length ?? 0} addr`,
  )
}
