import { describe, expect, it } from 'vitest'
import { ENS_NETWORKS, NETWORKS } from './networks'

describe('NETWORKS', () => {
  it.each(ENS_NETWORKS)('gives %s a bigname deployment', (network) => {
    expect(NETWORKS[network].endpoints.bignameApi).toMatch(/^https:\/\//)
  })
})
