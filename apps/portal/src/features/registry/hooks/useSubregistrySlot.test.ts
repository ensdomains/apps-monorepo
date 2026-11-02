import type { NameHistoryRow } from '@ens-apps/indexer/bigname'
import { ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getNameHistory = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    nameHistory: (...args: unknown[]) =>
      ResultAsync.fromPromise(getNameHistory(...args), (e) => e),
  },
}))

const getNameDetail = vi.fn()
vi.mock('@/features/profile/hooks/useNameDetail', () => ({
  readIndexedNameDetail: (...args: unknown[]) =>
    ResultAsync.fromPromise(getNameDetail(...args), (e) => e),
}))

const { ensChain } = await import('@/lib/wagmi')
const { getSubregistryHistory, readSubregistryHistory } = await import(
  './useSubregistrySlot'
)

const V1_REGISTRY = ensChain.contracts.ensLegacyRegistry?.address.toLowerCase()
const V1_ORIGINAL_REGISTRY = '0x314159265dd8dbb310642f98f50c066173c1259b'
const ETH_REGISTRY = ensChain.contracts.ensRegistry?.address.toLowerCase()
const V2_REGISTRY: Address = '0x541c00000000000000000000000000000000976f'

const rows = (contracts: (string | null | undefined)[], hasMore = false) => ({
  data: contracts.map((contract_address) => ({
    type: 'subregistry',
    contract_address,
  })),
  page: {
    cursor: null,
    next_cursor: hasMore ? 'next' : null,
    page_size: 50,
    total_count: contracts.length,
    has_more: hasMore,
  },
  meta: {},
})

const linkCount = async () =>
  (await getSubregistryHistory({ name: 'test.eth' }))._unsafeUnwrap()?.linkCount

const link = (
  subregistry?: Address,
  registrationId: string | null = null,
): NameHistoryRow => ({
  id: 'a'.repeat(64),
  type: 'subregistry',
  name: 'test.eth',
  namespace: 'ens',
  registration_id: registrationId,
  block_number: 1,
  timestamp: '1',
  transaction_hash: null,
  log_index: null,
  contract_address: '0x2222222222222222222222222222222222222222',
  data: subregistry
    ? { subregistry: { chain_id: 1, address: subregistry } }
    : {},
})

describe('getSubregistryHistory', () => {
  beforeEach(() => {
    getNameHistory.mockReset()
    getNameHistory.mockResolvedValue(rows([]))
    getNameDetail.mockReset()
    getNameDetail.mockResolvedValue(null)
  })

  it("checks a restore against the name's current registration", async () => {
    getNameHistory.mockResolvedValue({
      ...rows([]),
      data: [link(undefined, 'a'), link(V2_REGISTRY, 'a')],
    })
    getNameDetail.mockResolvedValue({ registrationId: 'a' })

    const result = await getSubregistryHistory({ name: 'Test.eth' })

    expect(result._unsafeUnwrap()?.isRestorable).toBe(true)
    expect(getNameDetail).toHaveBeenCalledWith({ name: 'test.eth' })
  })

  it('fails rather than guessing when the current registration cannot be read', async () => {
    getNameDetail.mockRejectedValue(new Error('bigname down'))

    expect((await getSubregistryHistory({ name: 'test.eth' })).isErr()).toBe(
      true,
    )
  })

  it('reads the subregistry rows of the normalized name', async () => {
    const result = await getSubregistryHistory({ name: 'Test.eth' })

    expect(result._unsafeUnwrap()).toEqual({
      linkCount: 0,
      previousRegistry: undefined,
      isRestorable: false,
    })
    expect(getNameHistory).toHaveBeenCalledWith('test.eth', {
      namespace: 'ens',
      type: ['subregistry'],
      include: ['data'],
      page_size: 50,
    })
  })

  it('counts ENSv2 links but not ENSv1 NewOwner rows', async () => {
    getNameHistory.mockResolvedValue(rows([V1_REGISTRY, V2_REGISTRY]))
    expect(await linkCount()).toBe(1)

    getNameHistory.mockResolvedValue(rows([V1_REGISTRY]))
    expect(await linkCount()).toBe(0)
  })

  // longwave.eth: three 2017 NewOwner rows read as a detached registry.
  it('does not count NewOwner rows from the registry the legacy one replaced', async () => {
    getNameHistory.mockResolvedValue(rows([V1_ORIGINAL_REGISTRY]))
    expect(await linkCount()).toBe(0)
  })

  // `ensRegistry` is the ENSv2 .eth registry, which emits every 2LD's links.
  it('counts links the .eth registry emitted', async () => {
    getNameHistory.mockResolvedValue(rows([ETH_REGISTRY]))
    expect(await linkCount()).toBe(1)
  })

  it('counts a row with no emitting contract rather than reading it as none', async () => {
    getNameHistory.mockResolvedValue(rows([null]))
    expect(await linkCount()).toBe(1)
  })

  it('answers unknown when the window held only ENSv1 rows and more remain', async () => {
    getNameHistory.mockResolvedValue(rows([V1_REGISTRY], true))
    expect(
      (await getSubregistryHistory({ name: 'test.eth' }))._unsafeUnwrap(),
    ).toBeNull()
  })

  // A zero count here would read as never-configured and offer the configure
  // form — so a name with no canonical node must come back unknown, unasked.
  it('answers unknown, without querying, for a name that does not normalize', async () => {
    const result = await getSubregistryHistory({ name: 'te‍st.eth' })

    expect(result._unsafeUnwrap()).toBeNull()
    expect(getNameHistory).not.toHaveBeenCalled()
  })
})

describe('readSubregistryHistory', () => {
  it('names the registry the newest link pointed at, past a later clear', () => {
    expect(
      readSubregistryHistory({
        rows: [
          link(),
          link(V2_REGISTRY),
          link('0x1111111111111111111111111111111111111111'),
        ],
        hasMore: false,
        v1Registries: new Set(),
        currentRegistrationId: null,
      }),
    ).toEqual({
      linkCount: 3,
      previousRegistry: V2_REGISTRY,
      isRestorable: false,
    })
  })

  it.each([
    {
      case: 'a clear of that link, in the current registration',
      rows: [link(undefined, 'a'), link(V2_REGISTRY, 'a')],
      currentRegistrationId: 'a',
      isRestorable: true,
    },
    {
      // An expiry's clear is filed under the lapsed registration, and the
      // re-registration that follows emits no subregistry row.
      case: 'a clear in a registration the name was registered again since',
      rows: [link(undefined, 'a'), link(V2_REGISTRY, 'a')],
      currentRegistrationId: 'b',
      isRestorable: false,
    },
    {
      case: 'a clear made in a later registration',
      rows: [link(undefined, 'b'), link(V2_REGISTRY, 'a')],
      currentRegistrationId: 'b',
      isRestorable: false,
    },
    {
      case: 'a link with no clear after it',
      rows: [link(V2_REGISTRY, 'a')],
      currentRegistrationId: 'a',
      isRestorable: false,
    },
    {
      case: 'rows with no registration',
      rows: [link(), link(V2_REGISTRY)],
      currentRegistrationId: null,
      isRestorable: false,
    },
  ])(
    '$case: restorable $isRestorable',
    ({ rows, currentRegistrationId, isRestorable }) => {
      expect(
        readSubregistryHistory({
          rows,
          hasMore: false,
          v1Registries: new Set(),
          currentRegistrationId,
        })?.isRestorable,
      ).toBe(isRestorable)
    },
  )
})
