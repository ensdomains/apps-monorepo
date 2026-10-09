import type {
  AddressName,
  AddressNamesResponse,
  BignameClient,
  LookupRecord,
  LookupResponse,
  WrapperFuses,
} from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { classifyNames, toV1Domain } from '@ens-apps/migration'
import { errAsync, okAsync } from 'neverthrow'
import { namehash } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { readV1NamesForAddress } from './v1Names'

vi.mock('@/lib/bigname', () => ({ bigname: {} }))

const USER = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const NAME_WRAPPER = '0x0635513f179d50a207757e05759cbd106d7dfce8'
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

const NO_PARENTS: ReadonlyMap<string, number> = new Map()

const classify = (records: readonly LookupRecord[], parentFuses = NO_PARENTS) =>
  classifyNames(
    records.map((row) => toV1Domain(row, parentFuses, NAME_WRAPPER)),
    USER,
    SEPOLIA,
  )

describe('toV1Domain', () => {
  it('reads an unwrapped 2LD registrant from the holder and registry owner from the manager', () => {
    expect(
      toV1Domain(
        unwrapped2ld('alice.eth', { manager: OTHER }),
        NO_PARENTS,
        NAME_WRAPPER,
      ),
    ).toMatchObject({
      labelName: 'alice',
      owner: { id: OTHER },
      registrant: { id: USER },
      wrappedOwner: null,
      parent: { name: 'eth', wrappedDomain: null },
      registration: { expiryDate: FUTURE },
      wrappedDomain: null,
    })
  })

  it('credits a wrapped name to its holder and its registry slot to the NameWrapper', () => {
    expect(
      toV1Domain(wrapped('alice.eth', 196_609), NO_PARENTS, NAME_WRAPPER),
    ).toMatchObject({
      owner: { id: NAME_WRAPPER },
      registrant: { id: NAME_WRAPPER },
      wrappedOwner: { id: USER },
      wrappedDomain: { expiryDate: FUTURE, fuses: 196_609 },
    })
  })

  it('keeps an unset wrapper expiry as zero and carries the parent fuses', () => {
    const child = wrapped('sub.alice.eth', 0, {
      ens_v1: {
        expires_at: null,
        wrapper_fuses: fuses(0),
        wrapper_expires_at: null,
        wrapper_expires_at_reason: 'not_set',
      },
    })
    expect(
      toV1Domain(child, new Map([['alice.eth', 196_609]]), NAME_WRAPPER),
    ).toMatchObject({
      registrant: null,
      registration: null,
      parent: { name: 'alice.eth', wrappedDomain: { fuses: 196_609 } },
      wrappedDomain: { expiryDate: '0', fuses: 0 },
    })
  })
})

describe('toV1Domain migration availability', () => {
  it('flags a name bigname reports without a live ENSv2 entry as unreserved', () => {
    const domain = toV1Domain(
      unwrapped2ld('alice.eth', {
        unresolvable_reason: 'no_live_ens_v2_entry',
      }),
      NO_PARENTS,
      NAME_WRAPPER,
    )
    expect(domain.isUnreserved).toBe(true)
    expect(domain.isLeaseMissing).toBeUndefined()
  })

  it('flags a .eth name without a lease, but never a subname', () => {
    expect(
      toV1Domain(
        record('alice.eth', { ens_v1: { expires_at: null } }),
        NO_PARENTS,
        NAME_WRAPPER,
      ).isLeaseMissing,
    ).toBe(true)
    expect(
      toV1Domain(
        record('sub.alice.eth', { ens_v1: { expires_at: null } }),
        NO_PARENTS,
        NAME_WRAPPER,
      ).isLeaseMissing,
    ).toBeUndefined()
  })

  it('leaves a reserved name with a lease unflagged', () => {
    const domain = toV1Domain(
      unwrapped2ld('alice.eth'),
      NO_PARENTS,
      NAME_WRAPPER,
    )
    expect(domain).not.toHaveProperty('isUnreserved')
    expect(domain).not.toHaveProperty('isLeaseMissing')
  })

  it('offers no upgrade for an unreserved name through the adapter', () => {
    const { classified, ineligible } = classify([
      unwrapped2ld('alice.eth', {
        unresolvable_reason: 'no_live_ens_v2_entry',
      }),
    ])
    expect(classified).toEqual([])
    expect(ineligible.map(({ reason }) => reason)).toEqual(['not-reserved'])
  })
})

