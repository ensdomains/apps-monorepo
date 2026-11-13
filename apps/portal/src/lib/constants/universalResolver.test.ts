import { describe, expect, it } from 'vitest'
import { isOfficialPublicResolver } from './universalResolver'

describe('isOfficialPublicResolver', () => {
  it.each([
    [
      'the latest V1 PublicResolver',
      '0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5',
      true,
    ],
    [
      'the previous V1 PublicResolver',
      '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
      true,
    ],
    [
      'an older ENS resolver',
      '0x8948458626811dd0c23EB25Cc74291247077cC51',
      false,
    ],
  ] as const)('%s → %s', (_, address, expected) => {
    expect(isOfficialPublicResolver(address)).toBe(expected)
  })
})
