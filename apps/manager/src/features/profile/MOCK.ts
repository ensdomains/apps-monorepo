import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import {
  coinNameToTypeMap,
  coinTypeToNameMap,
} from '@ensdomains/address-encoder'
import { type Address, zeroAddress } from 'viem'
import { DEBUG_FEATURES_ENABLED } from '@/utils/debug-features'
import type { ProfileRecordsResult } from './service/profileRecords'

export const DEBUG_PROFILE_OWNER =
  '0x1234567890abcdef1234567890abcdef12345678' as Address

export const DEBUG_PROFILE: ProfileRecordsResult = {
  texts: [
    // Base records
    { key: 'email', value: 'debug@ens.domains' },
    { key: 'url', value: 'https://myportfolio.com' },
    {
      key: 'avatar',
      value: 'https://euc.li/enslabs.eth',
    },
    {
      key: 'description',
      value:
        'Ethereum enthusiast and product designer building the future of decentralized web.',
    },
    { key: 'keywords', value: 'ENS,web3,developer,ethereum' },
    // Social records
    { key: 'com.twitter', value: 'enslabs' },
    { key: 'com.github', value: 'enslabs' },
    { key: 'com.discord', value: 'enslabs' },
    { key: 'com.reddit', value: 'enslabs' },
    { key: 'com.telegram', value: 'enslabs' },
    { key: 'com.linkedin', value: 'enslabs' },
    { key: 'com.instagram', value: 'enslabs' },
    // Contact records
    { key: 'location', value: 'New York, NY' },
    { key: 'phone', value: '+1-555-123-4567' },
    { key: 'mail', value: 'PO Box 123, New York, NY 10001' },
    // Links (as JSON string)
    {
      key: 'links',
      value: JSON.stringify([
        { name: 'Blog', url: 'https://ens.domains/blog' },
        {
          name: 'Brand',
          url: 'https://brand.ens.domains',
        },
        {
          name: 'ENS Labs',
          url: 'https://enslabs.org',
        },
      ]),
    },
    // Unknown/custom records
    { key: 'custom.record', value: 'custom value' },
  ],
  coins: [
    // ETH (coinType 60)
    {
      coinType: 60,
      value: '0x1234567890abcdef1234567890abcdef12345678',
      symbol: 'ETH',
    },
    // BTC (coinType 0)
    {
      coinType: 0,
      value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      symbol: 'BTC',
    },
    // LTC (coinType 2)
    {
      coinType: 2,
      value: 'ltc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      symbol: 'LTC',
    },
    // DOGE (coinType 3)
    {
      coinType: 3,
      value: 'D7Y55w9F1Q6gkQwQ6gkQwQ6gkQwQ6gkQwQ',
      symbol: 'DOGE',
    },
    // SOL (coinType 501)
    {
      coinType: 501,
      value: '4Nd1mYQwQ6gkQwQ6gkQwQ6gkQwQ6gkQwQ6gkQwQ6gkQwQ',
      symbol: 'SOL',
    },
  ],
  resolverAddress: zeroAddress,
}

const DEBUG_SHARED_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678'
const DEBUG_SECONDARY_ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const EVM_COIN_TYPE_OFFSET = 0x80000000
const SHARED_DEBUG_COIN_TYPES = new Set<number>([
  coinNameToTypeMap.default,
  coinNameToTypeMap.op,
  coinNameToTypeMap.base,
  coinNameToTypeMap.scr,
])

const existingDebugCoins = new Map(
  DEBUG_PROFILE.coins.map((coin) => [coin.coinType, coin]),
)

// Exercise every known coin type without pretending these are transfer targets.
// Non-EVM placeholders without an existing sample are intentionally display-only;
// the editor can also demonstrate format validation against those placeholders.
const addressCoverageCoins = Object.entries(coinTypeToNameMap).map(
  ([coinType, [symbol]], index) => {
    const numericCoinType = Number(coinType)
    const existing = existingDebugCoins.get(numericCoinType)
    if (existing) return existing

    if (numericCoinType >= EVM_COIN_TYPE_OFFSET) {
      const hasSharedAddress =
        SHARED_DEBUG_COIN_TYPES.has(numericCoinType) || index % 2 === 0
      const value = hasSharedAddress
        ? DEBUG_SHARED_ADDRESS
        : `0x${numericCoinType.toString(16).padStart(40, '0')}`
      return { coinType: numericCoinType, value, symbol }
    }

    return {
      coinType: numericCoinType,
      value: `debug-${symbol}-${coinType}`,
      symbol,
    }
  },
)

