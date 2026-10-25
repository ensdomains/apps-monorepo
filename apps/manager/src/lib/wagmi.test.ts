import { describe, expect, it } from 'vitest'
import { chain, l2Sources } from '@/config'
import { wagmiConfig } from './wagmi'

describe('wagmiConfig', () => {
  // The first chain is wagmi's default and where connect sends a wallet on an
  // unsupported chain; an L2 there would take every unpinned read with it.
  it('puts the app chain first, then each L2 source', () => {
    expect(wagmiConfig.chains.map(({ id }) => id)).toEqual([
      chain.id,
      ...l2Sources.map((source) => source.chain.id),
    ])
  })

  it('reads each L2 source on its own chain', () => {
    for (const source of l2Sources) {
      expect(source.client.chain?.id).toBe(source.chain.id)
    }
  })
})
