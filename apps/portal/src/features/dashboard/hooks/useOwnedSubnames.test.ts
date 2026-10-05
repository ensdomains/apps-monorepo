import { BignameError, type SubnameRow } from '@ens-apps/bigname'
import { labelhash, namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListSubnames = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: { listSubnames: mockListSubnames },
}))

const { getOwnedSubnames } = await import('./useOwnedSubnames')

const OWNER = '0x5b7d523f27c5b2232536fb900ebffb590d03ff5d'

/** A subname row as bigname v0.4.1 serves it for an ENSv2 child. */
const row = (name: string, overrides: Partial<SubnameRow> = {}): SubnameRow => {
  const label = name.split('.')[0] as string
  return {
    name,
    display_name: name,
    namespace: 'ens',
    namehash: namehash(name),
    labelhash: labelhash(label),
    owner: OWNER,
    manager: OWNER,
    registration_status: 'registered',
    registered_at: '1791110460',
    created_at: '1791110460',
    expires_at: '1822646460',
    authority: 'ens_v2',
    ...overrides,
  }
}

const page = (data: SubnameRow[]) => ({
  data,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 200,
    total_count: data.length,
    has_more: false,
  },
  meta: {},
})

const notFound = (parent: string) =>
  new BignameError({
    status: 404,
    code: 'not_found',
    message: 'name not found',
    url: `/v1/names/${parent}/subnames`,
  })

describe('getOwnedSubnames', () => {
  beforeEach(() => {
    mockListSubnames.mockReset()
  })

  it('lists the live subnames of each parent, one page each', async () => {
    mockListSubnames.mockImplementation((parent: string) =>
      Promise.resolve(
        parent === 'ensforge.eth'
          ? page([
              row('alias.ensforge.eth'),
              row('different-owner.ensforge.eth', {
                owner: '0x000000000000000000000000000000000000dead',
              }),
            ])
          : page([row('nested.branch.ensforge.eth')]),
      ),
    )

    const result = await getOwnedSubnames({
      parents: ['ensforge.eth', 'branch.ensforge.eth'],
    })

    expect(result._unsafeUnwrap()).toEqual([
      { name: 'alias.ensforge.eth' },
      { name: 'different-owner.ensforge.eth' },
      { name: 'nested.branch.ensforge.eth' },
    ])
    expect(mockListSubnames).toHaveBeenCalledTimes(2)
    expect(mockListSubnames).toHaveBeenCalledWith('ensforge.eth', {
      include_expired: false,
      sort: 'name',
      page_size: 200,
    })
  })

  it('skips children with no page to navigate to', async () => {
    // tiny.fox.eth on Sepolia: an ENSv1 registry child under an ENSv2 name.
    mockListSubnames.mockResolvedValue(
      page([
        row('tiny.fox.eth', {
          registration_status: 'unregistered',
          authority: 'ens_v1',
          created_at: undefined,
          registered_at: undefined,
          expires_at: undefined,
          ens_v1: {},
        }),
      ]),
    )

    const result = await getOwnedSubnames({ parents: ['fox.eth'] })

    expect(result._unsafeUnwrap()).toEqual([])
  })

  it('returns nothing for a parent bigname has not indexed', async () => {
    mockListSubnames.mockImplementation((parent: string) =>
      parent === 'gone.eth'
        ? Promise.reject(notFound(parent))
        : Promise.resolve(page([row('sub.kept.eth')])),
    )

    const result = await getOwnedSubnames({ parents: ['gone.eth', 'kept.eth'] })

    expect(result._unsafeUnwrap()).toEqual([{ name: 'sub.kept.eth' }])
  })

  it('fails when a page fails', async () => {
    mockListSubnames.mockRejectedValue(
      new BignameError({
        status: 503,
        code: 'overloaded',
        message: 'overloaded',
        url: '/v1/names/ensforge.eth/subnames',
      }),
    )

    const result = await getOwnedSubnames({ parents: ['ensforge.eth'] })

    expect(result.isErr()).toBe(true)
  })

  it('keeps at most four requests in flight, results in parent order', async () => {
    let inFlight = 0
    let peak = 0
    mockListSubnames.mockImplementation(async (parent: string) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
      return page([row(`sub.${parent}`)])
    })
    const parents = Array.from({ length: 10 }, (_, i) => `name${i}.eth`)

    const result = await getOwnedSubnames({ parents })

    expect(peak).toBe(4)
    expect(result._unsafeUnwrap()).toEqual(
      parents.map((parent) => ({ name: `sub.${parent}` })),
    )
  })

  it('makes no request without parents', async () => {
    const result = await getOwnedSubnames({ parents: [] })

    expect(result._unsafeUnwrap()).toEqual([])
    expect(mockListSubnames).not.toHaveBeenCalled()
  })
})
