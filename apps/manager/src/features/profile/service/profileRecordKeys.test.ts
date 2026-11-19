import type { RecordInventory } from '@ens-apps/indexer/bigname'
import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import { describe, expect, it } from 'vitest'
import { MAIN_PROFILE_RECORD_KEYS } from '../data/records/profileReadPolicy'
import {
  selectProfileRecordKeys,
  selectResolverImportRecordKeys,
} from './profileRecordKeys'

const inventory = (
  overrides: Partial<RecordInventory> = {},
): RecordInventory => ({
  known_keys: ['text:org.example', 'addr:2147483785'],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
  ...overrides,
})

describe('selectProfileRecordKeys', () => {
  it('preserves the text keys and read order for a name without inventory', () => {
    expect(selectProfileRecordKeys(undefined).texts).toEqual([
      'name',
      'avatar',
      'header',
      'description',
      'url',
      'theme',
      'language',
      'primary-contact',
      'domains.ens.primary-contacts',
      'com.twitter',
      'org.telegram',
      'xyz.farcaster',
      'com.discord',
      'com.github',
      'email',
      'phone',
      'location',
      'timezone',
      'links',
    ])
  })

  it('keeps canonical coin types in their default profile read order', () => {
    expect(selectProfileRecordKeys(undefined).coins).toEqual([
      60, 2147483648, 0, 501, 2147483658, 2147525809, 2147492101, 2147542792,
      2148018000,
    ])
  })

  it.each([
    { state: 'no inventory', value: undefined, isRead: false },
    {
      state: 'inventory_not_authoritative',
      value: inventory({
        known_keys: [],
        unsupported_keys: ['text:org.example', 'addr:2147483785'],
        abi_content_types: null,
        abi_unsupported_reason: 'inventory_not_authoritative',
      }),
      isRead: false,
    },
    { state: 'an authoritative inventory', value: inventory(), isRead: true },
  ])(
    'reads the main keys, and indexed keys: $isRead, for $state',
    ({ value, isRead }) => {
      const keys = selectProfileRecordKeys(value)
      expect(keys.texts).toEqual(
        isRead
          ? [...MAIN_PROFILE_RECORD_KEYS.texts, 'org.example']
          : MAIN_PROFILE_RECORD_KEYS.texts,
      )
      expect(keys.coins).toEqual(
        isRead
          ? [...MAIN_PROFILE_RECORD_KEYS.coins, 2147483785]
          : MAIN_PROFILE_RECORD_KEYS.coins,
      )
    },
  )
})

describe('selectResolverImportRecordKeys', () => {
  it('probes the broader text list in order before appending indexed keys', () => {
    const { texts, unsupportedCoins } = selectResolverImportRecordKeys(
      ['text:name', 'text:org.example', 'text:links', 'addr:invalid'],
      'mainnet',
    )

    expect(texts).toEqual([
      'name',
      'avatar',
      'header',
      'description',
      'url',
      'theme',
      'language',
      'primary-contact',
      'domains.ens.primary-contacts',
      'com.twitter',
      'org.telegram',
      'xyz.farcaster',
      'com.instagram',
      'com.discord',
      'com.github',
      'com.linkedin',
      'com.youtube',
      'com.reddit',
      'com.tiktok',
      'com.twitch',
      'com.mastodon',
      'email',
      'location',
      'phone',
      'mail',
      'timezone',
      'links',
      'org.example',
    ])
    expect(unsupportedCoins).toEqual([Number.NaN])
  })

  it.each(['mainnet', 'sepolia'] as const)(
    'probes the %s preset before appending a supported legacy coin from inventory',
    (network) => {
      const { coins } = selectResolverImportRecordKeys(['addr:714'], network)
      expect(coins.slice(0, 2)).toEqual([60, 0])
      expect(coins.at(-1)).toBe(714)
      for (const chainId of L2_REVERSE_REGISTRAR_CHAIN_IDS) {
        const otherNetwork = network === 'mainnet' ? 'sepolia' : 'mainnet'
        expect(coins).toContain(
          getCoinTypeForReverseRegistrarChainId(chainId, network),
        )
        expect(coins).not.toContain(
          getCoinTypeForReverseRegistrarChainId(chainId, otherNetwork),
        )
      }
    },
  )
})
