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
    readonly countPageSize?: number
    readonly laterPageBlock?: number
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
    if (url.pathname.includes('/addresses/')) {
      const listed = names.filter((name) => name !== options.omittedCount)
      const offset = Number(url.searchParams.get('cursor') ?? 0)
      const next = offset + (options.countPageSize ?? names.length)
      return Response.json({
        data: listed.slice(offset, next).map(row),
        meta: meta(offset > 0 ? options.laterPageBlock : undefined),
        page: { next_cursor: next < listed.length ? String(next) : null },
      })
    }
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
  it('reuses counts beyond the first page of a large wallet', async () => {
    const selectedNames = Array.from(
      { length: 443 },
      (_, index) => `name${index}.eth`,
    )
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
          meta: meta(),
        })
      }
      if (url.pathname.includes('/addresses/')) {
        const offset = Number(url.searchParams.get('cursor') ?? 0)
        const next = offset + 200
        return Response.json({
          data: selectedNames.slice(offset, next).map(row),
          meta: meta(),
          page: {
            next_cursor: next < selectedNames.length ? String(next) : null,
          },
        })
      }
      throw new Error('Large wallets must use their published bulk counts')
    })
    const indexer = await getMigrationInventoryIndexer({
      indexer: createBignameClient('https://bigname.example', { fetch }),
      ownerAddress: zeroAddress,
      names: selectedNames,
      chainId: CHAIN_ID,
    })

    const results = await Promise.all(
      selectedNames.map((name) => indexer.name(name, { include: ['counts'] })),
    )

    expect(results.map((result) => result._unsafeUnwrap().data.name)).toEqual(
      selectedNames,
    )
    expect(fetch).toHaveBeenCalledTimes(5)
  })

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

  it('checks each later page against its own publication before reusing a count', async () => {
    const { read, fetch } = await run({ countPageSize: 2, laterPageBlock: 124 })
    const indexer = await read()

    const results = await Promise.all(
      ['alice.eth', 'carol.eth'].map((name) =>
        indexer.name(name, { include: ['counts'] }),
      ),
    )

    expect(
      results.map((result) => result._unsafeUnwrap().data.subname_count),
    ).toEqual([0, 7])
    expect(fetch).toHaveBeenCalledTimes(4)
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
