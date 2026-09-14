import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { dnsEncodeName } from '@ensdomains/ensjs/utils/v2'
import {
  permissionedResolverLinkToNodeSnippet,
  permissionedResolverLinkToRecordSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { type Address, decodeFunctionData, type WalletClient } from 'viem'
import { namehash } from 'viem/ens'
import { describe, expect, it } from 'vitest'
import {
  prepareLinkToNodeTransaction,
  prepareUnlinkTransaction,
} from './linkRecords'

const linkAbi = [
  ...permissionedResolverLinkToNodeSnippet,
  ...permissionedResolverLinkToRecordSnippet,
] as const

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
    expect(decodeFunctionData({ abi: linkAbi, data: request.data })).toEqual({
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
      decodeFunctionData({ abi: linkAbi, data: eoaRequest(intent).data }),
    ).toEqual({
      functionName: 'linkToRecord',
      args: [dnsEncodeName('chonk.eth'), 0n],
    })
  })
})
