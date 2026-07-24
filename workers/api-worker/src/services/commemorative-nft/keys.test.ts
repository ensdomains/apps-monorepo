import { getAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getCommemorativeNftTokenId,
  getEligibilityKey,
  getRenderInputKey,
  getTokenAssetKey,
  normalizeTokenId,
  parseTokenAsset,
} from './keys'

const ADDRESS = getAddress('0x1234567890123456789012345678901234567890')

describe('commemorative NFT R2 keys', () => {
  it('uses lowercase address keys and deterministic address token IDs', () => {
    expect(getEligibilityKey(ADDRESS)).toBe(
      'eligibility/0x1234567890123456789012345678901234567890.json',
    )
    expect(getCommemorativeNftTokenId(ADDRESS)).toMatch(/^\d+$/)
  })

  it('builds render-input and token asset keys', () => {
    expect(getRenderInputKey('42')).toBe('render-input/42.json')
    expect(getTokenAssetKey('42', 'png')).toBe('tokens/42.png')
  })

  it('rejects non-canonical and out-of-range token IDs', () => {
    expect(() => normalizeTokenId('01')).toThrow()
    expect(() => normalizeTokenId('-1')).toThrow()
    expect(() => normalizeTokenId((2n ** 256n).toString())).toThrow()
  })

  it('parses only supported token assets', () => {
    expect(parseTokenAsset('42.json')).toEqual({
      extension: 'json',
      fileName: '42.json',
      key: 'tokens/42.json',
      tokenId: '42',
    })
    expect(parseTokenAsset('../42.json')).toBeUndefined()
    expect(parseTokenAsset('42.svg')).toBeUndefined()
  })
})
