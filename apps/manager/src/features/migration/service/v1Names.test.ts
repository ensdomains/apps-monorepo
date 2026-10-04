import { labelhash, namehash } from 'viem'
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bignamePage,
  bignameRequest,
  bignameResponse,
  OWNER,
} from './_fixtures'
import { getV1NamesForAddress } from './v1Names'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bigname', async () => {
  const { createBignameClient } = await import('@ens-apps/bigname')
  return {
    bigname: createBignameClient({
      baseUrl: 'https://bigname.test',
      fetch: fetchMock,
      retry: false,
    }),
  }
})

const RESOLVER = '0x000000000000000000000000000000000000dddd'
const EXPIRES = '2030-01-01T00:00:00Z'

const row = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  owner: OWNER,
  registrant: OWNER,
  registration_status: 'active',
  expires_at: EXPIRES,
  authority: 'ens_v1',
  relations: ['owner', 'registrant'],
  is_primary: false,
  ...overrides,
})

const detail = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  status: 'ok',
  owner: OWNER,
  registrant: OWNER,
  expires_at: EXPIRES,
  registration_status: 'active',
  authority: 'ens_v1',
  resolver: { chain_id: 11155111, address: RESOLVER },
  ...overrides,
})

const lookupOk = (records: ReturnType<typeof detail>[]) =>
  bignameResponse({
    data: records.map((record) => ({
      input: { name: record.name },
      kind: 'name',
      status: 'ok',
      record,
    })),
    meta: {},
  })

type Responses = {
  readonly v1?: readonly unknown[][]
  readonly v0?: readonly unknown[][]
  readonly lookup?: (inputs: readonly { name: string }[]) => Response
}

/** Route mocked requests by path and authority, since the walks run in parallel. */
const serve = ({ v1 = [[]], v0 = [[]], lookup }: Responses) => {
  const pages = { ens_v1: [...v1], ens_v0: [...v0] }
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const { url, body } = bignameRequest([input, init])
    if (url.pathname === '/v1/lookup') {
      const inputs = (body as { inputs: { name: string }[] }).inputs
      if (!lookup) throw new Error('unexpected lookup')
      return lookup(inputs)
    }
    const authority = url.searchParams.get('authority') as keyof typeof pages
    const cursor = url.searchParams.get('cursor')
    const index = cursor ? Number(cursor) : 0
    const data = pages[authority][index] ?? []
    const next = index + 1 < pages[authority].length ? String(index + 1) : null
    return bignameResponse(bignamePage(data, { nextCursor: next }))
  })
}

const listCalls = () =>
  fetchMock.mock.calls
    .map((call) => bignameRequest(call).url)
    .filter((url) => url.pathname.endsWith('/names'))

beforeEach(() => {
  fetchMock.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getV1NamesForAddress', () => {
  it('lists ens_v1 and ens_v0 names for any relation and adapts their detail', async () => {
    serve({
      v1: [[row('alice.eth')]],
      v0: [[row('legacy.eth', { authority: 'ens_v0' })]],
      lookup: () => lookupOk([detail('alice.eth'), detail('legacy.eth')]),
    })

    const result = await getV1NamesForAddress(OWNER.toUpperCase())
    assert(result.isOk())
    expect(result.value.map((domain) => domain.name)).toEqual([
      'alice.eth',
      'legacy.eth',
    ])
    expect(result.value[0]).toMatchObject({
      id: namehash('alice.eth'),
      labelName: 'alice',
      labelhash: labelhash('alice'),
      resolver: { address: RESOLVER },
      registrant: { id: OWNER },
      registration: { expiryDate: String(Date.parse(EXPIRES) / 1000) },
    })

    const calls = listCalls()
    expect(
      calls.map((url) => url.searchParams.get('authority')).sort(),
    ).toEqual(['ens_v0', 'ens_v1'])
    for (const url of calls) {
      expect(url.pathname).toBe(`/v1/addresses/${OWNER}/names`)
      expect(url.searchParams.get('relation')).toBe('any')
      expect(url.searchParams.get('page_size')).toBe('200')
    }
  })

  it('follows cursors until the last page', async () => {
    serve({
      v1: [[row('a.eth')], [row('b.eth')]],
      lookup: (inputs) => lookupOk(inputs.map(({ name }) => detail(name))),
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(result.value.map((domain) => domain.name)).toEqual([
      'a.eth',
      'b.eth',
    ])
    expect(
      listCalls().filter((url) => url.searchParams.get('cursor') === '1'),
    ).toHaveLength(1)
  })

  it('drops reverse records and released or unregistered names', async () => {
    serve({
      v1: [
        [
          row('keep.eth'),
          row('released.eth', { registration_status: 'released' }),
          row('gone.eth', { registration_status: 'unregistered' }),
          row(`${'a'.repeat(40)}.addr.reverse`),
        ],
      ],
      lookup: (inputs) => lookupOk(inputs.map(({ name }) => detail(name))),
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(result.value.map((domain) => domain.name)).toEqual(['keep.eth'])
  })

  it('looks up unlisted parents of subnames once, for their fuses', async () => {
    let lookupInputs: readonly { name: string }[] = []
    serve({
      v1: [
        [
          row('a.parent.eth'),
          row('b.parent.eth'),
          row('c.mine.eth'),
          row('mine.eth'),
        ],
      ],
      lookup: (inputs) => {
        lookupInputs = inputs
        return lookupOk([
          detail('a.parent.eth', {
            registrant: undefined,
            wrapper_state: 'emancipated',
            wrapper_fuses: { fuses: 65536 },
          }),
          detail('b.parent.eth'),
          detail('c.mine.eth'),
          detail('mine.eth'),
          detail('parent.eth', {
            owner: '0x0000000000000000000000000000000000000009',
            wrapper_state: 'locked',
            wrapper_fuses: { fuses: 1 },
          }),
        ])
      },
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(lookupInputs.map(({ name }) => name)).toEqual([
      'a.parent.eth',
      'b.parent.eth',
      'c.mine.eth',
      'mine.eth',
      'parent.eth',
    ])
    expect(result.value.map((domain) => domain.name)).not.toContain(
      'parent.eth',
    )
    expect(result.value[0]?.parent).toEqual({
      name: 'parent.eth',
      wrappedDomain: { fuses: 1 },
    })
  })

  it('leaves out names whose detail is unsupported or missing', async () => {
    serve({
      v1: [[row('ok.eth'), row('unsupported.eth'), row('missing.eth')]],
      lookup: () =>
        bignameResponse({
          data: [
            {
              input: { name: 'ok.eth' },
              kind: 'name',
              status: 'ok',
              record: detail('ok.eth'),
            },
            {
              input: { name: 'unsupported.eth' },
              kind: 'name',
              status: 'ok',
              record: {
                name: 'unsupported.eth',
                display_name: 'unsupported.eth',
                namespace: 'ens',
                namehash: namehash('unsupported.eth'),
                status: 'unsupported',
                unsupported_reason: 'unsupported_reason_unrecognized',
              },
            },
            {
              input: { name: 'missing.eth' },
              kind: 'name',
              status: 'not_found',
            },
          ],
          meta: {},
        }),
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(result.value.map((domain) => domain.name)).toEqual(['ok.eth'])
  })

  it('returns err when a bigname read fails', async () => {
    fetchMock.mockResolvedValue(
      bignameResponse(
        { error: { code: 'internal_error', message: 'boom', details: {} } },
        500,
      ),
    )
    const result = await getV1NamesForAddress(OWNER)
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1NamesError')
  })

  it('does not call lookup when the address has no ENSv1 names', async () => {
    serve({})
    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(result.value).toEqual([])
  })
})
