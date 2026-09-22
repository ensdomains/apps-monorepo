import { describe, expect, it } from 'vitest'
import type { ProfileRecords } from '@/features/profile/types'
import { MAX_PROFILE_LINKS } from '@/features/profile/utils/linkLimits'
import {
  formatChainSpecificAddress,
  formatProfileDetailDate,
  getChainSpecificAddresses,
  getContactItems,
  getFeaturedSocialItems,
  getMainReceivingAddress,
  getReceivingAddressChains,
  getSafeProfileLinks,
  getSecondarySocialRecords,
} from './ProfileView.helpers'

const makeRecords = (
  overrides: Partial<ProfileRecords> = {},
): ProfileRecords => ({
  addresses: [],
  base: {},
  contact: [],
  links: [],
  social: [],
  unknown: [],
  agentRegistrations: [],
  ...overrides,
})

describe('ProfileView helpers', () => {
  it('formats chain-specific addresses with the first and last five characters', () => {
    expect(
      formatChainSpecificAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'),
    ).toBe('bc1qx...x0wlh')
    expect(formatChainSpecificAddress('DE5opa123456789xyz')).toBe(
      'DE5op...89xyz',
    )
    expect(formatChainSpecificAddress('abc123')).toBe('abc123')
  })

  it('formats dates as compact uppercase labels for mobile', () => {
    expect(formatProfileDetailDate(new Date('2022-11-11T12:00:00Z'))).toBe(
      'NOV.11.2022',
    )
  })

  it('formats dates with the full month and comma for desktop', () => {
    expect(
      formatProfileDetailDate(new Date('2022-11-11T12:00:00Z'), 'desktop'),
    ).toBe('NOVEMBER 11, 2022')
  })

  it('uses the local calendar day when timeZone is "local"', () => {
    const localNov11 = new Date(2022, 10, 11, 12, 0)
    expect(formatProfileDetailDate(localNov11, 'mobile', 'local')).toBe(
      'NOV.11.2022',
    )
    expect(formatProfileDetailDate(localNov11, 'desktop', 'local')).toBe(
      'NOVEMBER 11, 2022',
    )
  })

  it('keeps contact records separate from featured social records', () => {
    const records = makeRecords({
      base: {
        'domains.ens.primary-contacts': JSON.stringify([
          'com.twitter',
          'email',
          'missing.record',
        ]),
      },
      contact: [{ key: 'email', value: 'person@example.com' }],
      social: [
        { key: 'com.twitter', value: '@ernieth' },
        { key: 'org.telegram', value: 'erni_eth' },
      ],
    })

    expect(getContactItems(records)).toMatchObject([
      {
        displayValue: 'person@example.com',
        key: 'email',
        label: 'Email Address',
      },
    ])
    expect(getFeaturedSocialItems(records)).toMatchObject([
      {
        displayValue: 'ernieth',
        key: 'com.twitter',
        label: 'X (Twitter)',
      },
    ])
  })

  it('shows only non-header records as contact cards', () => {
    const records = makeRecords({
      contact: [
        { key: 'location', value: 'Canada' },
        { key: 'timezone', value: 'UTC-5' },
        { key: 'email', value: 'person@example.com' },
        { key: 'phone', value: '+1 555 0100' },
      ],
      social: [{ key: 'com.github', value: 'ensdomains' }],
    })

    expect(getContactItems(records).map((item) => item.key)).toEqual([
      'email',
      'phone',
    ])
    expect(getSecondarySocialRecords(records)).toEqual([
      { key: 'com.github', value: 'ensdomains' },
    ])
  })

  it('does not create contact cards from header records or unstarred socials', () => {
    const records = makeRecords({
      contact: [
        { key: 'location', value: 'Canada' },
        { key: 'timezone', value: 'UTC-5' },
      ],
      social: [
        { key: 'com.instagram', value: 'ensdomains' },
        { key: 'com.github', value: 'ensdomains' },
      ],
    })

    expect(getContactItems(records)).toEqual([])
    expect(getSecondarySocialRecords(records)).toEqual(records.social)
  })

  it('moves starred socials from Social to Featured', () => {
    const records = makeRecords({
      base: {
        'domains.ens.primary-contacts': JSON.stringify([
          'com.twitter',
          'email',
        ]),
      },
      contact: [{ key: 'email', value: 'person@example.com' }],
      social: [
        { key: 'com.twitter', value: 'ernieth' },
        { key: 'org.telegram', value: 'erni_eth' },
      ],
    })

    expect(getSecondarySocialRecords(records)).toEqual([
      { key: 'org.telegram', value: 'erni_eth' },
    ])
    expect(getContactItems(records).map((item) => item.key)).toEqual(['email'])
    expect(getFeaturedSocialItems(records).map((item) => item.key)).toEqual([
      'com.twitter',
    ])
  })

  it('keeps social records secondary when configured primary contacts do not resolve', () => {
    const records = makeRecords({
      base: {
        'domains.ens.primary-contacts': JSON.stringify(['com.twitter']),
      },
      contact: [{ key: 'email', value: 'person@example.com' }],
      social: [
        { key: 'org.telegram', value: 'erni_eth' },
        { key: 'com.github', value: 'ensdomains' },
        { key: 'com.discord', value: 'ensdomains' },
      ],
    })

    expect(getContactItems(records).map((item) => item.key)).toEqual(['email'])
    expect(getSecondarySocialRecords(records)).toEqual([
      { key: 'org.telegram', value: 'erni_eth' },
      { key: 'com.github', value: 'ensdomains' },
      { key: 'com.discord', value: 'ensdomains' },
    ])
  })

  it('keeps social records secondary when primary contacts are not configured', () => {
    const records = makeRecords({
      contact: [{ key: 'email', value: 'person@example.com' }],
      social: [
        { key: 'org.telegram', value: 'erni_eth' },
        { key: 'com.github', value: 'ensdomains' },
        { key: 'com.discord', value: 'ensdomains' },
      ],
    })

    expect(getContactItems(records).map((item) => item.key)).toEqual(['email'])
    expect(getSecondarySocialRecords(records)).toEqual([
      { key: 'org.telegram', value: 'erni_eth' },
      { key: 'com.github', value: 'ensdomains' },
      { key: 'com.discord', value: 'ensdomains' },
    ])
  })

  it('restores a social record when it is no longer a primary contact', () => {
    const records = makeRecords({
      base: {
        'domains.ens.primary-contacts': JSON.stringify(['email']),
      },
      contact: [{ key: 'email', value: 'person@example.com' }],
      social: [
        { key: 'com.twitter', value: 'ernieth' },
        { key: 'org.telegram', value: '' },
      ],
    })

    expect(getSecondarySocialRecords(records)).toEqual([
      { key: 'com.twitter', value: 'ernieth' },
    ])
  })

  it('prepares only three preview cards from a 60,000-link array', () => {
    const links = Array.from({ length: 60_000 }, (_, i) => ({
      name: `Link ${i}`,
      url: `https://example.com/${i}`,
    }))

    const result = getSafeProfileLinks(makeRecords({ links }))

    expect(result).toHaveLength(3)
    expect(result.map(({ url }) => url)).toEqual(
      links.slice(0, 3).map(({ url }) => url),
    )
  })

  it('does not scan past invalid links to fill the preview limit', () => {
    const links = [
      ...Array(MAX_PROFILE_LINKS).fill({ name: 'Bad', url: 'data:bad' }),
      { name: 'Beyond limit', url: 'https://example.com' },
    ]

    expect(getSafeProfileLinks(makeRecords({ links }))).toEqual([])
  })

  it('filters unsafe profile links', () => {
    const records = makeRecords({
      links: [
        { name: 'Blog', url: 'https://example.com/blog' },
        { name: 'Bad', url: 'javascript:alert(1)' },
        { name: 'Relative', url: 'example.com' },
      ],
    })

    expect(getSafeProfileLinks(records)).toEqual([
      {
        displayHost: 'example.com',
        href: 'https://example.com/blog',
        name: 'Blog',
        url: 'https://example.com/blog',
      },
      {
        displayHost: 'example.com',
        href: 'https://example.com',
        name: 'Relative',
        url: 'example.com',
      },
    ])
  })

  it('uses ETH as the main receiving address and excludes it from chain-specific addresses', () => {
    const records = makeRecords({
      addresses: [
        { coinType: 0, value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
        { coinType: 60, value: '0x1234567890abcdef1234567890abcdef12345678' },
      ],
    })

    expect(getMainReceivingAddress(records)).toMatchObject({
      coinType: 60,
      notation: 'ETH',
      value: '0x1234567890abcdef1234567890abcdef12345678',
    })
    expect(
      getChainSpecificAddresses(records).map((item) => item.coinType),
    ).toEqual([0])
  })

  it('groups EVM chains sharing the main address as icons and keeps distinct chains separate', () => {
    const evmValue = '0x1234567890abcdef1234567890abcdef12345678'
    const records = makeRecords({
      addresses: [
        { coinType: 60, value: evmValue },
        { coinType: 2147483658, value: evmValue.toUpperCase() }, // Optimism, same address
        { coinType: 0, value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
      ],
    })

    expect(
      getReceivingAddressChains(records).map((item) => item.coinType),
    ).toEqual([60, 2147483658])
    expect(
      getChainSpecificAddresses(records).map((item) => item.coinType),
    ).toEqual([0])
  })

  it('falls back to the first populated address when ETH is not set', () => {
    const records = makeRecords({
      addresses: [
        { coinType: 0, value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
        { coinType: 501, value: '4Nd1mYQwQ6gkQwQ6gkQwQ6gkQwQ6gkQwQ' },
      ],
    })

    expect(getMainReceivingAddress(records)).toMatchObject({
      coinType: 0,
      notation: 'BTC',
    })
    expect(
      getChainSpecificAddresses(records).map((item) => item.coinType),
    ).toEqual([501])
  })

  it.each([
    [291, 501, 'ExampleAddress', 'exampleAddress'],
    [501, 291, 'exampleAddress', 'ExampleAddress'],
    [291, 501, 'ExampleAddress', 'ExampleAddress'],
    [501, 501, 'ExampleAddress', 'exampleAddress'],
    [999, 1000, 'ExampleAddress', 'ExampleAddress'],
  ])('keeps independent case-sensitive records separate (%i, %i, %s, %s)', (mainCoinType, otherCoinType, mainValue, otherValue) => {
    // Synthetic strings test grouping without requiring valid network keys.
    const mainRecord = { coinType: mainCoinType, value: mainValue }
    const otherRecord = { coinType: otherCoinType, value: otherValue }
    const records = makeRecords({ addresses: [mainRecord, otherRecord] })

    expect(getMainReceivingAddress(records)).toMatchObject(mainRecord)
    expect(getReceivingAddressChains(records)).toMatchObject([mainRecord])
    expect(getChainSpecificAddresses(records)).toMatchObject([otherRecord])
  })

  it('does not group a non-EVM record with a matching EVM value', () => {
    const value = '0x1234567890abcdef1234567890abcdef12345678'
    const records = makeRecords({
      addresses: [
        { coinType: 60, value },
        { coinType: 501, value },
        { coinType: 999, value: value.toUpperCase() },
      ],
    })

    expect(getReceivingAddressChains(records)).toMatchObject([
      { coinType: 60, value },
    ])
    expect(getChainSpecificAddresses(records)).toMatchObject([
      { coinType: 501, value },
      { coinType: 999, value: value.toUpperCase() },
    ])
  })

  it('groups matching EVM records without ETH and keeps different keys separate', () => {
    const value = '0x1234567890abcdef1234567890abcdef12345678'
    const records = makeRecords({
      addresses: [
        { coinType: 60, value: ' ' },
        { coinType: 2147483658, value: ` ${value} ` },
        { coinType: 2147492101, value: value.toUpperCase() },
        {
          coinType: 2147525809,
          value: '0x1234567890abcdef1234567890abcdef12345679',
        },
      ],
    })

    expect(getMainReceivingAddress(records)).toMatchObject({
      coinType: 2147483658,
      value,
    })
    expect(
      getReceivingAddressChains(records).map(({ coinType }) => coinType),
    ).toEqual([2147483658, 2147492101])
    expect(getChainSpecificAddresses(records)).toMatchObject([
      {
        coinType: 2147525809,
        value: '0x1234567890abcdef1234567890abcdef12345679',
      },
    ])
  })

  it('does not case-fold malformed EVM values', () => {
    const records = makeRecords({
      addresses: [
        { coinType: 60, value: 'ExampleAddress' },
        { coinType: 2147483658, value: 'exampleAddress' },
      ],
    })

    expect(getReceivingAddressChains(records)).toMatchObject([
      { coinType: 60, value: 'ExampleAddress' },
    ])
    expect(getChainSpecificAddresses(records)).toMatchObject([
      { coinType: 2147483658, value: 'exampleAddress' },
    ])
  })

  it('returns no address cards for empty records', () => {
    const records = makeRecords({ addresses: [{ coinType: 60, value: ' ' }] })

    expect(getMainReceivingAddress(records)).toBeUndefined()
    expect(getReceivingAddressChains(records)).toEqual([])
    expect(getChainSpecificAddresses(records)).toEqual([])
  })
})
