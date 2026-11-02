import {
  type AddressName,
  createBignameClient,
  type LookupRecord,
  type Meta,
} from '@ens-apps/indexer/bigname'
import { namehash, zeroAddress, zeroHash } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { getMigrationInventoryIndexer } from './migrationInventoryIndexer'

const CHAIN_ID = 11155111
const NOW = Math.floor(Date.now() / 1000)
const names = ['alice.eth', 'bob.eth', 'carol.eth']
const meta = (block = 123): Meta => ({
  as_of: {
    [CHAIN_ID]: {
      block_number: block,
      block_hash: zeroHash,
      timestamp: String(NOW),
    },
  },
})
const row = (name: string): AddressName => ({
  name,
  namehash: namehash(name),
  display_name: name,
  namespace: 'ens',
  status: 'active',
  authority: 'ens_v1',
  owner: zeroAddress,
  relations: ['owner'],
  is_primary: false,
  subname_count: name === 'bob.eth' ? 2 : 0,
})
const record = (name: string): LookupRecord => ({
  ...row(name),
  read_status: 'ok',
})
const run = async (
  options: {
    readonly lookupBlock?: number
    readonly omittedCount?: string
    readonly selectedNames?: readonly string[]
  } = {},
) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname === '/v1/lookup') {
      const body = JSON.parse(String(init?.body)) as {
        readonly inputs: readonly {
          readonly id: string
          readonly name: string
        }[]
      }
      return Response.json({
        data: body.inputs.map((input) => ({
          input,
          kind: 'name',
          status: 'ok',
          record: record(input.name),
        })),
        meta: meta(options.lookupBlock),
      })
    }
    if (url.pathname.includes('/addresses/'))
      return Response.json({
        data: names.filter((name) => name !== options.omittedCount).map(row),
        meta: meta(),
        page: { next_cursor: 'more', has_more: true },
      })
    if (url.pathname.endsWith('/subnames'))
      return Response.json({ data: [], meta: meta() })
    const name = decodeURIComponent(url.pathname.slice('/v1/names/'.length))
    return Response.json({
      data: { ...record(name), subname_count: 7 },
      meta: meta(),
    })
  })
  const indexer = createBignameClient('https://bigname.example', { fetch })
  const read = () =>
    getMigrationInventoryIndexer({
      indexer,
      ownerAddress: zeroAddress,
      names: options.selectedNames ?? names,
      chainId: CHAIN_ID,
    })
  return { fetch, read, indexer }
}

describe('getMigrationInventoryIndexer', () => {
  it('replaces many individual count reads with two fresh reads at the same checkpoint', async () => {
    const { fetch, read } = await run()
    const indexer = await read()

    const results = await Promise.all(
      names.map((name) =>
        indexer.name(name, { namespace: 'ens', include: ['counts'] }),
      ),
    )

    expect(
      results.map((result) => result._unsafeUnwrap().data.subname_count),
    ).toEqual([0, 2, 0])
    expect(fetch).toHaveBeenCalledTimes(2)
    await indexer.subnames('bob.eth')
    expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).pathname).toBe(
      '/v1/names/bob.eth/subnames',
    )
    await read()
    expect(fetch).toHaveBeenCalledTimes(5)
  })

  it('uses an independent name read when count and detail publications disagree', async () => {
    const { read, fetch } = await run({ lookupBlock: 124 })
    const indexer = await read()

    const result = await indexer.name('alice.eth', {
      namespace: 'ens',
      include: ['counts'],
    })

    expect(result._unsafeUnwrap().data.subname_count).toBe(7)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not infer zero for names absent from the bounded counts page', async () => {
    const { read, fetch } = await run({ omittedCount: 'carol.eth' })
    const indexer = await read()

    const result = await indexer.name('carol.eth', {
      namespace: 'ens',
      include: ['counts'],
    })

    expect(result._unsafeUnwrap().data.subname_count).toBe(7)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('leaves small selections and explicit verified reads on their original path', async () => {
    const { read, fetch } = await run({ selectedNames: ['alice.eth'] })
    const indexer = await read()
    expect(fetch).not.toHaveBeenCalled()

    await indexer.name('alice.eth', { source: 'verified' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
