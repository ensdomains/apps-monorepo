import type { EventRow } from '@ens-apps/bigname'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const getName = vi.fn()
const listEvents = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { getName, listEvents } }))

const { getRoleHistory } = await import('./useRoleHistory')

const row = (
  block: number,
  data: Record<string, unknown>,
  account = ACCOUNT,
): EventRow =>
  ({
    id: `row-${block}`,
    type: 'permission',
    kind: 'PermissionChanged',
    name: 'test.chakri.eth',
    namespace: 'ens',
    registration_id: 'reg-current',
    block_number: block,
    timestamp: String(1_790_000_000 + block),
    transaction_hash: `0x${block.toString(16).padStart(64, '0')}`,
    log_index: 0,
    contract_address: REGISTRY.toLowerCase(),
    data: {
      address: account,
      grant_scope: { kind: 'registry', detail: {} },
      ...data,
    },
  }) as EventRow

const page = (data: EventRow[]) => ({
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

const run = (account?: Address) =>
  getRoleHistory({
    name: 'test.chakri.eth',
    registryAddress: REGISTRY,
    account,
  })

describe('getRoleHistory', () => {
  beforeEach(() => {
    getName.mockReset()
    getName.mockResolvedValue({
      data: { status: 'ok', registration_id: 'reg-current' },
    })
    listEvents.mockReset()
    listEvents.mockResolvedValue(
      page([
        row(10, {
          powers: ['set_resolver'],
          added_powers: ['set_resolver'],
          removed_powers: [],
        }),
        row(11, { powers: ['renew'] }, OTHER),
        row(12, {
          powers: ['renew'],
          added_powers: ['renew'],
          removed_powers: ['set_resolver'],
        }),
      ]),
    )
  })

  it('reads the changes newest first, before and after sets from bigname’s diff', async () => {
    const entries = (await run())._unsafeUnwrap()
    expect(entries.map((entry) => entry.blockNumber)).toEqual([12n, 11n, 10n])
    expect(entries[0]).toEqual({
      account: getAddress(ACCOUNT),
      oldRoles: ['ROLE_SET_RESOLVER'],
      newRoles: ['ROLE_RENEW'],
      transactionHash: `0x${(12).toString(16).padStart(64, '0')}`,
      timestamp: 1_790_000_012n,
      blockNumber: 12n,
    })
  })

  it('takes the previous set from the account’s last row when a row states no diff', async () => {
    listEvents.mockResolvedValue(
      page([
        row(10, { powers: ['set_resolver'] }),
        row(12, { powers: ['set_resolver', 'renew'] }),
      ]),
    )
    const [latest, first] = (await run())._unsafeUnwrap()
    expect(first?.oldRoles).toEqual([])
    expect(latest?.oldRoles).toEqual(['ROLE_SET_RESOLVER'])
  })

  it('narrows to one account when asked', async () => {
    const entries = (await run(getAddress(OTHER)))._unsafeUnwrap()
    expect(entries.map((entry) => entry.blockNumber)).toEqual([11n])
  })
})