export const DEBUG_ADDRESSES_PROFILE: ProfileRecordsResult = {
  ...DEBUG_PROFILE,
  texts: DEBUG_PROFILE.texts.map((record) =>
    record.key === 'description'
      ? {
          ...record,
          value:
            'Development profile with synthetic addresses: shared Ethereum addresses, separate network addresses, legacy records, and unknown coin types. These are display fixtures, not payment destinations.',
        }
      : record,
  ),
  coins: [
    ...addressCoverageCoins,
    ...L2_REVERSE_REGISTRAR_CHAIN_IDS.map((chainId, index) => ({
      coinType: getCoinTypeForReverseRegistrarChainId(chainId, 'sepolia'),
      // Case differences must not split a shared EVM address into another card.
      value:
        index % 2 === 0
          ? DEBUG_SHARED_ADDRESS.toUpperCase().replace('0X', '0x')
          : DEBUG_SECONDARY_ADDRESS,
      symbol: `sepolia-${chainId}`,
    })),
    {
      coinType: EVM_COIN_TYPE_OFFSET + 1234567,
      value: DEBUG_SHARED_ADDRESS,
      symbol: 'unknown-evm',
    },
    {
      coinType: EVM_COIN_TYPE_OFFSET + 7654321,
      value: DEBUG_SECONDARY_ADDRESS,
      symbol: 'unknown-evm-separate',
    },
    {
      coinType: 123456789,
      value: 'debug-unknown-coin-address',
      symbol: 'unknown-coin',
    },
  ],
}

const AGENT_REGISTRY_HEX =
  '0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432'
const UNKNOWN_AGENT_REGISTRY_HEX =
  '0x000100000101141234567890abcdef1234567890abcdef12345678'
const IPFS_CONTENT_HASH =
  'ipfs://QmYwAPJzv5CZsnAzt8auVZRnGi2Ck9o7KVR9Jn5GqAP9S8'

const RECORDS_PROFILE: ProfileRecordsResult = {
  texts: [
    { key: 'name', value: 'Record coverage' },
    { key: 'avatar', value: 'https://euc.li/enslabs.eth' },
    { key: 'header', value: 'https://euc.li/enslabs.eth/h' },
    {
      key: 'description',
      value: 'Every supported text record and advanced record category.',
    },
    { key: 'url', value: 'https://ens.domains' },
    { key: 'theme', value: '#007C20' },
    { key: 'language', value: 'sv' },
    { key: 'primary-contact', value: 'com.twitter' },
    {
      key: 'domains.ens.primary-contacts',
      value: JSON.stringify(['com.twitter', 'org.telegram', 'email']),
    },
    { key: 'com.twitter', value: 'https://x.com/ensdomains' },
    { key: 'org.telegram', value: '@ensdomains' },
    { key: 'xyz.farcaster', value: 'ens' },
    { key: 'com.instagram', value: 'ensdomains' },
    { key: 'com.discord', value: 'ensdomains' },
    { key: 'com.github', value: 'https://github.com/ensdomains' },
    { key: 'com.linkedin', value: 'https://www.linkedin.com/in/ensdomains' },
    { key: 'com.youtube', value: '@ensdomains' },
    { key: 'com.reddit', value: 'ensdomains' },
    { key: 'com.tiktok', value: '@ensdomains' },
    { key: 'com.twitch', value: 'ensdomains' },
    { key: 'com.mastodon', value: '@ens@mastodon.social' },
    { key: 'email', value: 'records@example.com' },
    { key: 'location', value: 'Stockholm, Sweden' },
    { key: 'phone', value: '+46-70-123-45-67' },
    {
      key: 'mail',
      value: 'Example House\n123 Example Street\nStockholm, Sweden',
    },
    { key: 'timezone', value: 'Europe/Stockholm' },
    {
      key: 'links',
      value: JSON.stringify([
        { name: 'ENS', url: 'https://ens.domains' },
        { name: 'Documentation', url: 'https://docs.ens.domains' },
        { name: 'Source', url: 'https://github.com/ensdomains' },
      ]),
    },
    { key: `agent-registration[${AGENT_REGISTRY_HEX}][19151]`, value: '1' },
    {
      key: `agent-registration[${UNKNOWN_AGENT_REGISTRY_HEX}][42]`,
      value: '1',
    },
  ],
  coins: [{ coinType: 60, value: DEBUG_SHARED_ADDRESS, symbol: 'ETH' }],
  contentHash: IPFS_CONTENT_HASH,
  abi: JSON.stringify([
    {
      type: 'function',
      name: 'greet',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'string', name: 'message' }],
    },
  ]),
  resolverAddress: zeroAddress,
}

