import { BignameError, type EventRow } from '@ens-apps/indexer/bigname'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { errAsync, ok, okAsync } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from './rolesFromBlock'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FROM_BLOCK = 9_782_822n
const NAME = 'alice.eth'
const REGISTRATION = 'registration-1'

const mockGetLogs = vi.fn()
const mockGetBlockTimestamps = vi.fn()
const mockName = vi.fn()
const mockEvents = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

vi.mock('@/features/profile/hooks/useBlockTimestamps', () => ({
  getBlockTimestamps: (params: { blocks: readonly bigint[] }) =>
    mockGetBlockTimestamps(params),
}))

vi.mock('@/lib/bigname', () => ({
  bigname: {
    name: (...args: unknown[]) => mockName(...args),
    events: (...args: unknown[]) => mockEvents(...args),
  },
}))

const {
  getRoleChangeLogs,
  INDEXED_ROLE_EVENTS_MAX_ROWS,
  INDEXED_ROLE_EVENTS_TIMEOUT_MS,
  ROOT_RESOURCE,
  toRoleHistoryEntries,
} = await import('./roleChangeLogs')

const row = ({
  block,
  account = ACCOUNT,
  powers = ['renew'],
  added,
  removed,
  contract = REGISTRY,
  scope = 'registry',
}: {
  readonly block: number
  readonly account?: string
  readonly powers?: readonly string[]
  readonly added?: readonly string[]
  readonly removed?: readonly string[]
  readonly contract?: string
  readonly scope?: 'registry' | 'root'
}): EventRow =>
  ({
    id: `row-${block}`,
    type: 'permission',
    name: NAME,
    namespace: 'ens',
    registration_id: REGISTRATION,
    block_number: block,
    timestamp: String(block * 12),
    transaction_hash: `0x${block.toString(16).padStart(64, '0')}`,
    log_index: 0,
    contract_address: contract,
    kind: 'EACRolesChanged',
    data: {
      address: account,
      grant_scope: { kind: scope, detail: {} },
      powers,
      ...(added && { added_powers: added }),
      ...(removed && { removed_powers: removed }),
    },
  }) as EventRow

const indexed = (rows: readonly EventRow[]) => {
  mockName.mockReturnValue(
    okAsync({
      data: { registration_id: REGISTRATION },
      meta: { as_of: {} },
    }),
  )
  mockEvents.mockReturnValue(
    okAsync({
      data: rows,
      page: {
        cursor: null,
        next_cursor: null,
        page_size: rows.length,
        total_count: null,
        has_more: false,
      },
      meta: { as_of: {} },
    }),
  )
}

const read = (
  overrides: Partial<Parameters<typeof getRoleChangeLogs>[0]> = {},
) =>
  getRoleChangeLogs({
    name: NAME,
    registryAddress: REGISTRY,
    resource: 0x1234n,
    ...overrides,
  })

