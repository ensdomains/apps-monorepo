import { describe, expect, it } from 'vitest'
import { DEFAULT_EVM_COIN_TYPE } from '@/lib/coinType'
import { getCoinByName, SUPPORTED_COINS } from './coins'

describe('coins', () => {
  describe('SUPPORTED_COINS', () => {
    it('contains ETH as the first coin (priority)', () => {
      expect(SUPPORTED_COINS[0].name).toBe('eth')
      expect(SUPPORTED_COINS[0].coinType).toBe(60)
    })

    it('offers the ENSIP-19 default address record (WEB-1511)', () => {
      const coin = getCoinByName('default')

      expect(coin).toMatchObject({
        name: 'default',
        coinType: DEFAULT_EVM_COIN_TYPE,
        icon: null,
      })
      // address-encoder calls it "Default", which would render as
      // "DEFAULT (Default)" in the picker.
      expect(coin?.longName).toBe('Any EVM chain')
      // Sits next to ETH, not buried in the alphabetic tail: it is the
      // fallback every EVM chain without its own record uses.
      expect(SUPPORTED_COINS[1]).toBe(coin)
    })

    it('contains BTC as a priority coin', () => {
      const coin = getCoinByName('btc')

      expect(coin?.coinType).toBe(0)
    })

    it('has correct structure for each coin', () => {
      for (const coin of SUPPORTED_COINS) {
        expect(coin).toHaveProperty('name')
        expect(coin).toHaveProperty('longName')
        expect(coin).toHaveProperty('coinType')
        expect(coin).toHaveProperty('icon')

        expect(typeof coin.name).toBe('string')
        expect(typeof coin.longName).toBe('string')
        expect(typeof coin.coinType).toBe('number')
        expect(coin.icon === null || typeof coin.icon === 'string').toBe(true)
      }
    })

    it('has icons in the correct format', () => {
      const coinsWithIcons = SUPPORTED_COINS.filter(
        (coin) => coin.icon !== null,
      )
      expect(coinsWithIcons.length).toBeGreaterThan(0)

      for (const coin of coinsWithIcons) {
        expect(coin.icon).toMatch(/^\/address\/\w+Icon\.svg$/)
      }
    })

    it('contains major cryptocurrencies', () => {
      const coinNames = SUPPORTED_COINS.map((c) => c.name)
      expect(coinNames).toContain('eth')
      expect(coinNames).toContain('btc')
      expect(coinNames).toContain('sol')
      expect(coinNames).toContain('matic')
      expect(coinNames).toContain('op')
      expect(coinNames).toContain('arb1')
      expect(coinNames).toContain('base')
    })
  })

  // address-encoder 3.0.0 added these EVM chains (PR 422).
  describe('EVM chains added in address-encoder 3.0.0', () => {
    it.each([
      ['unichain', 'Unichain', 2147483778],
      ['monad', 'Monad', 2147483791],
      ['sonic', 'Sonic', 2147483794],
      ['worldchain', 'World Chain', 2147484128],
      ['hyperevm', 'HyperEVM', 2147484647],
      ['lisk', 'Lisk', 2147484783],
      ['soneium', 'Soneium', 2147485516],
      ['ronin', 'Ronin', 2147485668],
      ['abstract', 'Abstract', 2147486389],
      ['tempo', 'Tempo', 2147487865],
      ['robinhood', 'Robinhood Chain', 2147488311],
      ['arc', 'Arc', 2147488690],
      ['plasma', 'Plasma', 2147493393],
      ['arbnova', 'Arbitrum Nova', 2147525818],
      ['ink', 'Ink', 2147540721],
      ['berachain', 'Berachain', 2147563742],
      ['taiko', 'Taiko', 2147650648],
    ] as const)('offers %s as %s (%i)', (name, longName, coinType) => {
      expect(getCoinByName(name)).toMatchObject({ name, longName, coinType })
    })

    it('reuses the Lisk artwork for the Lisk EVM chain', () => {
      expect(getCoinByName('lisk')?.icon).toBe('/address/LskIcon.svg')
    })
  })

  describe('getCoinByName', () => {
    it('returns ETH coin for "eth"', () => {
      const coin = getCoinByName('eth')
      expect(coin).toBeDefined()
      expect(coin?.name).toBe('eth')
      expect(coin?.coinType).toBe(60)
      expect(coin?.longName).toBe('Ethereum')
    })

    it('returns ETH coin for "ETH" (case insensitive)', () => {
      const coin = getCoinByName('ETH')
      expect(coin).toBeDefined()
      expect(coin?.name).toBe('eth')
    })

    it('returns BTC coin for "btc"', () => {
      const coin = getCoinByName('btc')
      expect(coin).toBeDefined()
      expect(coin?.name).toBe('btc')
      expect(coin?.coinType).toBe(0)
      expect(coin?.longName).toBe('Bitcoin')
    })

    it('returns SOL coin for "sol"', () => {
      const coin = getCoinByName('sol')
      expect(coin).toBeDefined()
      expect(coin?.name).toBe('sol')
      expect(coin?.coinType).toBe(501)
    })

    it('returns undefined for unknown coin', () => {
      const coin = getCoinByName('unknown-coin-xyz')
      expect(coin).toBeUndefined()
    })
  })
})
