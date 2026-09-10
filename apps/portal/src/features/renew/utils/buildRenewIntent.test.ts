import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ethRegistrarRenewSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { decodeFunctionData, getAddress, type PublicClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { sepoliaWithEns } from '@/lib/wagmi'
import { buildRenewIntent, type RenewParams } from './buildRenewIntent'

const FROM = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const USDC = getAddress('0xcccccccccccccccccccccccccccccccccccccccc')

// `renewNameWriteParameters` only reads chain contract addresses off the client.
const publicClient = { chain: sepoliaWithEns } as unknown as PublicClient

const renewCall = (params: Partial<RenewParams> & { name: string }) => {
  const intent = buildRenewIntent({
    duration: 31_536_000,
    tokenAddress: USDC,
    from: FROM,
    publicClient,
    isV2: true,
    ...params,
  })
  if (intent.request.type !== 'eoa' || !intent.request.data)
    throw new Error('expected an EOA request with calldata')
  return {
    to: intent.request.to,
    ...decodeFunctionData({
      abi: ethRegistrarRenewSnippet,
      data: intent.request.data,
    }),
  }
}

describe('buildRenewIntent', () => {
  it('encodes the label exactly as the name the user confirmed', () => {
    const { to, args } = renewCall({ name: 'alice.eth' })
    expect(to).toBe(
      getChainContractAddress({
        chain: sepoliaWithEns,
        contract: 'ensEthRegistrar',
      }),
    )
    expect(args?.[0]).toMatchObject({
      label: 'alice',
      duration: 31_536_000n,
    })
    expect(args?.[1]).toBe(USDC)
  })

  // The registrar renews the label bytes it is given: normalising to `alice`
  // would pay for a different registration, so a raw stored label is refused.
  it('never renews the normalised twin of a raw stored label', () => {
    expect(() => renewCall({ name: 'ALICE.eth' })).toThrow(/normalized form/)
  })

  it('targets ETHRenewerV1 for an unmigrated v1 name', () => {
    const { to } = renewCall({ name: 'alice.eth', isV2: false })
    expect(to).toBe(
      getChainContractAddress({
        chain: sepoliaWithEns,
        contract: 'ensEthRenewerV1',
      }),
    )
  })
})
