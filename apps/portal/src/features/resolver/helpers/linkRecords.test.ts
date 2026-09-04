import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { type Address, decodeFunctionData, type WalletClient } from 'viem'
import { namehash } from 'viem/ens'
import { describe, expect, it } from 'vitest'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'
import {
  dnsEncodeName,
  prepareLinkToNodeTransaction,
  prepareUnlinkTransaction,
} from './linkRecords'

const resolverAddress = '0x1111111111111111111111111111111111111111' as Address
const from = '0x2222222222222222222222222222222222222222' as Address
const walletClient = {
  account: { address: from },
  chain: { id: 11155111 },
} as unknown as WalletClient

const eoaRequest = (intent: CustomTransactionIntent) => {
  if (intent.request.type !== 'eoa' || !intent.request.data)
    throw new Error('expected an EOA request with calldata')
  return { ...intent.request, data: intent.request.data }
}

describe('dnsEncodeName', () => {
  it('DNS-encodes a dotted name', () => {
    expect(dnsEncodeName('raffy.eth')).toBe('0x0572616666790365746800')
  })
})

describe('prepareLinkToNodeTransaction', () => {
  it('encodes linkToNode(sourceName, namehash(targetName)) to the resolver', () => {
    const intent = prepareLinkToNodeTransaction({
      sourceName: 'chonk.eth',
      targetName: 'raffy.eth',
      resolverAddress,
      walletClient,
      chainId: 11155111,
    })

    const request = eoaRequest(intent)
    expect(request.to).toBe(resolverAddress)
    expect(request.from).toBe(from)
    expect(
      decodeFunctionData({
        abi: permissionedResolverAbi,
        data: eoaRequest(intent).data,
      }),
    ).toEqual({
      functionName: 'linkToNode',
      args: [dnsEncodeName('chonk.eth'), namehash('raffy.eth')],
    })
  })

  it('throws without an account', () => {
    expect(() =>
      prepareLinkToNodeTransaction({
        sourceName: 'a.eth',
        targetName: 'b.eth',
        resolverAddress,
        walletClient: {} as WalletClient,
        chainId: 1,
      }),
    ).toThrow(/account and chain/)
  })
})

describe('prepareUnlinkTransaction', () => {
  it('encodes linkToRecord(sourceName, 0)', () => {
    const intent = prepareUnlinkTransaction({
      sourceName: 'chonk.eth',
      resolverAddress,
      walletClient,
      chainId: 11155111,
    })

    expect(
      decodeFunctionData({
        abi: permissionedResolverAbi,
        data: eoaRequest(intent).data,
      }),
    ).toEqual({
      functionName: 'linkToRecord',
      args: [dnsEncodeName('chonk.eth'), 0n],
    })
  })
})
