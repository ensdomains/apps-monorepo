import { permissionedRegistryUnregisterSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  type Address,
  decodeFunctionData,
  type Hex,
  keccak256,
  labelhash,
  toHex,
} from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'
import { prepareDeleteSubnameTransaction } from './delete-subname.helpers'

const OWNER: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'
const REGISTRY: Address = '0x666b3d735e366bb8755b65cb5bf7a14c7f41eb23'

// biome-ignore lint/suspicious/noExplicitAny: minimal wallet client mock
const walletClient = { account: { address: OWNER }, chain: sepolia } as any

// A subname whose label is literally `[<labelhash("vault")>]`. The registry
// hashed those 66 characters at registration, so its id is the hash of the
// literal string — not the hash the brackets spell out.
const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`
const ENCODED_LABEL_HASH = keccak256(toHex(ENCODED_LABEL))

const unregisteredId = (data: Hex): bigint => {
  const { args } = decodeFunctionData({
    abi: permissionedRegistryUnregisterSnippet,
    data,
  })
  return args[0]
}

const dataOf = (
  intent: ReturnType<typeof prepareDeleteSubnameTransaction>,
): Hex => {
  if (intent.request.type !== 'eoa') throw new Error('expected an EOA request')
  return intent.request.data as Hex
}

describe('prepareDeleteSubnameTransaction', () => {
  // WEB-1458: the label was sliced off the displayed name and re-hashed, and
  // `labelhash` returns an encoded label's digits unhashed — so deleting
  // `[<labelhash("vault")>].parent.eth` unregistered `vault` instead.
  it('unregisters the id the row carries, not the hash its label spells out', () => {
    const resourceId =
      resourceIdFromChainValue(ENCODED_LABEL_HASH)._unsafeUnwrap()

    const data = dataOf(
      prepareDeleteSubnameTransaction({
        registryAddress: REGISTRY,
        resourceId,
        walletClient,
        chainId: sepolia.id,
        subname: `${ENCODED_LABEL}.parent.eth`,
      }),
    )

    expect(unregisteredId(data)).toBe(BigInt(ENCODED_LABEL_HASH))
    expect(unregisteredId(data)).not.toBe(BigInt(VAULT_LABELHASH))
    // The two really are different names, which is the whole trap.
    expect(BigInt(labelhash(ENCODED_LABEL))).toBe(BigInt(VAULT_LABELHASH))
  })

  it('addresses an ordinary subname by its own labelhash', () => {
    const resourceId = resourceIdFromChainValue(
      labelhash('cold'),
    )._unsafeUnwrap()

    const data = dataOf(
      prepareDeleteSubnameTransaction({
        registryAddress: REGISTRY,
        resourceId,
        walletClient,
        chainId: sepolia.id,
        subname: 'cold.parent.eth',
      }),
    )

    expect(unregisteredId(data)).toBe(BigInt(labelhash('cold')))
  })
})
