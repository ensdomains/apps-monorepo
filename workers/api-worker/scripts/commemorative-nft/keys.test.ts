import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getCommemorativeNftTokenId,
  getEligibilityKey,
  getRenderInputKey,
} from './keys'

const ADDRESS = getAddress('0x1234567890123456789012345678901234567890')

describe('commemorative NFT pipeline keys', () => {
  it('uses lowercase address eligibility keys', () => {
    expect(getEligibilityKey(ADDRESS)).toBe(
      'eligibility/0x1234567890123456789012345678901234567890.json',
    )
  })

  it('derives a deterministic decimal uint256 token ID', () => {
    const tokenId = getCommemorativeNftTokenId(ADDRESS)

    expect(tokenId).toMatch(/^(0|[1-9]\d*)$/)
    expect(BigInt(tokenId)).toBeLessThan(2n ** 256n)
    expect(getCommemorativeNftTokenId(ADDRESS)).toBe(tokenId)
  })

  it('builds canonical decimal render-input keys', () => {
    expect(getRenderInputKey('0')).toBe('render-input/0.json')
    expect(getRenderInputKey('42')).toBe('render-input/42.json')
  })

  it.each([
    '01',
    '-1',
    '+1',
    '1.0',
    '../1',
  ])('rejects non-canonical token ID %s', (tokenId) => {
    expect(() => getRenderInputKey(tokenId)).toThrow(
      'canonical decimal integer',
    )
  })
})
