import { describe, expect, it } from 'vitest'
import { getExplorerUrl } from './explorerUrl'

const ORIGIN = 'https://sepolia.explorer.ens.domains'
const ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

describe('getExplorerUrl', () => {
  it.each([
    ['a name', { kind: 'name', name: 'nick.eth' }, `${ORIGIN}/nick.eth`],
    [
      'an emoji name, encoded',
      { kind: 'name', name: '🦊.eth' },
      `${ORIGIN}/%F0%9F%A6%8A.eth`,
    ],
    [
      'an address, on its address page',
      { kind: 'address', address: ADDRESS },
      `${ORIGIN}/addr/${ADDRESS}`,
    ],
  ] as const)('links %s', (_, target, expected) => {
    expect(getExplorerUrl(ORIGIN, target)).toBe(expected)
  })

  it('has no link on a network with no Explorer', () => {
    expect(
      getExplorerUrl(null, { kind: 'address', address: ADDRESS }),
    ).toBeNull()
  })
})
