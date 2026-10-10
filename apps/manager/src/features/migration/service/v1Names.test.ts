import type {
  AddressName,
  AddressNamesResponse,
  BignameClient,
  LookupRecord,
  LookupResponse,
  WrapperFuses,
} from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { classifyNames } from '@ens-apps/migration'
import { errAsync, okAsync } from 'neverthrow'
import { namehash } from 'viem'
import { describe, expect, it, vi } from 'vitest'
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

const lookupResponse = (records: readonly LookupRecord[]): LookupResponse => ({
  data: records.map((row) => ({
    input: { name: row.name },
    kind: 'name',
    status: 'ok',
    record: row,
  })),
  meta: { as_of: {} },
})

const recordsByName = new Map(
  [
    unwrapped2ld('alice.eth'),
    wrapped('bob.eth', 196_609),
    wrapped('sub.bob.eth', PARENT_CANNOT_CONTROL),
  ].map((row) => [row.name, row]),
)

const lookupFromFixtures = vi.fn<BignameClient['lookup']>((body) =>
  okAsync(
    lookupResponse(
      body.inputs.flatMap((input) =>
        'name' in input ? (recordsByName.get(input.name) ?? []) : [],
      ),
    ),
  ),
)

const stale = () =>
  new BignameError({ code: 'stale', status: 409, message: 'stale' })

describe('readV1NamesForAddress', () => {
  it('does not use retained fuses from an unwrapped parent to detach its child', async () => {
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
    const result = await readV1NamesForAddress(
      {
        addressNames: () =>
          okAsync(listPage([listRow('alice.eth'), listRow('sub.alice.eth')])),
        lookup: (body) =>
          okAsync(
            lookupResponse(
              body.inputs.flatMap((input) =>
                'name' in input ? (rows.get(input.name) ?? []) : [],
              ),
            ),
          ),
      },
      USER,
    )
    const { classified } = classifyNames(result._unsafeUnwrap(), USER, SEPOLIA)

    expect(
      classified.map(({ action, tokenType }) => [action, tokenType]),
    ).toEqual([
      ['migrate', 'unwrapped'],
      ['copy', 'unlocked-child'],
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

    const result = await readV1NamesForAddress(
      { addressNames, lookup: lookupFromFixtures },
      USER,
    )

    expect(addressNames).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        relation: 'any',
        authority: ['ens_v1', 'ens_v0'],
      }),
    )
    expect(lookupFromFixtures.mock.calls.map(([body]) => body.inputs)).toEqual([
      [{ name: 'alice.eth' }, { name: 'bob.eth' }, { name: 'sub.bob.eth' }],
      [{ name: 'bob.eth' }],
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

  it('fails instead of classifying around a name it could not read', async () => {
    const result = await readV1NamesForAddress(
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
    )

    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1NamesError')
  })

  it('sends a stale page again with its cursor', async () => {
    const addressNames = vi
      .fn<BignameClient['addressNames']>()
      .mockReturnValueOnce(okAsync(listPage([listRow('alice.eth')], 'next')))
      .mockReturnValueOnce(errAsync(stale()))
      .mockReturnValue(okAsync(listPage([listRow('bob.eth')])))

    const result = await readV1NamesForAddress(
      { addressNames, lookup: lookupFromFixtures },
      USER,
    )

    expect(addressNames).toHaveBeenCalledTimes(3)
    expect(addressNames.mock.calls[2]?.[1]?.cursor).toBe('next')
    expect(result._unsafeUnwrap().map(({ name }) => name)).toEqual([
      'alice.eth',
      'bob.eth',
    ])
  })

  it('restarts the listing once when its cursor stays stale', async () => {
    let firstPages = 0
    const addressNames = vi.fn<BignameClient['addressNames']>((_, query) => {
      if (query?.cursor) return errAsync(stale())
      firstPages += 1
      return okAsync(
        listPage([listRow('alice.eth')], firstPages === 1 ? 'old' : null),
      )
    })

    const result = await readV1NamesForAddress(
      { addressNames, lookup: lookupFromFixtures },
      USER,
    )

    expect(addressNames.mock.calls.at(-1)?.[1]?.cursor).toBeUndefined()
    expect(result._unsafeUnwrap().map(({ name }) => name)).toEqual([
      'alice.eth',
    ])
  })

  it('retries a lookup batch whose snapshot moved, then gives up', async () => {
    const lookup = vi
      .fn<BignameClient['lookup']>()
      .mockReturnValue(errAsync(stale()))

    const result = await readV1NamesForAddress(
      {
        addressNames: () => okAsync(listPage([listRow('alice.eth')])),
        lookup,
      },
      USER,
    )

    expect(lookup).toHaveBeenCalledTimes(3)
    expect(result._unsafeUnwrapErr()._tag).toBe('GetV1NamesError')
  })
})
