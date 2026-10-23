import {
  type Address,
  decodeFunctionData,
  getAddress,
  type Hex,
  labelhash,
  type WalletClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import {
  prepareSetRegistryParentTransaction,
  REGISTRY_SET_PARENT_ABI,
  registryParentLabel,
} from './setRegistryParent'

const FROM: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'
const PARENT_REGISTRY: Address = '0x666b3d735e366bb8755b65cb5bf7a14c7f41eb23'
const REGISTRY: Address = '0x2245606Dd6B3ae61205fCf8c843E200CC2f1123d'

const walletClient = {
  account: { address: FROM },
  chain: sepolia,
} as unknown as WalletClient

describe('prepareSetRegistryParentTransaction', () => {
  it('claims the parent on the deployed registry', () => {
    const intent = prepareSetRegistryParentTransaction({
      registry: REGISTRY,
      parentRegistry: PARENT_REGISTRY,
      label: 'koala',
      walletClient,
      chainId: sepolia.id,
    })
    if (intent.request.type !== 'eoa')
      throw new Error('expected an EOA request')

    expect(intent.request.to).toBe(REGISTRY)
    expect(
      decodeFunctionData({
        abi: REGISTRY_SET_PARENT_ABI,
        data: intent.request.data as Hex,
      }).args,
    ).toEqual([getAddress(PARENT_REGISTRY), 'koala'])
  })
})

describe('registryParentLabel', () => {
  it('takes the first label', () => {
    expect(registryParentLabel('koala.eth')).toBe('koala')
    expect(registryParentLabel('sub.koala.eth')).toBe('sub')
  })

  it('has no label to claim for an encoded one', () => {
    expect(
      registryParentLabel(`[${labelhash('koala').slice(2)}].eth`),
    ).toBeNull()
  })
})
