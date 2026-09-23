import { getCoderByCoinType } from '@ensdomains/address-encoder'
import * as ensUtils from '@ensdomains/ensjs/utils'
import * as viem from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decodeCoinRecord,
  decodeCoinResult,
  MAX_COIN_RECORD_BYTES,
} from './decodeCoinRecord'

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>()
  return { ...actual, decodeFunctionResult: vi.fn(actual.decodeFunctionResult) }
})
vi.mock('@ensdomains/ensjs/utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ensdomains/ensjs/utils')>()
  return {
    ...actual,
    decodeAddressResultFromPrimitiveTypes: vi.fn(
      actual.decodeAddressResultFromPrimitiveTypes,
    ),
  }
})

const ZEN_HEX = '0x20897843a3fcc6ab7d02d40946360c070b13cf7b9795'
const ZEN_ADDRESS = 'znc3p7CFNTsz1s6CceskrTxKevQLPoDK4cK'
const bytesResult = (value: viem.Hex) =>
  viem.encodeAbiParameters([{ type: 'bytes' }], [value])

describe('coin record decoding', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects the 131 KB ZEN payload before ABI decoding or byte allocation', () => {
    const oversized: viem.Hex = `0x2089${'11'.repeat(131_072 - 2)}`
    const result = bytesResult(oversized)

    expect(decodeCoinResult(121, result)).toBeNull()
    expect(decodeCoinRecord(121, oversized)).toBeNull()
    expect(viem.decodeFunctionResult).not.toHaveBeenCalled()
    expect(
      ensUtils.decodeAddressResultFromPrimitiveTypes,
    ).not.toHaveBeenCalled()
  })

  it.each([
    0, 60, 121, 501, 1815, 0x80000001,
  ])('bounds raw data for coin %i before invoking its coder', (coinType) => {
    const oversized: viem.Hex = `0x${'11'.repeat(MAX_COIN_RECORD_BYTES + 1)}`

    expect(decodeCoinRecord(coinType, oversized)).toBeNull()
    expect(
      ensUtils.decodeAddressResultFromPrimitiveTypes,
    ).not.toHaveBeenCalled()
  })

  it('preserves the upstream ZEN address fixture', () => {
    expect(decodeCoinResult(121, bytesResult(ZEN_HEX))).toEqual({
      coinType: 121,
      symbol: 'zen',
      value: ZEN_ADDRESS,
    })
  })

  it.each([
    '2089',
    '1cb8',
    '2096',
    '1cbd',
    '1CBD',
  ])('accepts 22-byte ZEN transparent addresses with prefix %s', (prefix) => {
    const value: viem.Hex = `0x${prefix}${'11'.repeat(20)}`
    const record = decodeCoinRecord(121, value)
    expect(record?.value).toBe(
      getCoderByCoinType(121).encode(viem.hexToBytes(value)),
    )
  })

  it('preserves 66-byte ZEN shielded addresses', () => {
    const value: viem.Hex = `0x169a${'11'.repeat(64)}`
    expect(decodeCoinRecord(121, value)?.value).toBe(
      getCoderByCoinType(121).encode(viem.hexToBytes(value)),
    )
  })

  it.each([
    [121, '2089', 21],
    [121, '2089', 23],
    [121, '2089', 32],
    [121, '2089', 66],
    [121, '169a', 22],
    [121, '169a', 65],
    [121, '169a', 67],
    [60, '1111', 19],
    [60, '1111', 21],
    [0x80000001, '1111', 21],
    [501, '1111', 31],
    [501, '1111', 33],
  ])('rejects noncanonical coin %i prefix %s length %i before conversion', (coin, prefix, length) => {
    expect(
      decodeCoinRecord(coin, `0x${prefix}${'11'.repeat(length - 2)}`),
    ).toBeNull()
    expect(
      ensUtils.decodeAddressResultFromPrimitiveTypes,
    ).not.toHaveBeenCalled()
  })

  it('preserves ETH, EVM, SOL, and variable-length BTC records', () => {
    const eth = '0x1111111111111111111111111111111111111111'
    expect(
      decodeCoinResult(
        60,
        viem.encodeAbiParameters([{ type: 'address' }], [eth]),
      )?.value,
    ).toBe(eth)
    expect(decodeCoinRecord(0x80000001, eth)?.value).toBe(eth)

    for (const [coin, address] of [
      [501, 'So11111111111111111111111111111111111111112'],
      [0, '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
    ] as const) {
      const value = viem.bytesToHex(getCoderByCoinType(coin).decode(address))
      expect(decodeCoinResult(coin, bytesResult(value))?.value).toBe(address)
    }
  })

  it('omits empty, zero, malformed, unsupported, and invalid-prefix values', () => {
    expect(decodeCoinRecord(121, '0x')).toBeNull()
    expect(decodeCoinRecord(60, viem.zeroAddress)).toBeNull()
    expect(decodeCoinRecord(121, `0x1234${'11'.repeat(20)}`)).toBeNull()
    expect(decodeCoinRecord(121, '0x20891')).toBeNull()
    expect(decodeCoinRecord(999999, '0x1234')).toBeNull()
    expect(decodeCoinResult(121, '0x1234')).toBeNull()
    expect(decodeCoinResult(121, `0x${'ff'.repeat(64)}`)).toBeNull()
  })
})
