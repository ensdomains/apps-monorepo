import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ADDRESS_RECORDS,
  getAddressRecord,
  PROFILE_TEXT_RECORDS,
  REMOVED_ADDRESS_RECORDS,
  SEPOLIA_ADDRESS_RECORDS,
  searchAddressRecords,
  searchTextRecords,
} from './index'

describe('catalog identities', () => {
  it('defines each resolver text key once', () => {
    const keys = Object.values(PROFILE_TEXT_RECORDS).map(({ key }) => key)
    expect(keys).toEqual([...new Set(keys)])
  })

  it('defines each address coin type once', () => {
    const coinTypes = [
      ...CANONICAL_ADDRESS_RECORDS,
      ...SEPOLIA_ADDRESS_RECORDS,
      ...REMOVED_ADDRESS_RECORDS,
    ].map(({ coinType }) => coinType)
    expect(coinTypes).toEqual([...new Set(coinTypes)])
  })
})

describe('getAddressRecord', () => {
  it.each([
    [0, 'btc'],
    [60, 'eth'],
    [2147483648, 'default'],
    [714, 'bnb'],
  ])('looks up coin type %i by its exact identity', (coinType, notation) => {
    expect(getAddressRecord(coinType)).toMatchObject({ coinType, notation })
  })

  it('returns the Sepolia metadata under the Sepolia coin type', () => {
    expect(getAddressRecord(2147568180)).toMatchObject({
      coinType: 2147568180,
      chainId: 84532,
      name: 'Base Sepolia',
    })
  })

  it('does not look up an EVM chain ID as a coin type', () => {
    expect(getAddressRecord(84532)).toBeUndefined()
  })
})

describe('searchTextRecords', () => {
  it('starts an empty search with common profile fields and their actual keys', () => {
    expect(searchTextRecords(' ').slice(0, 5)).toEqual([
      { key: 'avatar', name: 'Avatar' },
      { key: 'header', name: 'Header' },
      { key: 'name', name: 'Nickname' },
      { key: 'description', name: 'Short Bio' },
      { key: 'url', name: 'Website' },
    ])
  })

  it.each([
    ['  ORG.TELE ', 'org.telegram'],
    ['twItTer', 'com.twitter'],
    ['email address', 'email'],
    ['LANGUAGE', 'language'],
    ['theme', 'theme'],
  ])('finds %s by key or label', (query, key) => {
    expect(searchTextRecords(query).map((record) => record.key)).toEqual([key])
  })

  it.each(['links', 'primary-contact', 'primary contacts', 'com.telegram'])(
    'keeps %s out of the predefined search',
    (query) => {
      expect(searchTextRecords(query)).toEqual([])
    },
  )
})

describe('searchAddressRecords', () => {
  it('offers common records and distinguishes Ethereum from the default EVM slot', () => {
    const [ethereum, defaultEvm, bitcoin] = searchAddressRecords('')
    expect(ethereum).toMatchObject({ coinType: 60, chainId: 1 })
    expect(defaultEvm).toMatchObject({
      name: 'Any EVM chain',
      coinType: 2147483648,
    })
    expect(defaultEvm).not.toHaveProperty('chainId')
    expect(bitcoin).toMatchObject({ coinType: 0 })
    expect(bitcoin).not.toHaveProperty('chainId')
  })

  it('matches notation and name case-insensitively', () => {
    expect(searchAddressRecords('  sCr ').map(({ name }) => name)).toEqual([
      'Scroll',
      'Scroll Sepolia',
    ])
  })

  it('ranks an exact chain ID ahead of partial coin-type matches', () => {
    const options = searchAddressRecords('56')
    expect(options[0]).toMatchObject({ coinType: 2147483704, chainId: 56 })
    expect(options.slice(1)).toContainEqual(
      expect.objectContaining({ coinType: 156 }),
    )
  })

  it('ranks an exact coin type ahead of partial matches', () => {
    expect(searchAddressRecords('0')[0]).toMatchObject({ coinType: 0 })
  })

  it('returns distinct canonical and Sepolia coin types for Base', () => {
    expect(searchAddressRecords('8453')).toEqual([
      { name: 'Base', notation: 'base', coinType: 2147492101, chainId: 8453 },
      expect.objectContaining({
        name: 'Base Sepolia',
        coinType: 2147568180,
        chainId: 84532,
      }),
    ])
    expect(searchAddressRecords('2147568180')[0]).toMatchObject({
      chainId: 84532,
    })
  })

  it('recognizes RSK and keeps the Avalanche Bech32 and C-Chain records distinct', () => {
    expect(searchAddressRecords('30')[0]).toMatchObject({
      name: 'RSK',
      coinType: 137,
      chainId: 30,
    })
    expect(searchAddressRecords('9000')[0]).toMatchObject({ name: 'Avalanche' })
    expect(searchAddressRecords('9000')[0]).not.toHaveProperty('chainId')
    expect(searchAddressRecords('43114')[0]).toMatchObject({
      name: 'Avalanche C-Chain',
      coinType: 2147526762,
      chainId: 43114,
    })
  })

  it('omits legacy and removed records from suggestions', () => {
    expect(
      searchAddressRecords('Ethereum Classic').map(({ coinType }) => coinType),
    ).toEqual([2147483709])
    expect(searchAddressRecords('Binance Chain')).toEqual([])
  })
})
