import type { EvmCoinType } from '@ensdomains/address-encoder'
import { describe, expect, it } from 'vitest'
import {
  filterEvmChains,
  filterNonEvmChains,
  recordCoinsToObject,
  recordTextsToObject,
} from './transformRecordsForDisplay'

describe('transformRecordsForDisplay', () => {
  describe('recordTextsToObject', () => {
    it('should transform array of text records to object', () => {
      const texts = [
        { key: 'name', value: 'Alice' },
        { key: 'description', value: 'Developer' },
        { key: 'com.twitter', value: '@alice' },
      ]

      const result = recordTextsToObject(texts)

      expect(result).toEqual({
        name: 'Alice',
        description: 'Developer',
        'com.twitter': '@alice',
      })
    })

    it('should handle empty array', () => {
      const result = recordTextsToObject([])

      expect(result).toEqual({})
    })

    it('should handle undefined input', () => {
      const result = recordTextsToObject(undefined)

      expect(result).toEqual({})
    })

    it('should handle single text record', () => {
      const texts = [{ key: 'name', value: 'Bob' }]

      const result = recordTextsToObject(texts)

      expect(result).toEqual({ name: 'Bob' })
    })

    it('should handle duplicate keys (last one wins)', () => {
      const texts = [
        { key: 'name', value: 'Alice' },
        { key: 'name', value: 'Bob' },
      ]

      const result = recordTextsToObject(texts)

      expect(result).toEqual({ name: 'Bob' })
    })
  })

  describe('recordCoinsToObject', () => {
    it('should transform array of coin records to object', () => {
      const coins = [
        { coinType: 60, value: '0x1234567890abcdef' },
        { coinType: 0, value: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
        { coinType: 501, value: 'solana-address-here' },
      ]

      const result = recordCoinsToObject(coins)

      expect(result).toEqual({
        '60': '0x1234567890abcdef',
        '0': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        '501': 'solana-address-here',
      })
    })

    it('should handle empty array', () => {
      const result = recordCoinsToObject([])

      expect(result).toEqual({})
    })

    it('should handle undefined input', () => {
      const result = recordCoinsToObject(undefined)

      expect(result).toEqual({})
    })

    it('should handle single coin record', () => {
      const coins = [{ coinType: 60, value: '0xabc' }]

      const result = recordCoinsToObject(coins)

      expect(result).toEqual({ '60': '0xabc' })
    })

    it('should convert coinType to string key', () => {
      const coins = [{ coinType: 42161, value: '0xarbitrum' }]

      const result = recordCoinsToObject(coins)

      expect(Object.keys(result)[0]).toBe('42161')
      expect(typeof Object.keys(result)[0]).toBe('string')
    })
  })

  describe('filterEvmChains', () => {
    it('should filter to only EVM chains', () => {
      const coins = {
        '60': '0xeth-address',
        '0': 'btc-address',
        '10': '0xop-address',
        '501': 'sol-address',
        '42161': '0xarb-address',
      }
      const evmCoinTypes: EvmCoinType[] = [
        60, 10, 42161, 8453,
      ] as unknown as EvmCoinType[]

      const result = filterEvmChains(coins, evmCoinTypes)

      expect(result).toEqual({
        60: '0xeth-address',
        10: '0xop-address',
        42161: '0xarb-address',
      })
    })

    it('should always include coinType 60 (ETH)', () => {
      const coins = {
        '60': '0xeth-address',
        '10': '0xop-address',
      }
      const evmCoinTypes: EvmCoinType[] = [10] as unknown as EvmCoinType[]

      const result = filterEvmChains(coins, evmCoinTypes)

      expect(result).toHaveProperty('60')
      expect(result[60]).toBe('0xeth-address')
    })

    it('should convert string keys to number keys', () => {
      const coins = {
        '60': '0xeth-address',
        '10': '0xop-address',
      }
      const evmCoinTypes: EvmCoinType[] = [60, 10] as unknown as EvmCoinType[]

      const result = filterEvmChains(coins, evmCoinTypes)

      expect(Object.keys(result).every((k) => typeof k === 'string')).toBe(true)
      expect(result[60]).toBe('0xeth-address')
      expect(result[10]).toBe('0xop-address')
    })

    it('should handle empty coins object', () => {
      const coins = {}
      const evmCoinTypes: EvmCoinType[] = [60, 10] as unknown as EvmCoinType[]

      const result = filterEvmChains(coins, evmCoinTypes)

      expect(result).toEqual({})
    })

    it('should exclude non-EVM chains', () => {
      const coins = {
        '0': 'btc-address',
        '2': 'ltc-address',
        '501': 'sol-address',
      }
      const evmCoinTypes: EvmCoinType[] = [60, 10] as unknown as EvmCoinType[]

      const result = filterEvmChains(coins, evmCoinTypes)

      expect(result).toEqual({})
    })
  })

  describe('filterNonEvmChains', () => {
    it('should filter to only non-EVM chains', () => {
      const coins = {
        '60': '0xeth-address',
        '0': 'btc-address',
        '10': '0xop-address',
        '2': 'ltc-address',
        '501': 'sol-address',
      }
      const nonEvmCoinTypes = [0, 2, 501, 3] as const

      const result = filterNonEvmChains(coins, [...nonEvmCoinTypes])

      expect(result).toEqual({
        0: 'btc-address',
        2: 'ltc-address',
        501: 'sol-address',
      })
    })

    it('should convert string keys to number keys', () => {
      const coins = {
        '0': 'btc-address',
        '501': 'sol-address',
      }
      const nonEvmCoinTypes = [0, 501] as const

      const result = filterNonEvmChains(coins, [...nonEvmCoinTypes])

      expect(Object.keys(result).every((k) => typeof k === 'string')).toBe(true)
      expect(result[0]).toBe('btc-address')
      expect(result[501]).toBe('sol-address')
    })

    it('should handle empty coins object', () => {
      const coins = {}
      const nonEvmCoinTypes = [0, 2, 501] as const

      const result = filterNonEvmChains(coins, [...nonEvmCoinTypes])

      expect(result).toEqual({})
    })

    it('should exclude EVM chains', () => {
      const coins = {
        '60': '0xeth-address',
        '10': '0xop-address',
        '42161': '0xarb-address',
      }
      const nonEvmCoinTypes = [0, 2, 501] as const

      const result = filterNonEvmChains(coins, [...nonEvmCoinTypes])

      expect(result).toEqual({})
    })

    it('should only include coins that are in nonEvmCoinTypes list', () => {
      const coins = {
        '0': 'btc-address',
        '2': 'ltc-address',
        '3': 'doge-address',
        '501': 'sol-address',
      }
      const nonEvmCoinTypes = [0, 501] as const // Only BTC and SOL

      const result = filterNonEvmChains(coins, [...nonEvmCoinTypes])

      expect(result).toEqual({
        0: 'btc-address',
        501: 'sol-address',
      })
      expect(result).not.toHaveProperty('2')
      expect(result).not.toHaveProperty('3')
    })
  })
})
