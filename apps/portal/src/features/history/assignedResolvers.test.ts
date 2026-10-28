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

const { dropUnassignedRecords, isAssignedRecord, toResolverTimeline } =
  await import('./assignedResolvers')

const V1_REGISTRY: Address = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e'
const V2_REGISTRY: Address = '0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85'
const PUBLIC_RESOLVER: Address = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd'
const OTHER_RESOLVER: Address = '0xe99638b40e4fff0129d56f03b55b6bbc4bbe49b5'
const FORGER: Address = '0xd04773f7dfecc572a12f492e37942bfb03eb624a'

const base = {
  id: 'a'.repeat(64),
  name: 'alice.eth',
  namespace: 'ens',
  registration_id: null,
  timestamp: '1700000000',
  transaction_hash: '0xabc',
} as const

const pointedAt = (
  resolver: Address | null,
  block: number,
  logIndex = 0,
  registry: Address = V1_REGISTRY,
): NameHistoryRow => ({
  ...base,
  type: 'resolver',
  block_number: block,
  log_index: logIndex,
  contract_address: registry,
  data: {
    action: 'resolver_changed',
    ...(resolver && { resolver: { chain_id: 11155111, address: resolver } }),
  },
})

const recordFrom = (
  resolver: Address,
  block: number | null,
  logIndex = 0,
  name = 'alice.eth',
): NameHistoryRow => ({
  ...base,
  name,
  type: 'record',
  block_number: block,
  log_index: logIndex,
  contract_address: resolver,
  data: {
    action: 'record_changed',
    key: 'addr:60',
    resolver: { chain_id: 11155111, address: resolver },
  },
})

const isKept = (
  record: NameHistoryRow,
  assignments: readonly NameHistoryRow[],
) => isAssignedRecord(record, toResolverTimeline(assignments))

describe('isAssignedRecord', () => {
  const assigned = [pointedAt(PUBLIC_RESOLVER, 10)]

  it('drops a write from a contract the registry never pointed the name at', () => {
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 11), assigned)).toBe(true)
    expect(isKept(recordFrom(FORGER, 20), assigned)).toBe(false)
  })

  it('drops a write from before the resolver was assigned', () => {
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 9), assigned)).toBe(false)
  })

  it('orders by log index inside the assigning block', () => {
    const inBlock = [pointedAt(PUBLIC_RESOLVER, 10, 5)]
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 10, 6), inBlock)).toBe(true)
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 10, 4), inBlock)).toBe(false)
  })

  it('drops writes on a resolver the name has moved off', () => {
    const moved = [
      pointedAt(PUBLIC_RESOLVER, 10),
      pointedAt(OTHER_RESOLVER, 30),
    ]
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 20), moved)).toBe(true)
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 40), moved)).toBe(false)
    expect(isKept(recordFrom(OTHER_RESOLVER, 40), moved)).toBe(true)
  })

  it('drops writes after the resolver was unset', () => {
    const unset = [pointedAt(PUBLIC_RESOLVER, 10), pointedAt(null, 20)]
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 25), unset)).toBe(false)
  })

  it('keeps the assignment of each registry, as across a migration', () => {
    const migrated = [
      pointedAt(PUBLIC_RESOLVER, 10),
      pointedAt(OTHER_RESOLVER, 30, 0, V2_REGISTRY),
    ]
    expect(isKept(recordFrom(OTHER_RESOLVER, 40), migrated)).toBe(true)
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 40), migrated)).toBe(true)
    expect(isKept(recordFrom(FORGER, 40), migrated)).toBe(false)
  })

  it('takes a resolver from a registration that names one', () => {
    const registered: NameHistoryRow = {
      ...base,
      type: 'registration',
      block_number: 10,
      log_index: 0,
      contract_address: V2_REGISTRY,
      data: {
        action: 'registration_granted',
        resolver: { chain_id: 11155111, address: PUBLIC_RESOLVER },
      },
    }
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 11), [registered])).toBe(true)
  })

  it('compares addresses case-insensitively', () => {
    const mixed = [
      pointedAt(
        PUBLIC_RESOLVER.toUpperCase().replace('0X', '0x') as Address,
        10,
      ),
    ]
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 11), mixed)).toBe(true)
  })

  it('drops every write on a name that never had a resolver', () => {
    expect(isKept(recordFrom(PUBLIC_RESOLVER, 11), [])).toBe(false)
  })

  it('drops a write it cannot place on chain', () => {
    expect(isKept(recordFrom(PUBLIC_RESOLVER, null), assigned)).toBe(false)
  })

  it('keeps every row that is not a record write', () => {
    expect(isKept(pointedAt(FORGER, 5), [])).toBe(true)
  })
})

describe('dropUnassignedRecords', () => {
  beforeEach(() => {
    getNameHistory.mockReset()
    getNameHistory.mockResolvedValue({
      data: [pointedAt(PUBLIC_RESOLVER, 10)],
      page: {
        cursor: null,
        next_cursor: null,
        page_size: 200,
        has_more: false,
      },
      meta: { as_of: {} },
    })
  })

  it("hides a forged address and url from the name's history", async () => {
    const real = recordFrom(PUBLIC_RESOLVER, 11)
    const forged = recordFrom(FORGER, 20)
    const transfer: NameHistoryRow = {
      ...pointedAt(null, 21),
      type: 'transfer',
      data: { action: 'token_transferred' },
    }

    const result = await dropUnassignedRecords([forged, transfer, real])

    expect(result._unsafeUnwrap()).toEqual([transfer, real])
    expect(getNameHistory).toHaveBeenCalledOnce()
    expect(getNameHistory).toHaveBeenCalledWith(
      'alice.eth',
      {
        namespace: 'ens',
        type: ['resolver', 'registration'],
        include: ['data'],
        order: 'asc',
        page_size: 200,
      },
      expect.anything(),
    )
  })

  it('reads one timeline per name with a record write', async () => {
    await dropUnassignedRecords([
      recordFrom(PUBLIC_RESOLVER, 11),
      recordFrom(PUBLIC_RESOLVER, 12),
      recordFrom(PUBLIC_RESOLVER, 13, 0, 'bob.eth'),
    ])

    expect(getNameHistory.mock.calls.map(([name]) => name)).toEqual([
      'alice.eth',
      'bob.eth',
    ])
  })

  it('reads nothing for a page with no record writes', async () => {
    const rows = [pointedAt(PUBLIC_RESOLVER, 10)]

    expect((await dropUnassignedRecords(rows))._unsafeUnwrap()).toEqual(rows)
    expect(getNameHistory).not.toHaveBeenCalled()
  })

  it('fails when the timeline cannot be read', async () => {
    getNameHistory.mockRejectedValue(new Error('down'))

    const result = await dropUnassignedRecords([
      recordFrom(PUBLIC_RESOLVER, 11),
    ])

    expect(result.isErr()).toBe(true)
  })
})
