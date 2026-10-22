import type { AddressNamesQuery } from '@ens-apps/indexer/bigname'
import { type AddressName, BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getAddressNames } from './useAddressNames'

vi.mock('@/lib/bigname', () => ({
  bigname: { addressNames: vi.fn(), lookup: vi.fn() },
}))

const ADDRESS = '0x1111111111111111111111111111111111111111'
const NOW = Temporal.Instant.from('2026-10-08T00:00:00Z')
const NOW_SECONDS = NOW.epochNanoseconds / 1_000_000_000n

const row = (
  name: string,
  overrides: Partial<AddressName> = {},
): AddressName => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: '0x01',
  owner: ADDRESS,
  status: 'active',
  authority: 'ens_v2',
  expires_at: String(NOW_SECONDS + 86_400n * 300n),
  relations: ['owner'],
  is_primary: false,
  subname_count: 2,
  record_count: 5,
  ...overrides,
})

const pageOf = (data: readonly AddressName[], next: string | null = null) =>
  okAsync({
    data,
    page: {
      cursor: null,
      next_cursor: next,
      page_size: 200,
      total_count: null,
      has_more: next !== null,
    },
    meta: { as_of: {} },
  })

// Answers the current-relations walk and the grace read separately.
const answer = (
  current: readonly (readonly AddressName[])[],
  grace: readonly AddressName[] = [],
) => {
  let currentCall = 0
  vi.mocked(bigname.addressNames).mockImplementation(
    (_, query?: AddressNamesQuery) => {
      if (query?.relation === 'former_owner') return pageOf(grace)
      const index = currentCall++
      return pageOf(
        current[index] ?? [],
        index < current.length - 1 ? `page-${index + 1}` : null,
      )
    },
  )
}

const queries = () =>
  vi.mocked(bigname.addressNames).mock.calls.map(([, query]) => query)

beforeEach(() => vi.clearAllMocks())

