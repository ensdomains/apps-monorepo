import type { AddressName, LookupRecord, Meta } from '@ens-apps/indexer/bigname'
import { namehash, zeroHash } from 'viem'
import { describe, expect, it } from 'vitest'
import { getNameRecordWithCount } from './migrationBignameEvidence'

const NOW = 1_800_000_000n
const row: AddressName = {
  name: 'alice.eth',
  namehash: namehash('alice.eth'),
  display_name: 'alice.eth',
  namespace: 'ens',
  status: 'active',
  authority: 'ens_v1',
  relations: ['owner'],
  is_primary: false,
  subname_count: 0,
}
const record: LookupRecord = { ...row, read_status: 'ok' }
const meta: Meta = {
  as_of: {
    '1': { block_number: 123, block_hash: zeroHash, timestamp: String(NOW) },
  },
}
const run = (
  overrides: Partial<Parameters<typeof getNameRecordWithCount>[0]> = {},
) =>
  getNameRecordWithCount({
    row,
    meta,
    lookup: { record, meta },
    chainId: 1,
    nowSeconds: NOW,
    ...overrides,
  })

describe('getNameRecordWithCount', () => {
  it('joins the requested node and exact publication without inventing name facts', () => {
    expect(run()).toEqual({ data: { ...record, subname_count: 0 }, meta })
  })

  it.each([
    { row: { ...row, subname_count: undefined } },
    { row: { ...row, subname_count: -1 } },
    { row: { ...row, namehash: namehash('bob.eth') } },
    { row: { ...row, name: 'bob.eth' } },
    { lookup: undefined },
    { lookup: { record: { ...record, authority: 'ens_v2' as const }, meta } },
    { lookup: { record: { ...record, status: 'released' as const }, meta } },
    {
      lookup: {
        record: { ...record, read_status: 'unsupported' as const },
        meta,
      },
    },
    { meta: { ...meta, completeness: 'partial' as const } },
    {
      meta: {
        as_of: {
          '1': {
            block_number: 124,
            block_hash: zeroHash,
            timestamp: String(NOW),
          },
        },
      },
    },
    { nowSeconds: NOW + 301n },
  ])(
    'requires the original read for ambiguous evidence case %#',
    (overrides) => {
      expect(run(overrides)).toBeUndefined()
    },
  )
})
