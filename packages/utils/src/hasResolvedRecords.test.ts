import { describe, expect, it } from 'vitest'
import { hasResolvedRecords } from './hasResolvedRecords'

describe('hasResolvedRecords', () => {
  it.each([
    { records: undefined, expected: false },
    { records: { texts: [], coins: [] }, expected: false },
    {
      records: { texts: [{ value: '' }], coins: [{ value: '' }] },
      expected: false,
    },
    { records: { texts: [{ value: 'A bio' }] }, expected: true },
    {
      records: {
        coins: [{ value: '0x2211d1D0020DAEA8039E46Cf1367962070d77DA9' }],
      },
      expected: true,
    },
    { records: { contentHash: 'ipfs://bafy' }, expected: true },
  ])('is $expected for $records', ({ records, expected }) => {
    expect(hasResolvedRecords(records)).toBe(expected)
  })
})
