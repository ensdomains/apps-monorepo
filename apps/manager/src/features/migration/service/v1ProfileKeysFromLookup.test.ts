import type { LookupRecord, Meta } from '@ens-apps/indexer/bigname'
import { namehash, zeroAddress, zeroHash } from 'viem'
import { describe, expect, it } from 'vitest'
import { getV1ProfileKeysFromLookup } from './v1ProfileKeysFromLookup'

const NOW = 1_800_000_000n
const CHAIN_ID = 11155111
const RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd'
const SOURCE = {
  id: namehash('alice.eth'),
  name: 'alice.eth',
  resolver: RESOLVER,
} as const
const RECORD: LookupRecord = {
  name: SOURCE.name,
  namehash: SOURCE.id,
  display_name: SOURCE.name,
  namespace: 'ens',
  read_status: 'ok',
  authority: 'ens_v1',
  resolver: { chain_id: CHAIN_ID, address: RESOLVER },
  records: {
    seen_addresses: ['60', '2147483658'],
    addresses: {},
    seen_texts: ['url', 'avatar'],
    texts: {},
    seen_singletons: ['name', 'contenthash'],
    seen_abis: ['16'],
    abis: {},
  },
}
const META: Meta = {
  as_of: {
    [CHAIN_ID]: {
      block_number: 123,
      block_hash: zeroHash,
      timestamp: String(NOW),
    },
  },
}
const run = (record = RECORD, meta = META) =>
  getV1ProfileKeysFromLookup({
    source: SOURCE,
    lookup: { record, meta },
    chainId: CHAIN_ID,
    nowSeconds: NOW,
  })

describe('getV1ProfileKeysFromLookup', () => {
  it('converts observed keys in inventory order without trusting indexed record values', () => {
    expect(run()).toEqual({
      id: SOURCE.id,
      texts: ['avatar', 'url'],
      coinTypes: [2147483658, 60],
      hasContentHash: true,
      abiContentTypes: [16n],
      interfaceIds: [],
      hasName: true,
    })
  })

  it.each([
    { reason: 'another name', record: { ...RECORD, name: 'bob.eth' } },
    {
      reason: 'another node',
      record: { ...RECORD, namehash: namehash('bob.eth') },
    },
    {
      reason: 'another namespace',
      record: { ...RECORD, namespace: 'basenames' },
    },
    {
      reason: 'unsupported read',
      record: { ...RECORD, read_status: 'unsupported' as const },
    },
    {
      reason: 'new authority',
      record: { ...RECORD, authority: 'ens_v2' as const },
    },
    {
      reason: 'another chain',
      record: { ...RECORD, resolver: { chain_id: 1, address: RESOLVER } },
    },
    {
      reason: 'another source resolver',
      record: {
        ...RECORD,
        resolver: { chain_id: CHAIN_ID, address: zeroAddress },
      },
    },
    { reason: 'missing inventory', record: { ...RECORD, records: undefined } },
    {
      reason: 'unsupported record fields',
      record: { ...RECORD, unsupported_fields: ['records'] },
    },
  ] satisfies readonly {
    readonly reason: string
    readonly record: LookupRecord
  }[])('requires source fallback for $reason', ({ record }) => {
    expect(run(record)).toBeUndefined()
  })

  it.each([
    { reason: 'missing checkpoint', meta: {} },
    {
      reason: 'top-level incomplete',
      meta: { ...META, completeness: 'partial' as const },
    },
    {
      reason: 'chain incomplete',
      meta: {
        ...META,
        as_of_completeness: {
          [CHAIN_ID]: {
            completeness: 'partial' as const,
            unsupported_reason: 'gap',
          },
        },
      },
    },
    {
      reason: 'unsupported fields',
      meta: { ...META, unsupported_fields: ['records'] },
    },
    {
      reason: 'old checkpoint',
      meta: {
        as_of: {
          [CHAIN_ID]: {
            block_number: 123,
            block_hash: zeroHash,
            timestamp: String(NOW - 301n),
          },
        },
      },
    },
    {
      reason: 'future checkpoint',
      meta: {
        as_of: {
          [CHAIN_ID]: {
            block_number: 123,
            block_hash: zeroHash,
            timestamp: String(NOW + 301n),
          },
        },
      },
    },
    {
      reason: 'invalid block identity',
      meta: {
        as_of: {
          [CHAIN_ID]: {
            block_number: 123,
            block_hash: '0xbad' as const,
            timestamp: String(NOW),
          },
        },
      },
    },
  ])('requires source fallback for $reason', ({ meta }) => {
    expect(run(RECORD, meta)).toBeUndefined()
  })

  it.each([undefined, ['0'], ['3'], ['bad'], [(1n << 256n).toString()]])(
    'requires source fallback when ABI inventory cannot be safely enumerated: %j',
    (seen_abis) => {
      expect(
        run({
          ...RECORD,
          records: {
            ...RECORD.records,
            seen_addresses: [],
            addresses: {},
            seen_texts: [],
            texts: {},
            seen_singletons: [],
            abis: {},
            seen_abis,
          },
        }),
      ).toBeUndefined()
    },
  )

  it('accepts an explicitly empty inventory without skipping the later on-chain safety read', () => {
    expect(
      run({
        ...RECORD,
        records: {
          seen_addresses: [],
          addresses: {},
          seen_texts: [],
          texts: {},
          seen_singletons: [],
          seen_abis: [],
          abis: {},
        },
      }),
    ).toEqual({
      id: SOURCE.id,
      texts: [],
      coinTypes: [],
      abiContentTypes: [],
      interfaceIds: [],
      hasContentHash: false,
    })
  })
})
