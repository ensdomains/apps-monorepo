import { describe, expect, it } from 'vitest'
import {
  createEligibility,
  createRenderInput,
  mapSnapshotCsvRecord,
} from './pipeline'

const ROW = {
  current_owner: '0x1234567890123456789012345678901234567890',
  primary_name: 'alpha, beta.eth',
  oldest_name: 'fallback',
  genesis_era: 'DeFi Summer',
  collection_depth: 'Namer',
  gas_veteran: 'Seasoned',
  name_archetype: 'Common Noun',
}

describe('commemorative NFT snapshot pipeline', () => {
  it('preserves hostile or comma-containing names as JSON data', () => {
    const row = mapSnapshotCsvRecord(ROW)
    expect(row.profileName).toBe('alpha, beta.eth')
    expect(row.rendererName).toBe('alpha, beta')
    expect(JSON.parse(JSON.stringify(createRenderInput(row))).name).toBe(
      'alpha, beta',
    )
  })

  it('uses oldest_name only when primary_name is empty', () => {
    const row = mapSnapshotCsvRecord({ ...ROW, primary_name: '' })
    expect(row.profileName).toBe('fallback.eth')
  })

  it('emits the app payload and exact renderer attributes', () => {
    const row = mapSnapshotCsvRecord({
      ...ROW,
      primary_name: 'yoginth.eth',
    })
    const proof = [
      '0x1111111111111111111111111111111111111111111111111111111111111111',
    ] as const
    const eligibility = createEligibility(row, proof)

    expect(eligibility.address).toBe(
      '0x1234567890123456789012345678901234567890',
    )
    expect(eligibility.tokenId).toMatch(/^\d+$/)
    expect(eligibility.proof).toEqual(proof)
    expect(eligibility.attributes.map(({ trait_type }) => trait_type)).toEqual([
      'Era',
      'Depth',
      'Gasveteran',
      'Archetype',
      'Rarity',
      'Seed',
    ])
  })
})
