import { mockEnsV1WrapperTrailsLease } from '@ens-apps/bigname/postV041.mock'
import { classifyName } from '@ens-apps/migration'
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
/** Decimal Unix seconds. The ENSv1 lease lives under `ens_v1`. */
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

/**
 * Route mocked requests by path; the names walk pages on `cursor`. As on
 * bigname, a row's `restrictions` are served only with `include=role_summary`.
 */
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
    const hasRoleSummary = url.searchParams.get('include') === 'role_summary'
    const data = (pages[index] ?? []).map((item) => {
      const { restrictions, ...rest } = item as Record<string, unknown>
      return hasRoleSummary ? item : rest
    })
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
    expect(url?.searchParams.get('include')).toBeNull()
    expect(url?.searchParams.get('page_size')).toBe('200')
  })

  it('reads the NameWrapper expiry from ens_v1 in one walk without role_summary', async () => {
    const wrapped = {
      registration_status: 'wrapped',
      ens_v1: mockEnsV1WrapperTrailsLease,
    }
    // An unwrapped name can keep serving `wrapper_state` with no expiry; it
    // must not send the walk back for `restrictions` it does not have.
    const unwrapped = {
      ens_v1: {
        expires_at: LEASE,
        wrapper_state: 'emancipated',
        wrapper_fuses: { fuses: 196608 },
      },
    }
    serve({
      pages: [[row('stale.eth', wrapped), row('unwrapped.eth', unwrapped)]],
      lookup: () =>
        lookupOk([
          detail('stale.eth', wrapped),
          detail('unwrapped.eth', unwrapped),
        ]),
    })

    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    // The entry trails the lease: not the lease plus 90 days.
    expect(result.value[0]).toMatchObject({
      registration: { expiryDate: mockEnsV1WrapperTrailsLease.expires_at },
      wrappedDomain: {
        expiryDate: mockEnsV1WrapperTrailsLease.wrapper_expires_at,
        fuses: mockEnsV1WrapperTrailsLease.wrapper_fuses.fuses,
      },
    })
    expect(result.value[1]?.wrappedDomain).toBeNull()
    expect(result.value[1]?.registrant).toEqual({ id: OWNER })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(listCalls().map((url) => url.searchParams.get('include'))).toEqual([
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
              wrapper_expires_at: RESERVATION,
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
              wrapper_expires_at: RESERVATION,
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

  it.each([
    'failed',
    'stale',
  ] as const)('fails discovery instead of dropping a child with %s detail', async (status) => {
    serve({
      pages: [[row('ok.eth'), row('problem.eth')]],
      lookup: () =>
        bignameResponse({
          data: [
            {
              kind: 'name',
              input: { name: 'ok.eth' },
              status: 'ok',
              record: detail('ok.eth'),
            },
            {
              kind: 'name',
              input: { name: 'problem.eth' },
              status,
              record: detail('problem.eth', { status }),
              failure_reason: 'read_failed',
            },
          ],
          meta: {},
        }),
    })
    const result = await getV1NamesForAddress(OWNER)
    assert(result.isErr())
    expect(result.error._tag).toBe('GetV1NamesError')
    expect(result.error.cause).toMatchObject({
      message: 'BigName could not read migration details for problem.eth',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([
    'failed',
    'stale',
  ] as const)('does not classify a detached child using a %s parent read', async (status) => {
    const child = detail('child.parent.eth', {
      registration_status: 'wrapped',
      resolver: null,
      ens_v1: {
        expires_at: null,
        wrapper_expires_at: RESERVATION,
        wrapper_state: 'emancipated',
        wrapper_fuses: { fuses: 65536 },
      },
    })
    const parent = detail('parent.eth', {
      ens_v1: {
        expires_at: LEASE,
        wrapper_expires_at: RESERVATION,
        wrapper_state: 'locked',
        wrapper_fuses: { fuses: 1 },
      },
    })
    serve({
      pages: [[row('child.parent.eth')]],
      lookup: () =>
        bignameResponse({
          data: [
            {
              kind: 'name',
              input: { name: child.name },
              status: 'ok',
              record: child,
            },
            {
              kind: 'name',
              input: { name: parent.name },
              status,
              record: { ...parent, status },
              failure_reason: 'read_failed',
            },
          ],
          meta: {},
        }),
    })
    const failed = await getV1NamesForAddress(OWNER)
    assert(failed.isErr())
    expect(failed.error.cause).toMatchObject({
      message: 'BigName could not read migration details for parent.eth',
    })

    // A subsequent successful read supplies the fuses and keeps the direct
    // detached-child route, instead of presenting the parent-copy route.
    serve({
      pages: [[row(child.name)]],
      lookup: () => lookupOk([child, parent]),
    })
    const recovered = await getV1NamesForAddress(OWNER)
    assert(recovered.isOk())
    const domain = recovered.value[0]
    assert(domain)
    expect(classifyName(domain, OWNER, 11155111)).toMatchObject({
      type: 'classified',
      name: { action: 'migrate', tokenType: 'detached-child' },
    })
  })

  it.each([
    'failed',
    'stale',
  ] as const)('ignores a speculative %s parent result for an unwrapped registry child', async (status) => {
    const child = detail('child.parent.eth', {
      registration_status: 'registered',
      resolver: null,
      ens_v1: { expires_at: null },
    })
    serve({
      pages: [[row(child.name)]],
      lookup: () =>
        bignameResponse({
          data: [
            {
              kind: 'name',
              input: { name: child.name },
              status: 'ok',
              record: child,
            },
            {
              kind: 'name',
              input: { name: 'parent.eth' },
              status,
              failure_reason: 'read_failed',
            },
          ],
          meta: {},
        }),
    })
    const result = await getV1NamesForAddress(OWNER)
    assert(result.isOk())
    const domain = result.value[0]
    assert(domain)
    expect(classifyName(domain, OWNER, 11155111)).toMatchObject({
      type: 'classified',
      name: { action: 'copy', tokenType: 'registry-child' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails when the lookup response omits a required input result', async () => {
    serve({ pages: [[row('omitted.eth')]], lookup: () => lookupOk([]) })
    const result = await getV1NamesForAddress(OWNER)
    assert(result.isErr())
    expect(result.error.cause).toMatchObject({
      message: 'BigName could not read migration details for omitted.eth',
    })
  })

  it('fails on missing wrapper expiry without another discovery walk or a derived expiry', async () => {
    const wrapped = {
      registration_status: 'wrapped',
      ens_v1: {
        expires_at: LEASE,
        wrapper_state: 'locked',
        wrapper_fuses: { fuses: 196609 },
      },
    }
    serve({
      pages: [[row('broken.eth', wrapped)]],
      lookup: () => lookupOk([detail('broken.eth', wrapped)]),
    })
    const result = await getV1NamesForAddress(OWNER)
    assert(result.isErr())
    expect(result.error.cause).toMatchObject({
      message: 'Missing NameWrapper expiry for broken.eth',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
