import { userRegistrySetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  decodeFunctionData,
  type Hex,
  labelhash,
  type WalletClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  requireResourceIdForName,
  resourceIdForName,
} from '@/lib/resource/resourceId'
import { prepareSetSubregistryTransaction } from './setSubregistry'

const FROM: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'
const PARENT_REGISTRY: Address = '0x666b3d735e366bb8755b65cb5bf7a14c7f41eb23'
const SUBREGISTRY: Address = '0x2245606Dd6B3ae61205fCf8c843E200CC2f1123d'

const walletClient = {
  account: { address: FROM },
  chain: sepolia,
} as unknown as WalletClient

const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`

const setSubregistryArgs = (data: Hex) =>
  decodeFunctionData({ abi: userRegistrySetSubregistrySnippet, data }).args

const dataOf = (
  intent: ReturnType<typeof prepareSetSubregistryTransaction>,
): Hex => {
  if (intent.request.type !== 'eoa') throw new Error('expected an EOA request')
  return intent.request.data as Hex
}

describe('prepareSetSubregistryTransaction', () => {
  it('addresses the name it was given', () => {
    const resourceId = requireResourceIdForName('vault.eth')

    const data = dataOf(
      prepareSetSubregistryTransaction({
        resourceId,
        parentRegistry: PARENT_REGISTRY,
        subregistryAddress: SUBREGISTRY,
        walletClient,
        chainId: sepolia.id,
      }),
    )

    expect(setSubregistryArgs(data)).toEqual([resourceId, SUBREGISTRY])
  })

  // WEB-1458: the label used to be split off the displayed name and hashed, so
  // configuring a registry for `[<labelhash("vault")>].eth` pointed `vault.eth`
  // at the new registry instead.
  it('will not take an id derived from an encoded-label 2LD', () => {
    const name = `${ENCODED_LABEL}.eth`

    expect(resourceIdForName(name).isErr()).toBe(true)
    expect(() => requireResourceIdForName(name)).toThrow()

    // What the old derivation handed `setSubregistry`: another name entirely.
    expect(BigInt(labelhash(ENCODED_LABEL))).toBe(
      requireResourceIdForName('vault.eth'),
    )
  })
})