describe('getRoleChangeLogs via bigname', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLogs.mockResolvedValue([])
    indexed([])
  })

  it('reads the current registration’s permission rows, oldest first', async () => {
    await read()

    expect(mockName).toHaveBeenCalledWith(NAME)
    expect(mockEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        registration_id: REGISTRATION,
        type: ['permission'],
        order: 'asc',
      }),
    )
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('states each change as the node would: roles as bitmaps, checksummed, dated', async () => {
    indexed([row({ block: 10, account: ACCOUNT.toLowerCase() })])

    const [log] = (await read())._unsafeUnwrap()

    expect(log).toEqual({
      blockNumber: 10n,
      timestamp: 120n,
      transactionHash: `0x${'a'.padStart(64, '0')}`,
      args: {
        resource: 0x1234n,
        account: getAddress(ACCOUNT),
        oldRoleBitmap: 0n,
        newRoleBitmap: registryRoles.ROLE_RENEW,
      },
    })
  })

  it('reads the set before a change from its stated diff, else the previous row', async () => {
    indexed([
      row({ block: 10, powers: ['renew'] }),
      row({ block: 11, powers: ['renew', 'set_resolver'] }),
      row({
        block: 12,
        powers: ['set_resolver'],
        added: [],
        removed: ['renew'],
      }),
    ])

    const logs = (await read())._unsafeUnwrap()

    const both = registryRoles.ROLE_RENEW | registryRoles.ROLE_SET_RESOLVER
    expect(logs.map(({ args }) => args.oldRoleBitmap)).toEqual([
      0n,
      registryRoles.ROLE_RENEW,
      both,
    ])
  })

  it('narrows to one account and leaves out other contracts and scopes', async () => {
    const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    indexed([
      row({ block: 10 }),
      row({ block: 11, account: OTHER }),
      row({ block: 12, contract: OTHER }),
      row({ block: 13, scope: 'root' }),
    ])

    const logs = (await read({ account: ACCOUNT }))._unsafeUnwrap()

    expect(logs.map((log) => log.blockNumber)).toEqual([10n])
  })

  it.each([
    [
      'bigname fails',
      () =>
        mockName.mockReturnValue(
          errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
        ),
    ],
    [
      'bigname has not indexed the name',
      () =>
        mockName.mockReturnValue(
          errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
        ),
    ],
    [
      'the history outruns the row budget',
      () =>
        indexed(
          Array.from({ length: INDEXED_ROLE_EVENTS_MAX_ROWS + 1 }, (_, i) =>
            row({ block: i + 1 }),
          ),
        ),
    ],
  ])('falls back to the node when %s', async (_, arrange) => {
    arrange()
    const logs = [{ blockNumber: 10n }]
    mockGetLogs.mockResolvedValue(logs)

    expect((await read({ resource: ROOT_RESOURCE }))._unsafeUnwrap()).toEqual(
      logs,
    )
  })

  it('falls back to the node when bigname stalls', async () => {
    vi.useFakeTimers()
    try {
      mockName.mockReturnValue(
        okAsync({ data: {}, meta: {} }).andThen(
          () => new Promise(() => {}) as never,
        ),
      )
      const logs = [{ blockNumber: 10n }]
      mockGetLogs.mockResolvedValue(logs)

      const pending = read({ resource: ROOT_RESOURCE })
      await vi.advanceTimersByTimeAsync(INDEXED_ROLE_EVENTS_TIMEOUT_MS)

      expect((await pending)._unsafeUnwrap()).toEqual(logs)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('toRoleHistoryEntries', () => {
  beforeEach(() => {
    mockGetBlockTimestamps.mockReset()
  })

  it('uses indexed timestamps without a block lookup', async () => {
    const entries = (
      await toRoleHistoryEntries({
        logs: [
          {
            blockNumber: 10n,
            timestamp: 120n,
            transactionHash: `0x${'a'.padStart(64, '0')}`,
            args: {
              resource: 0n,
              account: ACCOUNT,
              oldRoleBitmap: 0n,
              newRoleBitmap: 1n,
            },
          },
        ],
        resource: 0n,
      })
    )._unsafeUnwrap()

    expect(entries[0]?.timestamp).toBe(120n)
    expect(mockGetBlockTimestamps).not.toHaveBeenCalled()
  })
})

describe('getRoleChangeLogs', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
    // The node path is the fallback: these cases pin what it asks for.
    mockName.mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'down' })),
    )
  })

  it('pins the resource topic and the single event', async () => {
    await getRoleChangeLogs({
      name: NAME,
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
    })

    expect(mockGetLogs).toHaveBeenCalledWith({
      address: REGISTRY,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: 0n, account: undefined },
      fromBlock: FROM_BLOCK,
      strict: true,
    })
  })

  it('pins a non-root resource unchanged, version bits included', async () => {
    const resource = 0x1234_0000_0001n

    await getRoleChangeLogs({
      name: NAME,
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource,
    })

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ args: { resource, account: undefined } }),
    )
  })

  it('adds the account topic when an account is given', async () => {
    await getRoleChangeLogs({
      name: NAME,
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
      account: ACCOUNT,
    })

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ args: { resource: 0n, account: ACCOUNT } }),
    )
  })

  it('defaults to the shared scan start when no block is given', async () => {
    await getRoleChangeLogs({
      name: NAME,
      registryAddress: REGISTRY,
      resource: ROOT_RESOURCE,
    })

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: ROLES_FROM_BLOCK }),
    )
  })

  it('returns the logs the node gave back', async () => {
    const logs = [{ blockNumber: 10n }, { blockNumber: 20n }]
    mockGetLogs.mockResolvedValue(logs)

    const result = await getRoleChangeLogs({
      name: NAME,
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
    })

    expect(result._unsafeUnwrap()).toEqual(logs)
  })

  it('surfaces a rejected query as an error result', async () => {
    mockGetLogs.mockRejectedValue(
      new Error('query returns too many logs, narrow your filter: 20000'),
    )

    const result = await getRoleChangeLogs({
      name: NAME,
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
    })

    expect(result.isErr()).toBe(true)
  })
})
