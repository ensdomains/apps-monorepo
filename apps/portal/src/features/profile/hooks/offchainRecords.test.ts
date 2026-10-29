import { BaseError, encodeAbiParameters, type Hex, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  decodeRecordResults,
  getRecordCalls,
  hasContractRevert,
  isOffchainLookupError,
} from './offchainRecords'

const RESOLVER = '0x77fEF66b77d6a44AeCcCCf911f9864c7b7ca392C'
const ETH_ADDRESS = '0x28D4000000000000000000000000000000005581'
const text = (value: string) =>
  encodeAbiParameters([{ type: 'string' }], [value])

const revertWith = (data: Hex) =>
  new BaseError('call reverted', {
    cause: new BaseError('execution reverted', {
      cause: Object.assign(new Error('raw'), { data }),
    }),
  })

describe('decodeRecordResults', () => {
  it('maps each result back to the record it was asked for', async () => {
    const request = {
      name: 'intelpocik.eth',
      texts: ['avatar', 'description', 'url'],
      coins: [60],
      contentHash: true,
      abi: true,
    } as const
    const calls = getRecordCalls(request)

    const records = await decodeRecordResults({
      calls,
      results: [
        '0x',
        text('Your gateway to privacy.'),
        text(''),
        encodeAbiParameters([{ type: 'address' }], [ETH_ADDRESS]),
        '0x',
        '0x',
      ],
      resolverAddress: RESOLVER,
      request,
    })

    expect(records).toEqual({
      texts: [{ key: 'description', value: 'Your gateway to privacy.' }],
      coins: [{ coinType: 60, symbol: 'eth', value: ETH_ADDRESS }],
      contentHash: null,
      abi: null,
      resolverAddress: RESOLVER,
    })
  })

  it('leaves out record types the request did not ask for', async () => {
    const request = { name: 'a.eth', texts: ['description'] } as const

    const records = await decodeRecordResults({
      calls: getRecordCalls(request),
      results: [text('hi')],
      resolverAddress: zeroAddress,
      request,
    })

    expect(records).toEqual({
      texts: [{ key: 'description', value: 'hi' }],
      resolverAddress: zeroAddress,
    })
  })
})

describe('read error classification', () => {
  it.each([
    { error: revertWith('0x556f1830abcd'), isOffchain: true, isRevert: false },
    { error: revertWith('0x08c379a0abcd'), isOffchain: false, isRevert: true },
    {
      error: new BaseError('HTTP request failed'),
      isOffchain: false,
      isRevert: false,
    },
  ])(
    '$error.shortMessage: offchain $isOffchain, revert $isRevert',
    ({ error, isOffchain, isRevert }) => {
      expect(isOffchainLookupError(error)).toBe(isOffchain)
      expect(hasContractRevert(error)).toBe(isRevert)
    },
  )
})
