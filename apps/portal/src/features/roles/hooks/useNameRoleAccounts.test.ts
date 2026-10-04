import type { EventRow } from '@ens-apps/bigname'
import { type Address, getAddress, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const OTHER_REGISTRY: Address = '0x2222222222222222222222222222222222222222'
const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const getName = vi.fn()
const listEvents = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { getName, listEvents } }))

const { getNameRolesAccounts } = await import('./useNameRoleAccounts')

let block = 0
const change = (
  over: Partial<{
    account: string
    powers: string[]
    added: string[]
    removed: string[]
    scope: 'registry' | 'resolver' | 'registration'
    contract: string
  }> = {},
): EventRow =>
  ({
    id: `row-${++block}`,
    type: 'permission',
    kind: 'PermissionChanged',
    name: 'test.eth',
    namespace: 'ens',
    registration_id: 'reg-current',
    block_number: block,
    timestamp: String(1_790_000_000 + block),
    transaction_hash: `0x${block.toString(16).padStart(64, '0')}`,
    log_index: 0,
    contract_address: (over.contract ?? REGISTRY).toLowerCase(),
    data: {
      address: over.account ?? OWNER,
      grant_scope: { kind: over.scope ?? 'registry', detail: {} },
      powers: over.powers ?? ['set_resolver'],
      ...(over.added && { added_powers: over.added }),
      ...(over.removed && { removed_powers: over.removed }),
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

const run = () =>
  getNameRolesAccounts({ name: 'Test.eth', registryAddress: REGISTRY })

describe('getNameRolesAccounts', () => {
  beforeEach(() => {
    block = 0
    getName.mockReset()
    getName.mockResolvedValue({
      data: { status: 'ok', name: 'test.eth', registration_id: 'reg-current' },
    })
    listEvents.mockReset()
    listEvents.mockResolvedValue(page([]))
  })

  it('reads the current registration’s permission history from bigname', async () => {
    await run()
    expect(getName).toHaveBeenCalledWith('test.eth')
    expect(listEvents).toHaveBeenCalledWith({
      registration_id: 'reg-current',
      type: 'permission',
      include: ['data', 'raw'],
      order: 'asc',
      page_size: 200,
      cursor: undefined,
    })
  })

  it('keeps the latest set per account, as ensjs roles', async () => {
    listEvents.mockResolvedValue(
      page([
        change({ powers: ['set_resolver'] }),
        change({ account: OTHER, powers: ['renew'] }),
        change({ powers: ['set_resolver', 'admin_set_resolver'] }),
      ]),
    )
    const result = (await run())._unsafeUnwrap()
    expect(Object.fromEntries(result)).toEqual({
      [getAddress(OWNER)]: ['ROLE_SET_RESOLVER', 'ROLE_SET_RESOLVER_ADMIN'],
      [getAddress(OTHER)]: ['ROLE_RENEW'],
    })
  })

  it('drops an account whose roles were revoked, and the zero address', async () => {
    listEvents.mockResolvedValue(
      page([
        change({ account: OTHER, powers: ['renew'] }),
        change({ account: OTHER, powers: [], removed: ['renew'], added: [] }),
        change({ account: zeroAddress, powers: ['renew'] }),
      ]),
    )
    expect((await run())._unsafeUnwrap().size).toBe(0)
  })

  it('ignores resolver and ENSv1 scopes and other contracts', async () => {
    listEvents.mockResolvedValue(
      page([
        change({ scope: 'resolver', powers: ['set_addr'] }),
        change({ scope: 'registration', powers: ['registration_control'] }),
        change({ contract: OTHER_REGISTRY, powers: ['renew'] }),
      ]),
    )
    expect((await run())._unsafeUnwrap().size).toBe(0)
  })

  it('has no roles for a name with no current registration', async () => {
    getName.mockResolvedValue(null)
    expect((await run())._unsafeUnwrap().size).toBe(0)
    expect(listEvents).not.toHaveBeenCalled()
  })

  it('surfaces a bigname failure as an error result', async () => {
    listEvents.mockRejectedValue(new Error('overloaded'))
    expect((await run()).isErr()).toBe(true)
  })
})
