import {
  getCoinTypeForReverseRegistrarChainId,
  L2_REVERSE_REGISTRAR_CHAIN_IDS,
} from '@ens-apps/l2-primary/v1'
import {
  coinNameToTypeMap,
  coinTypeToNameMap,
} from '@ensdomains/address-encoder'
import { type Address, zeroAddress } from 'viem'
import {
  DEBUG_ADDRESSES_PROFILE_NAME,
  isDebugProfileName,
} from '@/utils/debug-features'
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

export const getDebugProfileRecords = (
  name: string,
): ProfileRecordsResult | undefined => {
  if (!isDebugProfileName(name)) return undefined
  return name === DEBUG_ADDRESSES_PROFILE_NAME
    ? DEBUG_ADDRESSES_PROFILE
    : DEBUG_PROFILE
}
