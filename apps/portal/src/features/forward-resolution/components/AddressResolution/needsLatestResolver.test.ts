import { supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import { getNeedsLatestResolver } from './needsLatestResolver'

const SEPOLIA = supportedL1Chains.sepolia
const LATEST: Address = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'
const OLDER: Address = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const CUSTOM: Address = '0x4444444444444444444444444444444444444444'
const BASE_SEPOLIA_COIN_TYPE = 0x80000000 | 84532

describe('getNeedsLatestResolver', () => {
  it.each([
    [
      'warns for the default row on an older resolver',
      DEFAULT_EVM_COIN_TYPE,
      'record',
      OLDER,
      true,
    ],
    [
      'warns for an L2 row using the default address on an older resolver',
      BASE_SEPOLIA_COIN_TYPE,
      'default',
      OLDER,
      true,
    ],
    [
      "doesn't warn for an L2 row with its own address",
      BASE_SEPOLIA_COIN_TYPE,
      'record',
      OLDER,
      false,
    ],
    [
      "doesn't warn for the mainnet row",
      MAINNET_COIN_TYPE,
      'record',
      OLDER,
      false,
    ],
    [
      "doesn't warn on the latest resolver",
      DEFAULT_EVM_COIN_TYPE,
      'record',
      LATEST,
      false,
    ],
    [
      "doesn't warn on a custom resolver",
      DEFAULT_EVM_COIN_TYPE,
      'record',
      CUSTOM,
      false,
    ],
    [
      "doesn't warn without a V1 resolver",
      DEFAULT_EVM_COIN_TYPE,
      'record',
      undefined,
      false,
    ],
  ] as const)(
    '%s',
    (_, coinType, addressSource, v1ResolverAddress, expected) => {
      expect(
        getNeedsLatestResolver({
          row: { coinType, addressSource },
          v1ResolverAddress,
          chainId: SEPOLIA,
        }),
      ).toBe(expected)
    },
  )
})
