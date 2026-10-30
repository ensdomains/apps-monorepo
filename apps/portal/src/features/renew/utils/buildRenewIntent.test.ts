import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ethRegistrarRenewSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import {
  decodeFunctionData,
  getAddress,
  type PublicClient,
  parseAbi,
} from 'viem'
import { describe, expect, it } from 'vitest'
import { ENS_LABS_REFERRER } from '@/lib/referrer'
import { ensChain } from '@/lib/wagmi'
import {
  buildRenewBatchIntent,
  buildRenewIntent,
  type RenewParams,
} from './buildRenewIntent'

const FROM = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const USDC = getAddress('0xcccccccccccccccccccccccccccccccccccccccc')

// `renewNameWriteParameters` only reads chain contract addresses off the client.
const publicClient = { chain: ensChain } as unknown as PublicClient

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
        chain: ensChain,
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
        chain: ensChain,
        contract: 'ensEthRenewerV1',
      }),
    )
  })
})

it.each([true, false])(
  'preserves a supplied referrer on the v2=%s renewal path',
  (isV2) => {
    const { args } = renewCall({ name: 'alice.eth', isV2, referrer: '0x1234' })
    expect(args?.[0].referrer).toBe(`0x${'0'.repeat(60)}1234`)
  },
)

it.each([true, false])(
  'sends the Explorer referrer on the v2=%s renewal path when the link gives none',
  (isV2) => {
    const { args } = renewCall({ name: 'alice.eth', isV2 })
    expect(args?.[0].referrer).toBe(ENS_LABS_REFERRER)
  },
)

it.each([
  [undefined, ENS_LABS_REFERRER],
  ['0x1234', `0x${'0'.repeat(60)}1234`],
])(
  'gives every bulk renewal entry the referrer for %s',
  (referrer, expected) => {
    const intent = buildRenewBatchIntent({
      referrer,
      renewals: [
        { selectedName: { name: 'a.eth', isV2: true }, duration: 1 },
        { selectedName: { name: 'b.eth', isV2: true }, duration: 2 },
      ],
      renewer: USDC,
      tokenAddress: USDC,
      from: FROM,
    })
    if (intent.request.type !== 'eoa' || !intent.request.data)
      throw new Error('expected an EOA request with calldata')
    const { args } = decodeFunctionData({
      abi: parseAbi([
        'function renewBatch((string label, uint64 duration, bytes32 referrer)[] rds, address paymentToken)',
      ]),
      data: intent.request.data,
    })
    expect(args[0].map((entry) => entry.referrer)).toEqual([expected, expected])
  },
)
