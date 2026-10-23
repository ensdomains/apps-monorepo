import type {
  AddressName,
  AddressNamesResponse,
  BignameClient,
  LookupRecord,
  WrapperFuses,
} from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { classifyNames } from '@ens-apps/migration'
import { errAsync, okAsync } from 'neverthrow'
import { namehash } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readV1NamesForAddress } from './v1Names'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

const USER = '0x1111111111111111111111111111111111111111'
const SEPOLIA = 11155111
const FUTURE = '4102444800'
const CANNOT_UNWRAP = 1
const PARENT_CANNOT_CONTROL = 65_536
const IS_DOT_ETH = 131_072

const fuses = (word: number): WrapperFuses => ({
  fuses: word,
  cannot_unwrap: (word & CANNOT_UNWRAP) !== 0,
  cannot_burn_fuses: false,
  cannot_transfer: false,
  cannot_set_resolver: false,
  cannot_set_ttl: false,
  cannot_create_subdomain: false,
  cannot_approve: false,
  parent_cannot_control: (word & PARENT_CANNOT_CONTROL) !== 0,
  is_dot_eth: (word & IS_DOT_ETH) !== 0,
  can_extend_expiry: false,
})

const record = (
  name: string,
  overrides: Partial<LookupRecord> = {},
): LookupRecord => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  owner: USER,
  manager: USER,
  status: 'active',
  authority: 'ens_v1',
  read_status: 'ok',
  ...overrides,
})

const wrapped = (
  name: string,
  word: number,
  overrides: Partial<LookupRecord> = {},
): LookupRecord =>
  record(name, {
    ens_v1: {
      expires_at: name.split('.').length === 2 ? FUTURE : null,
      wrapper_state: 'wrapped',
      wrapper_fuses: fuses(word),
      wrapper_expires_at: FUTURE,
    },
    ...overrides,
  })

const unwrapped2ld = (name: string, overrides: Partial<LookupRecord> = {}) =>
  record(name, { ens_v1: { expires_at: FUTURE }, ...overrides })

const listRow = (
  name: string,
  status: AddressName['status'] = 'active',
): AddressName => ({
  name,
  display_name: name,
  namespace: 'ens',
  namehash: namehash(name),
  status,
  relations: ['owner'],
  is_primary: false,
})

const listPage = (
  rows: readonly AddressName[],
  nextCursor: string | null = null,
): AddressNamesResponse => ({
  data: rows,
  page: {
    cursor: null,
    next_cursor: nextCursor,
    page_size: 200,
    total_count: null,
    has_more: nextCursor !== null,
  },
  meta: { as_of: {} },
})

/** Answers each input bigname knows, echoing it back as bigname does. */
const lookupFrom =
  (records: ReadonlyMap<string, LookupRecord>): BignameClient['lookup'] =>
  (body) =>
    okAsync({
      data: body.inputs.flatMap((input) => {
        const record = 'name' in input ? records.get(input.name) : undefined
        return record
          ? [{ input, kind: 'name' as const, status: 'ok' as const, record }]
          : []
      }),
      meta: { as_of: {} },
    })

const recordsByName = new Map(
  [
    unwrapped2ld('alice.eth'),
    wrapped('bob.eth', 196_609),
    wrapped('sub.bob.eth', PARENT_CANNOT_CONTROL),
  ].map((row) => [row.name, row]),
)

const lookupFromFixtures = vi.fn<BignameClient['lookup']>(
  lookupFrom(recordsByName),
)

const stale = () =>
  new BignameError({ code: 'stale', status: 409, message: 'stale' })

/** Runs the stale backoff on fake timers instead of waiting it out. */
const settle = async <T>(result: PromiseLike<T>): Promise<T> => {
  const settled = Promise.resolve(result)
  await vi.runAllTimersAsync()
  return settled
}