describe('getAddressNames', () => {
  it('lists every relation in either era with its counts, soonest expiry first', async () => {
    answer([
      [
        row('later.eth'),
        row('legacy.eth', {
          authority: 'ens_v1',
          relations: ['owner', 'manager'],
          expires_at: String(NOW_SECONDS + 86_400n * 10n),
          ens_v1: { expires_at: String(NOW_SECONDS + 86_400n * 10n) },
        }),
      ],
    ])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(queries()[0]).toMatchObject({
      namespace: 'ens',
      relation: 'any',
      include: ['counts'],
    })
    expect(names).toEqual([
      expect.objectContaining({
        name: 'legacy.eth',
        protocolVersion: 'ENSv1',
        relations: ['owner', 'manager'],
      }),
      expect.objectContaining({
        name: 'later.eth',
        protocolVersion: 'ENSv2',
        relations: ['owner'],
        subdomainCount: 2,
        recordCount: 5,
      }),
    ])
  })

  it('reads every page of the current relations', async () => {
    answer([[row('a.eth')], [row('b.eth')]])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names.map(({ name }) => name).sort()).toEqual(['a.eth', 'b.eth'])
    expect(queries()).toContainEqual(
      expect.objectContaining({ relation: 'any', cursor: 'page-1' }),
    )
  })

  it('hides reverse records and released names', async () => {
    answer([
      [
        row('abc.addr.reverse'),
        row('gone.eth', { status: 'released' }),
        row('kept.eth'),
      ],
    ])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names.map(({ name }) => name)).toEqual(['kept.eth'])
  })

  // Which rows count as in grace is tested with the shared grace read.
  it('merges the names still renewable in grace into the list', async () => {
    answer(
      [[row('held.eth')]],
      [
        row('lapsed.eth', {
          owner: undefined,
          status: 'expired',
          relations: ['former_owner'],
          expires_at: String(NOW_SECONDS - 86_400n),
          grace_ends_at: String(NOW_SECONDS + 86_400n * 27n),
          lapsed_registration: { owner: ADDRESS, release_kind: 'expired' },
        }),
      ],
    )

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names).toEqual([
      expect.objectContaining({
        name: 'lapsed.eth',
        relations: ['former_owner'],
        protocolVersion: 'ENSv2',
      }),
      expect.objectContaining({ name: 'held.eth' }),
    ])
  })

  it('keeps an ENSv1 name through its price cooldown, and drops it after', async () => {
    const DAY = 86_400n
    const released = (name: string, graceEndedDaysAgo: bigint) =>
      row(name, {
        owner: undefined,
        authority: 'ens_v1',
        status: 'released',
        relations: ['former_owner'],
        expires_at: String(NOW_SECONDS - (90n + graceEndedDaysAgo) * DAY),
        grace_ends_at: String(NOW_SECONDS - graceEndedDaysAgo * DAY),
        lapsed_registration: { owner: ADDRESS, release_kind: 'expired' },
      })
    answer([[]], [released('cooling.eth', 5n), released('gone.eth', 25n)])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names).toEqual([
      expect.objectContaining({
        name: 'cooling.eth',
        status: 'released',
        protocolVersion: 'ENSv1',
      }),
    ])
  })

  it('gives ENSv1 subnames the expiry of their .eth parent', async () => {
    const LISTED_EXPIRY = NOW_SECONDS + 86_400n * 30n
    const LOOKED_UP_EXPIRY = NOW_SECONDS + 86_400n * 60n
    const v1Subname = (name: string) =>
      row(name, {
        authority: 'ens_v1',
        expires_at: undefined,
        ens_v1: { expires_at: null },
      })
    answer([
      [
        row('listed.eth', {
          authority: 'ens_v1',
          expires_at: String(LISTED_EXPIRY),
          ens_v1: { expires_at: String(LISTED_EXPIRY) },
        }),
        v1Subname('sub.listed.eth'),
        v1Subname('deep.sub.other.eth'),
      ],
    ])
    vi.mocked(bigname.lookup).mockReturnValue(
      okAsync({
        data: [
          {
            input: { name: 'other.eth' },
            kind: 'name',
            status: 'ok',
            record: {
              name: 'other.eth',
              display_name: 'other.eth',
              namespace: 'ens',
              namehash: '0x02',
              ens_v1: { expires_at: String(LOOKED_UP_EXPIRY) },
              read_status: 'ok',
            },
          },
        ],
        meta: { as_of: {} },
      }),
    )

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(vi.mocked(bigname.lookup).mock.calls[0]?.[0].inputs).toEqual([
      { name: 'other.eth' },
    ])
    expect(names).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'sub.listed.eth',
          expiryDate: null,
          parentExpiryDate: new Date(Number(LISTED_EXPIRY) * 1000),
        }),
        expect.objectContaining({
          name: 'deep.sub.other.eth',
          parentExpiryDate: new Date(Number(LOOKED_UP_EXPIRY) * 1000),
        }),
      ]),
    )
  })

  it("orders subnames by their parent's expiry", async () => {
    const PARENT_EXPIRY = NOW_SECONDS + 86_400n * 10n
    answer([
      [
        row('later.eth'),
        row('sub.soon.eth', { authority: 'ens_v1', expires_at: undefined }),
        row('soon.eth', {
          authority: 'ens_v1',
          expires_at: String(PARENT_EXPIRY),
          ens_v1: { expires_at: String(PARENT_EXPIRY) },
        }),
      ],
    ])

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names.map(({ name }) => name)).toEqual([
      'soon.eth',
      'sub.soon.eth',
      'later.eth',
    ])
  })

  it('looks parents up in batches of at most 1000', async () => {
    const PARENT_COUNT = 1001
    answer([
      Array.from({ length: PARENT_COUNT }, (_, index) =>
        row(`sub.parent${index}.eth`, {
          authority: 'ens_v1',
          expires_at: undefined,
        }),
      ),
    ])
    vi.mocked(bigname.lookup).mockImplementation(({ inputs }) =>
      okAsync({
        data: inputs.map((input) => ({
          input,
          kind: 'name' as const,
          status: 'not_found' as const,
        })),
        meta: { as_of: {} },
      }),
    )

    await getAddressNames({ address: ADDRESS }, { now: NOW })

    expect(
      vi.mocked(bigname.lookup).mock.calls.map(([body]) => body.inputs.length),
    ).toEqual([1000, 1])
  })

  it('lists subnames without a parent expiry when its read fails', async () => {
    answer([
      [row('sub.parent.eth', { authority: 'ens_v1', expires_at: undefined })],
    ])
    vi.mocked(bigname.lookup).mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const names = (
      await getAddressNames({ address: ADDRESS }, { now: NOW })
    )._unsafeUnwrap()

    expect(names).toEqual([
      expect.objectContaining({
        name: 'sub.parent.eth',
        parentExpiryDate: null,
      }),
    ])
  })

  it('fails when a read fails', async () => {
    vi.mocked(bigname.addressNames).mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )

    const result = await getAddressNames({ address: ADDRESS }, { now: NOW })

    expect(result._unsafeUnwrapErr()._tag).toBe('GetAddressNamesError')
  })
})
