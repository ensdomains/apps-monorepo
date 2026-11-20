import { describe, expect, it } from 'vitest'
import { isOfficialPublicResolver } from './universalResolver'

// Tests run on Sepolia (ensChain from .env.ci).
describe('isOfficialPublicResolver', () => {
  it.each([
    [
      'the current PublicResolver',
      '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
      true,
    ],
    [
      'the previous PublicResolver',
      '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
      true,
    ],
    ['any other resolver', '0x0822d199699f0a9D378617817a1439663234a126', false],
  ] as const)('recognizes %s: %s', (_case, address, expected) => {
    expect(isOfficialPublicResolver(address)).toBe(expected)
  })
})