describe('readV1NamesForAddress', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('detaches a PARENT_CANNOT_CONTROL child on its own fuses, not its parent’s', async () => {
    const parent = unwrapped2ld('alice.eth', {
      ens_v1: {
        expires_at: FUTURE,
        wrapper_state: 'locked',
        wrapper_fuses: fuses(
          CANNOT_UNWRAP | PARENT_CANNOT_CONTROL | IS_DOT_ETH,
        ),
      },
    })
    const child = wrapped('sub.alice.eth', PARENT_CANNOT_CONTROL)
    const rows = new Map([parent, child].map((row) => [row.name, row]))
    const result = await settle(
      readV1NamesForAddress(
        {
          addressNames: () =>
            okAsync(listPage([listRow('alice.eth'), listRow('sub.alice.eth')])),
          lookup: lookupFrom(rows),
        },
        USER,
      ),
    )
    const { classified } = classifyNames(result._unsafeUnwrap(), USER, SEPOLIA)

    expect(
      classified.map(({ action, tokenType }) => [action, tokenType]),
    ).toEqual([
      ['migrate', 'unwrapped'],
      ['migrate', 'detached-child'],
    ])
  })

  it('lists the ENSv1 names, skips released and reverse rows, and reads parents only for wrapped subnames', async () => {
    const addressNames = vi.fn<BignameClient['addressNames']>((_, query) =>
      okAsync(
        query?.cursor
          ? listPage([listRow('sub.bob.eth'), listRow('abc.addr.reverse')])
          : listPage(
              [
                listRow('alice.eth'),
                listRow('bob.eth'),
                listRow('gone.eth', 'released'),
              ],
              'next',
            ),
      ),
    )
    lookupFromFixtures.mockClear()

    const result = await settle(
      readV1NamesForAddress({ addressNames, lookup: lookupFromFixtures }, USER),
    )

    expect(addressNames).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        relation: 'any',
        authority: ['ens_v1', 'ens_v0'],
      }),
      expect.anything(),
    )
    expect(lookupFromFixtures.mock.calls.map(([body]) => body.inputs)).toEqual([
      [
        { id: '0', name: 'alice.eth' },
        { id: '1', name: 'bob.eth' },
        { id: '2', name: 'sub.bob.eth' },
      ],
      [{ id: '0', name: 'bob.eth' }],
    ])
    expect(
      result
        ._unsafeUnwrap()
        .map(({ name, parent }) => [name, parent?.wrappedDomain ?? null]),
    ).toEqual([
      ['alice.eth', null],
      ['bob.eth', null],
      ['sub.bob.eth', { fuses: 196_609 }],
    ])
  })

  it('reads an unlisted parent and keeps subnames left under an upgraded one visible', async () => {
    const rows = new Map(
      [
        record('carol.eth', { authority: 'ens_v2' }),
        record('sub.carol.eth'),
        unwrapped2ld('alice.eth'),
        record('sub.alice.eth'),
      ].map((row) => [row.name, row]),
    )
    const lookup = vi.fn<BignameClient['lookup']>(lookupFrom(rows))

    const result = await settle(
      readV1NamesForAddress(
        {
          addressNames: () =>
            okAsync(
              listPage([
                listRow('alice.eth'),
                listRow('sub.alice.eth'),
                listRow('sub.carol.eth'),
              ]),
            ),
          lookup,
        },
        USER,
      ),
    )
    const domains = result._unsafeUnwrap()

    expect(lookup.mock.calls[1]?.[0].inputs).toEqual([
      { id: '0', name: 'carol.eth' },
    ])
    expect(classifyNames(domains, USER, SEPOLIA)).toMatchObject({
      classified: [
        { domain: { name: 'alice.eth' } },
        { domain: { name: 'sub.alice.eth' } },
      ],
      ineligible: [
        { domain: { name: 'sub.carol.eth' }, reason: 'parent-upgraded' },
      ],
    })
  })

  it('fails instead of classifying around a name it could not read', async () => {
    const result = await settle(
      readV1NamesForAddress(
        {
          addressNames: () => okAsync(listPage([listRow('alice.eth')])),
          lookup: () =>
            okAsync({
              data: [
                { input: { name: 'alice.eth' }, kind: 'name', status: 'stale' },
              ],
              meta: { as_of: {} },
            }),
        },
        USER,
      ),
    )

    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1NamesError')
  })

  it('fails when bigname leaves a requested name unanswered', async () => {
    const result = await settle(
      readV1NamesForAddress(
        {
          addressNames: () =>
            okAsync(listPage([listRow('alice.eth'), listRow('carol.eth')])),
          lookup: lookupFrom(recordsByName),
        },
        USER,
      ),
    )

    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1NamesError')
  })

  // Retry and restart are tested with the shared pager; this shows the listing uses it.
  it('sends a stale page again with its cursor', async () => {
    const addressNames = vi
      .fn<BignameClient['addressNames']>()
      .mockReturnValueOnce(okAsync(listPage([listRow('alice.eth')], 'next')))
      .mockReturnValueOnce(errAsync(stale()))
      .mockReturnValue(okAsync(listPage([listRow('bob.eth')])))

    const result = await settle(
      readV1NamesForAddress({ addressNames, lookup: lookupFromFixtures }, USER),
    )

    expect(addressNames).toHaveBeenCalledTimes(3)
    expect(addressNames.mock.calls[2]?.[1]?.cursor).toBe('next')
    expect(result._unsafeUnwrap().map(({ name }) => name)).toEqual([
      'alice.eth',
      'bob.eth',
    ])
  })

  it('retries a lookup batch whose snapshot moved, then gives up', async () => {
    const lookup = vi
      .fn<BignameClient['lookup']>()
      .mockReturnValue(errAsync(stale()))

    const result = await settle(
      readV1NamesForAddress(
        {
          addressNames: () => okAsync(listPage([listRow('alice.eth')])),
          lookup,
        },
        USER,
      ),
    )

    expect(lookup).toHaveBeenCalledTimes(3)
    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1NamesError')
  })
})
