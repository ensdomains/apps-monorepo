import { describe, expect, it } from 'vitest'
import { getExplorerNameUrl } from './explorerUrl'

const ORIGIN = 'https://sepolia.explorer.ens.domains'

describe('getExplorerNameUrl', () => {
  it.each([
    ['a name', 'nick.eth', `${ORIGIN}/nick.eth`],
    ['an emoji name, encoded', '🦊.eth', `${ORIGIN}/%F0%9F%A6%8A.eth`],
  ])('links %s', (_, name, expected) => {
    expect(getExplorerNameUrl(ORIGIN, name)).toBe(expected)
  })

  it('has no link on a network with no Explorer', () => {
    expect(getExplorerNameUrl(null, 'nick.eth')).toBeNull()
  })
})
