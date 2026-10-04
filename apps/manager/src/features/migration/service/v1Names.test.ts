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
/** bigname v0.4.1: decimal Unix seconds. The ENSv1 lease lives under `ens_v1`. */
const LEASE = '1893456000'
/** The ENSv2 reservation premigration made: lease + 62 days. */
const RESERVATION = String(Number(LEASE) + 62 * 86_400)

const row = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  owner: OWNER,
  manager: OWNER,
  registration_status: 'active',
  created_at: '1700000000',
  expires_at: RESERVATION,
  grace_ends_at: String(Number(RESERVATION) + 28 * 86_400),
  authority: 'ens_v1',
  ens_v1: { expires_at: LEASE },
  relations: ['owner', 'manager'],
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
  manager: OWNER,
  expires_at: RESERVATION,
  registration_status: 'active',
  authority: 'ens_v1',
  ens_v1: { expires_at: LEASE },
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
  readonly pages?: readonly unknown[][]
  readonly lookup?: (inputs: readonly { name: string }[]) => Response
}

/** Route mocked requests by path; the names walk pages on `cursor`. */
const serve = ({ pages = [[]], lookup }: Responses) => {
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const { url, body } = bignameRequest([input, init])
    if (url.pathname === '/v1/lookup') {
      const inputs = (body as { inputs: { name: string }[] }).inputs
      if (!lookup) throw new Error('unexpected lookup')
      return lookup(inputs)
    }
    const cursor = url.searchParams.get('cursor')
    const index = cursor ? Number(cursor) : 0
    const data = pages[index] ?? []
    const next = index + 1 < pages.length ? String(index + 1) : null
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
  it('lists ens_v1 and ens_v0 names in one walk and adapts their detail', async () => {
    serve({
      pages: [[row('alice.eth'), row('legacy.eth', { authority: 'ens_v0' })]],
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
      registration: { expiryDate: LEASE },
    })

    const calls = listCalls()
    expect(calls).toHaveLength(1)
    const [url] = calls
    expect(url?.pathname).toBe(`/v1/addresses/${OWNER}/names`)
    expect(url?.searchParams.get('relation')).toBe('any')
    expect(url?.searchParams.get('authority')).toBe('ens_v1,ens_v0')
    expect(url?.searchParams.get('include')).toBe('role_summary')
    expect(url?.searchParams.get('page_size')).toBe('200')
  })

  it('reads the NameWrapper expiry from the row restrictions, else derives it from the lease', async () => {
    const wrapper = {
      expires_at: LEASE,
      wrapper_state: 'locked',
      wrapper_fuses: { fuses: 196609 },
    }
    const served = '1900000000'
    serve({
      pages: [
        [
          row('served.eth', {
            registration_status: 'wrapped',
            ens_v1: wrapper,
            restrictions: {
              registration_id: 'r1',
              kind: 'ens_v1_wrapper',
              wrapper_state: 'locked',
              wrapper_fuses: { fuses: 196609 },
              wrapper_expires_at: served,
            },
          }),
          row('derived.eth', {
            registration_status: 'wrapped',
            ens_v1: wrapper,
          }),
        ],
      ],
      lookup: (inputs) =>
        lookupOk(
          inputs.map(({ name }) =>
            detail(name, { registration_status: 'wrapped', ens_v1: wrapper }),
          ),
        ),
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(result.value.map((domain) => domain.wrappedDomain)).toEqual([
      { expiryDate: served, fuses: 196609 },
      {
        expiryDate: String(Number(LEASE) + 90 * 86_400),
        fuses: 196609,
      },
    ])
  })

  it('walks again without role_summary when its budget answers 422', async () => {
    serve({
      pages: [[row('alice.eth')]],
      lookup: () => lookupOk([detail('alice.eth')]),
    })
    const serveRows = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const { url } = bignameRequest([input, init])
      if (url.searchParams.get('include') === 'role_summary') {
        return bignameResponse(
          {
            error: {
              code: 'unsupported',
              message: 'role summary budget exceeded',
              details: {},
            },
          },
          422,
        )
      }
      return serveRows?.(input, init)
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(result.value.map((domain) => domain.name)).toEqual(['alice.eth'])
    expect(listCalls().map((url) => url.searchParams.get('include'))).toEqual([
      'role_summary',
      null,
    ])
  })

  it('lists an unwrapped .eth 2LD for its token holder (owner), not its controller (manager)', async () => {
    const controller = '0x0000000000000000000000000000000000000009'
    serve({
      pages: [[row('held.eth', { manager: controller })]],
      lookup: () => lookupOk([detail('held.eth', { manager: controller })]),
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    expect(result.value[0]).toMatchObject({
      owner: { id: controller },
      registrant: { id: OWNER },
    })
  })

  it('follows cursors until the last page', async () => {
    serve({
      pages: [[row('a.eth')], [row('b.eth')]],
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

  it('drops reverse records, released names and registry children without a name row', async () => {
    serve({
      pages: [
        [
          row('keep.eth'),
          row('released.eth', { registration_status: 'released' }),
          row('gone.keep.eth', {
            registration_status: 'unregistered',
            created_at: undefined,
            expires_at: undefined,
            ens_v1: { expires_at: null },
          }),
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
      pages: [
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
            registration_status: 'wrapped',
            ens_v1: {
              expires_at: null,
              wrapper_state: 'emancipated',
              wrapper_fuses: { fuses: 65536 },
            },
          }),
          detail('b.parent.eth'),
          detail('c.mine.eth'),
          detail('mine.eth'),
          detail('parent.eth', {
            owner: '0x0000000000000000000000000000000000000009',
            registration_status: 'wrapped',
            ens_v1: {
              expires_at: LEASE,
              wrapper_state: 'locked',
              wrapper_fuses: { fuses: 1 },
            },
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
      pages: [[row('ok.eth'), row('unsupported.eth'), row('missing.eth')]],
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
