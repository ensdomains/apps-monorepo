import { BignameError, type EventRow } from '@ens-apps/indexer/bigname'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok, ResultAsync } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { mockEventRootPermissionChanged } from '@/test-utils/bigname/bigname.mock'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ROOT_RESOURCE_HEX = `0x${'0'.repeat(64)}`
const listEvents = vi.fn()
const mockGetLogs = vi.fn()
const mockGetBlockTimestamps = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    events: (...args: unknown[]) =>
      ResultAsync.fromPromise(listEvents(...args), (e) => e),
  },
}))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))
vi.mock('@/features/profile/hooks/useBlockTimestamps', () => ({
  getBlockTimestamps: (params: { blocks: readonly bigint[] }) =>
    mockGetBlockTimestamps(params),
}))
const { getRegistryRoleHistoryForAccount } = await import(
  './useRegistryRoleHistoryForAccount'
)

const ROOT_REGISTRY = getAddress(
  mockEventRootPermissionChanged.contract_address,
)
const ROOT_ACCOUNT = getAddress(mockEventRootPermissionChanged.data.address)

const page = (data: EventRow[]) => ({
  data,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 200,
    total_count: null,
    has_more: false,
  },
  meta: {},
})

const runRoot = () =>
  getRegistryRoleHistoryForAccount({
    registryAddress: ROOT_REGISTRY,
    account: ROOT_ACCOUNT,
  })

describe('getRegistryRoleHistoryForAccount where bigname serves root role changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLogs.mockResolvedValue([])
    mockGetBlockTimestamps.mockReturnValue(ok(new Map()))
    listEvents.mockResolvedValue(page([mockEventRootPermissionChanged]))
  })

  it('asks bigname for this account’s root role changes on this registry, newest first', async () => {
    await runRoot()

    expect(listEvents).toHaveBeenCalledTimes(1)
    expect(listEvents).toHaveBeenCalledWith(
      {
        contract_address: ROOT_REGISTRY.toLowerCase(),
        address: ROOT_ACCOUNT.toLowerCase(),
        kind: ['RootPermissionChanged'],
        include: ['data', 'raw'],
        order: 'desc',
        page_size: 200,
      },
      expect.anything(),
    )
  })

  it('reads the before and after sets and the date from the row, with no node read', async () => {
    const entries = (await runRoot())._unsafeUnwrap()

    expect(mockGetLogs).not.toHaveBeenCalled()
    expect(entries).toEqual([
      {
        account: ROOT_ACCOUNT,
        resource: ROOT_RESOURCE_HEX,
        oldRoles: ['ROLE_REGISTRAR', 'ROLE_REGISTRAR_ADMIN'],
        newRoles: ['ROLE_REGISTRAR'],
        transactionHash: mockEventRootPermissionChanged.transaction_hash,
        timestamp: 1790840952n,
        blockNumber: 11820431n,
      },
    ])
  })

  it('lists a change that left the account nothing', async () => {
    listEvents.mockResolvedValue(
      page([
        {
          ...mockEventRootPermissionChanged,
          data: {
            ...mockEventRootPermissionChanged.data,
            powers: [],
            added_powers: [],
            removed_powers: ['registrar'],
          },
        },
      ]),
    )

    const [entry] = (await runRoot())._unsafeUnwrap()

    expect(entry?.oldRoles).toEqual(['ROLE_REGISTRAR'])
    expect(entry?.newRoles).toEqual([])
  })

  it('leaves out rows that are not a root change of this account on this registry', async () => {
    const { data } = mockEventRootPermissionChanged
    listEvents.mockResolvedValue(
      page([
        { ...mockEventRootPermissionChanged, contract_address: REGISTRY },
        {
          ...mockEventRootPermissionChanged,
          data: { ...data, address: ACCOUNT },
        },
        {
          ...mockEventRootPermissionChanged,
          kind: 'PermissionChanged',
          data: { ...data, grant_scope: { kind: 'registry', detail: {} } },
        },
      ]),
    )

    expect((await runRoot())._unsafeUnwrap()).toEqual([])
  })

  it.each([
    [400, 'invalid_input'],
    [409, 'stale'],
    [429, 'rate_limited'],
    [500, 'internal_error'],
    [503, 'overloaded'],
  ] as const)(
    'falls back to the node when bigname answers %i',
    async (status, code) => {
      listEvents.mockRejectedValue(
        new BignameError({ status, code, message: code }),
      )

      const result = await runRoot()

      expect(result.isOk()).toBe(true)
      expect(mockGetLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          address: ROOT_REGISTRY,
          event: eacRolesChangedEventSnippet[0],
          args: { resource: 0n, account: ROOT_ACCOUNT },
          fromBlock: ROLES_FROM_BLOCK,
          strict: true,
        }),
      )
    },
  )

  it('converts the node logs into dated history entries', async () => {
    listEvents.mockRejectedValue(
      new BignameError({ status: 503, code: 'overloaded', message: 'down' }),
    )
    const transactionHash = `0x${'b'.repeat(64)}`
    mockGetLogs.mockResolvedValue([
      {
        args: {
          resource: 0n,
          account: ROOT_ACCOUNT,
          oldRoleBitmap:
            registryRoles.ROLE_REGISTRAR | registryRoles.ROLE_REGISTRAR_ADMIN,
          newRoleBitmap: registryRoles.ROLE_REGISTRAR,
        },
        blockNumber: 11_820_431n,
        transactionHash,
      },
    ])
    mockGetBlockTimestamps.mockReturnValue(
      ok(new Map([[11_820_431n, 1_790_840_952n]])),
    )

    expect((await runRoot())._unsafeUnwrap()).toEqual([
      {
        account: ROOT_ACCOUNT,
        resource: ROOT_RESOURCE_HEX,
        oldRoles: ['ROLE_REGISTRAR', 'ROLE_REGISTRAR_ADMIN'],
        newRoles: ['ROLE_REGISTRAR'],
        transactionHash,
        timestamp: 1_790_840_952n,
        blockNumber: 11_820_431n,
      },
    ])
  })

  it('does not start a node read for a cancelled query', async () => {
    listEvents.mockRejectedValue(
      new BignameError({ status: 409, code: 'stale', message: 'stale' }),
    )
    const controller = new AbortController()
    controller.abort()

    const result = await getRegistryRoleHistoryForAccount(
      { registryAddress: ROOT_REGISTRY, account: ROOT_ACCOUNT },
      controller.signal,
    )

    expect(result.isErr()).toBe(true)
    expect(mockGetLogs).not.toHaveBeenCalled()
  })
})
