import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { getResolverChoice } from './getResolverChoice'

const LATEST: Address = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'
const LATEST_LOWERCASE: Address = '0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5'
const OLDER: Address = '0x8948458626811dd0c23EB25Cc74291247077cC51'
const TYPED = '0xabcdef123456789012345678901234567890abcd'

const run = (overrides: Partial<Parameters<typeof getResolverChoice>[0]>) =>
  getResolverChoice({
    isV1: true,
    pickedChoice: null,
    typedAddress: TYPED,
    latestAddress: LATEST,
    currentAddress: OLDER,
    ...overrides,
  })

describe('getResolverChoice', () => {
  it.each([
    ['a V1 name defaults to the latest', {}, 'latest', false, LATEST],
    [
      'a V1 name keeps a custom pick',
      { pickedChoice: 'custom' },
      'custom',
      false,
      TYPED,
    ],
    [
      'a V1 name with no resolver yet defaults to the latest',
      { currentAddress: null },
      'latest',
      false,
      LATEST,
    ],
    [
      'a V1 name already on the latest can only go custom',
      { currentAddress: LATEST_LOWERCASE, pickedChoice: 'latest' },
      'custom',
      true,
      TYPED,
    ],
    ['a V2 name is always custom', { isV1: false }, 'custom', false, TYPED],
  ] as const)('%s', (_, overrides, choice, isOnLatest, address) => {
    expect(run(overrides)).toEqual({ choice, isOnLatest, address })
  })
})