describe('classification through the adapter', () => {
  it('migrates a previously unwrapped name using its registrar token and registry controller', () => {
    const { classified } = classify([
      unwrapped2ld('alice.eth', {
        manager: OTHER,
        ens_v1: {
          expires_at: FUTURE,
          wrapper_state: 'emancipated',
          wrapper_fuses: fuses(PARENT_CANNOT_CONTROL | IS_DOT_ETH),
        },
      }),
    ])

    expect(classified).toMatchObject([
      {
        action: 'migrate',
        tokenType: 'unwrapped',
        registryController: OTHER,
        domain: { wrappedOwner: null, wrappedDomain: null },
      },
    ])
  })

  it('keeps an emancipated subname with no expiry eligible to copy', () => {
    const child = wrapped('sub.alice.eth', PARENT_CANNOT_CONTROL, {
      ens_v1: {
        expires_at: null,
        wrapper_state: 'emancipated',
        wrapper_fuses: fuses(PARENT_CANNOT_CONTROL),
        wrapper_expires_at: null,
        wrapper_expires_at_reason: 'no_expiry',
      },
    })
    const { classified, ineligible } = classify([
      unwrapped2ld('alice.eth'),
      child,
    ])

    expect(ineligible).toEqual([])
    expect(classified).toMatchObject([
      { action: 'migrate', tokenType: 'unwrapped' },
      {
        action: 'copy',
        tokenType: 'unlocked-child',
        sourceExpiry: 18_446_744_073_709_551_615n,
      },
    ])
  })

  it('migrates an unwrapped 2LD and records a distinct registry controller', () => {
    const { classified } = classify([
      unwrapped2ld('alice.eth', { manager: OTHER }),
    ])
    expect(classified).toMatchObject([
      {
        action: 'migrate',
        tokenType: 'unwrapped',
        registryController: OTHER,
        managerAddress: null,
      },
    ])
  })

  it('migrates a locked wrapped 2LD', () => {
    expect(classify([wrapped('alice.eth', 196_609)]).classified).toMatchObject([
      { action: 'migrate', tokenType: 'locked-2ld' },
    ])
  })

  it('migrates an emancipated child of a locked parent as detached', () => {
    const { classified } = classify(
      [wrapped('sub.alice.eth', PARENT_CANNOT_CONTROL)],
      new Map([['alice.eth', 196_609]]),
    )
    expect(classified).toMatchObject([
      { action: 'migrate', tokenType: 'detached-child' },
    ])
  })

  it('copies a registry child under an unwrapped parent being migrated', () => {
    const { classified } = classify([
      unwrapped2ld('alice.eth'),
      record('sub.alice.eth', { status: 'active' }),
    ])
    expect(
      classified.map(({ action, tokenType }) => ({ action, tokenType })),
    ).toEqual([
      { action: 'migrate', tokenType: 'unwrapped' },
      { action: 'copy', tokenType: 'registry-child' },
    ])
  })

  it('leaves a name someone else holds unclassified', () => {
    expect(
      classify([unwrapped2ld('alice.eth', { owner: OTHER })]).classified,
    ).toEqual([])
  })
})

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

  it('restarts the listing from the first page when its cursor goes stale', async () => {
    const addressNames = vi
      .fn<BignameClient['addressNames']>()
      .mockReturnValueOnce(okAsync(listPage([listRow('alice.eth')], 'next')))
      .mockReturnValueOnce(errAsync(stale()))
      .mockReturnValue(okAsync(listPage([listRow('alice.eth')])))

    const result = await readV1NamesForAddress(
      { addressNames, lookup: lookupFromFixtures },
      USER,
    )

    expect(addressNames).toHaveBeenCalledTimes(3)
    expect(addressNames.mock.calls[2]?.[1]?.cursor).toBeUndefined()
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
