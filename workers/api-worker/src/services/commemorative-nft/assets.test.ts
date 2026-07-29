import { describe, expect, it } from 'vitest'
import {
  getRenderInputKey,
  getTokenAssetKey,
  parseCanonicalTokenId,
  parseTokenAsset,
} from './assets'

describe('commemorative NFT asset keys', () => {
  it('accepts canonical decimal uint256 token IDs', () => {
    expect(parseCanonicalTokenId('0')).toBe('0')
    expect(parseCanonicalTokenId((2n ** 256n - 1n).toString())).toBe(
      (2n ** 256n - 1n).toString(),
    )
  })

  it('rejects alternate and out-of-range token ID forms', () => {
    expect(parseCanonicalTokenId('01')).toBeUndefined()
    expect(parseCanonicalTokenId('+1')).toBeUndefined()
    expect(parseCanonicalTokenId('-1')).toBeUndefined()
    expect(parseCanonicalTokenId('0x01')).toBeUndefined()
    expect(parseCanonicalTokenId((2n ** 256n).toString())).toBeUndefined()
  })

  it('parses only the three supported token assets', () => {
    expect(parseTokenAsset('42.mp4')).toEqual({
      extension: 'mp4',
      key: 'tokens/42.mp4',
      tokenId: '42',
    })
    expect(parseTokenAsset('42.svg')).toBeUndefined()
    expect(parseTokenAsset('../42.png')).toBeUndefined()
    expect(parseTokenAsset('042.json')).toBeUndefined()
  })

  it('builds canonical R2 keys', () => {
    expect(getRenderInputKey('42')).toBe('render-input/42.json')
    expect(getTokenAssetKey('42', 'png')).toBe('tokens/42.png')
  })
})