const LONG_TOKEN = 'unbrokentext'.repeat(24)
const LONG_PROFILE: ProfileRecordsResult = {
  ...RECORDS_PROFILE,
  texts: [
    { key: 'name', value: `A very long display name ${LONG_TOKEN}` },
    {
      key: 'description',
      value: `Multiline biography with accents: Göteborg, 東京, العربية.\n${'A long sentence that should wrap naturally across narrow screens. '.repeat(12)}\n${LONG_TOKEN}`,
    },
    {
      key: 'url',
      value: `https://example.com/${LONG_TOKEN}?reference=${LONG_TOKEN}`,
    },
    { key: 'email', value: `${LONG_TOKEN}@example.com` },
    {
      key: 'location',
      value: `A very long location in Göteborg, Sweden ${LONG_TOKEN}`,
    },
    { key: 'timezone', value: 'Pacific/Chatham' },
    { key: 'phone', value: `+46${'1234567890'.repeat(8)}` },
    {
      key: 'mail',
      value: `Department ${LONG_TOKEN}\n123 Example Street\nGöteborg, Sweden`,
    },
    { key: 'com.twitter', value: LONG_TOKEN },
    { key: 'com.discord', value: LONG_TOKEN },
    {
      key: 'domains.ens.primary-contacts',
      value: JSON.stringify(['com.twitter', 'com.discord', 'email']),
    },
    {
      key: 'links',
      value: JSON.stringify(
        Array.from({ length: 12 }, (_, index) => ({
          name: `Resource ${index + 1} ${LONG_TOKEN}`,
          url: `https://example.com/${LONG_TOKEN}/${index + 1}`,
        })),
      ),
    },
    { key: `custom.${LONG_TOKEN}`, value: LONG_TOKEN.repeat(4) },
    {
      key: `agent-registration[${AGENT_REGISTRY_HEX}][${'9'.repeat(78)}]`,
      value: '1',
    },
  ],
}

const UNSUPPORTED_PROFILE: ProfileRecordsResult = {
  texts: [
    {
      key: 'description',
      value: 'Unknown text keys, legacy fields, and unsupported address types.',
    },
    {
      key: 'custom.record',
      value: 'A custom record preserved in Other records',
    },
    { key: 'com.telegram', value: 'legacy-telegram-key' },
    {
      key: 'org.example.settings',
      value: JSON.stringify({ enabled: true, labels: ['one', 'two'] }),
    },
    { key: 'agent-registration[0xdeadbeef][123]', value: '1' },
  ],
  coins: [
    { coinType: 123456789, value: '0x1234567890abcdef' },
    { coinType: EVM_COIN_TYPE_OFFSET + 1234567, value: DEBUG_SHARED_ADDRESS },
  ],
  contentHash: 'onion://exampleunsupportedcontent',
  abi: '0x1234',
  resolverAddress: zeroAddress,
}

const MALFORMED_PROFILE: ProfileRecordsResult = {
  texts: [
    {
      key: 'description',
      value:
        'Invalid structured records, unsafe URLs, and broken images should degrade gracefully.',
    },
    { key: 'avatar', value: 'https://example.invalid/missing-avatar.png' },
    { key: 'header', value: 'https://example.invalid/missing-header.png' },
    { key: 'url', value: 'javascript:alert(1)' },
    { key: 'theme', value: 'not-a-color' },
    { key: 'timezone', value: 'Not/A_Timezone' },
    { key: 'email', value: 'not-an-email' },
    { key: 'com.twitter', value: '   ' },
    { key: 'domains.ens.primary-contacts', value: '{not valid JSON' },
    {
      key: 'links',
      value: JSON.stringify([
        {
          name: 'Valid link alongside malformed entries',
          url: 'https://ens.domains',
        },
        { name: 'Unsupported protocol', url: 'javascript:alert(1)' },
        { name: 'Missing URL' },
        { name: 123, url: 'https://example.com' },
      ]),
    },
    { key: 'agent-registration[not-hex][42]', value: '1' },
  ],
  coins: [{ coinType: 60, value: 'not-an-address' }],
  contentHash: 'not-a-content-hash',
  abi: '{not valid JSON',
  resolverAddress: zeroAddress,
}

const DEBUG_PROFILES: Readonly<Record<string, ProfileRecordsResult>> = {
  'debug.example': DEBUG_PROFILE,
  'debug-addresses.example': DEBUG_ADDRESSES_PROFILE,
  'debug-records.example': RECORDS_PROFILE,
  'debug-long.example': LONG_PROFILE,
  'debug-empty.example': { texts: [], coins: [], resolverAddress: zeroAddress },
  'debug-unsupported.example': UNSUPPORTED_PROFILE,
  'debug-malformed.example': MALFORMED_PROFILE,
}

export const getDebugProfileRecords = (
  name: string,
): ProfileRecordsResult | undefined => {
  if (!DEBUG_FEATURES_ENABLED || !Object.hasOwn(DEBUG_PROFILES, name))
    return undefined
  return DEBUG_PROFILES[name]
}
