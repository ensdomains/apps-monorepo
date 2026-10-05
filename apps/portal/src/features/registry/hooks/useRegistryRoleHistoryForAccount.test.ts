import { BignameError, type EventRow } from '@ens-apps/bigname'
import {
  mockEventRootPermissionChanged,
  mockPermissionsRegistryRoot,
} from '@ens-apps/bigname/postV041.mock'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok, okAsync } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { queryClient } from '@/utils/queryClient'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const ROOT_RESOURCE_HEX = `0x${'0'.repeat(64)}`

const listPermissions = vi.fn()
const listEvents = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { listPermissions, listEvents } }))

/** What v0.4.1 answers for `registry=`: the signal that it serves no root rows. */
const unknownRegistryParam = () =>
  new BignameError({
    status: 400,
    code: 'invalid_input',
    message: 'unknown query parameter: registry',
  })

const mockGetLogs = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

const mockGetBlockTimestamps = vi.fn()

vi.mock('@/features/profile/hooks/useBlockTimestamps', () => ({
  getBlockTimestamps: (params: { blocks: bigint[] }) =>
    mockGetBlockTimestamps(params),
}))

const { getRegistryRoleHistoryForAccount } = await import(
  './useRegistryRoleHistoryForAccount'
)

const log = ({
  block,
  oldRoleBitmap = 0n,
  newRoleBitmap = registryRoles.ROLE_RENEW,
}: {
  block: bigint
  oldRoleBitmap?: bigint
  newRoleBitmap?: bigint
}) => ({
  address: REGISTRY,
  blockNumber: block,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  args: { resource: 0n, account: ACCOUNT, oldRoleBitmap, newRoleBitmap },
})

const run = () =>
  getRegistryRoleHistoryForAccount({
    registryAddress: REGISTRY,
    account: ACCOUNT,
  })

describe('getRegistryRoleHistoryForAccount against bigname v0.4.1', () => {
  beforeEach(() => {
    queryClient.clear()
    listPermissions.mockReset()
    listPermissions.mockRejectedValue(unknownRegistryParam())
    listEvents.mockReset()
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
    mockGetBlockTimestamps.mockReset()
    mockGetBlockTimestamps.mockReturnValue(okAsync(new Map<bigint, bigint>()))
  })

  it('asks the node for this account at the root resource only', async () => {
    await run()

    expect(listEvents).not.toHaveBeenCalled()

    expect(mockGetLogs).toHaveBeenCalledWith({
      address: REGISTRY,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: 0n, account: ACCOUNT },
      fromBlock: ROLES_FROM_BLOCK,
      strict: true,
    })
  })

  it('finds a grant older than the previous 1000-event window', async () => {
    mockGetLogs.mockResolvedValue([log({ block: 11_390_385n })])
    mockGetBlockTimestamps.mockReturnValue(
      okAsync(new Map([[11_390_385n, 1753920000n]])),
    )

    const entries = (await run())._unsafeUnwrap()

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      account: ACCOUNT,
      blockNumber: 11_390_385n,
      timestamp: 1753920000n,
    })
  })

  it('decodes both bitmaps into role names', async () => {
    mockGetLogs.mockResolvedValue([
      log({
        block: 10n,
        oldRoleBitmap: registryRoles.ROLE_RENEW,
        newRoleBitmap: registryRoles.ROLE_RENEW | registryRoles.ROLE_UNREGISTER,
      }),
    ])
    mockGetBlockTimestamps.mockReturnValue(okAsync(new Map([[10n, 120n]])))

    const entries = (await run())._unsafeUnwrap()

    expect(entries[0]?.oldRoles).toEqual(['ROLE_RENEW'])
    expect(entries[0]?.newRoles).toEqual(
      expect.arrayContaining(['ROLE_RENEW', 'ROLE_UNREGISTER']),
    )
    expect(entries[0]?.newRoles).toHaveLength(2)
  })

  it('backfills block times for every block it saw', async () => {
    mockGetLogs.mockResolvedValue([
      log({ block: 10n }),
      log({ block: 20n }),
      log({ block: 10n }),
    ])
    mockGetBlockTimestamps.mockReturnValue(
      okAsync(
        new Map([
          [10n, 120n],
          [20n, 240n],
        ]),
      ),
    )

    const entries = (await run())._unsafeUnwrap()

    expect(mockGetBlockTimestamps).toHaveBeenCalledWith({
      blocks: [10n, 20n, 10n],
    })
    expect(entries.map((entry) => entry.timestamp)).toEqual([240n, 120n, 120n])
  })

  it('errors rather than dating an entry 1970 when a block time is missing', async () => {
    mockGetLogs.mockResolvedValue([log({ block: 10n })])

    const result = await run()

    expect(result.isErr()).toBe(true)
  })

  it('returns the newest change first', async () => {
    mockGetLogs.mockResolvedValue([
      log({ block: 10n }),
      log({ block: 30n }),
      log({ block: 20n }),
    ])
    mockGetBlockTimestamps.mockReturnValue(
      okAsync(
        new Map([
          [10n, 120n],
          [20n, 240n],
          [30n, 360n],
        ]),
      ),
    )

    const entries = (await run())._unsafeUnwrap()

    expect(entries.map((entry) => entry.blockNumber)).toEqual([30n, 20n, 10n])
  })

  it('records the resource as padded hex, as the other producers do', async () => {
    mockGetLogs.mockResolvedValue([log({ block: 10n })])
    mockGetBlockTimestamps.mockReturnValue(okAsync(new Map([[10n, 120n]])))

    const entries = (await run())._unsafeUnwrap()

    expect(entries[0]?.resource).toBe(ROOT_RESOURCE_HEX)
  })

  it('surfaces a node failure as an error result', async () => {
    mockGetLogs.mockRejectedValue(new Error('query returns too many logs'))

    const result = await run()

    expect(result.isErr()).toBe(true)
  })
})

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
    queryClient.clear()
    listPermissions.mockReset()
    listPermissions.mockResolvedValue(mockPermissionsRegistryRoot)
    listEvents.mockReset()
    listEvents.mockResolvedValue(page([mockEventRootPermissionChanged]))
    mockGetLogs.mockReset()
    mockGetBlockTimestamps.mockReset()
  })

  it('asks bigname for this account’s root role changes on this registry, newest first', async () => {
    await runRoot()

    expect(listEvents).toHaveBeenCalledWith({
      contract_address: ROOT_REGISTRY.toLowerCase(),
      address: ROOT_ACCOUNT.toLowerCase(),
      kind: 'RootPermissionChanged',
      include: ['data', 'raw'],
      order: 'desc',
      page_size: 200,
      cursor: undefined,
    })
  })

  it('reads the before and after sets and the date from the row, with no node read', async () => {
    const entries = (await runRoot())._unsafeUnwrap()

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
    expect(mockGetLogs).not.toHaveBeenCalled()
    expect(mockGetBlockTimestamps).not.toHaveBeenCalled()
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

  it('errors rather than falling back when the history read fails', async () => {
    listEvents.mockRejectedValue(
      new BignameError({
        status: 400,
        code: 'invalid_input',
        message: 'kind is invalid',
      }),
    )

    const result = await runRoot()

    expect(result.isErr()).toBe(true)
    expect(mockGetLogs).not.toHaveBeenCalled()
  })
})

describe('getRegistryRoleHistoryForAccount when bigname cannot say what it serves', () => {
  it('errors rather than falling back', async () => {
    queryClient.clear()
    listPermissions.mockReset()
    listPermissions.mockRejectedValue(
      new BignameError({
        status: 503,
        code: 'overloaded',
        message: 'overloaded',
      }),
    )
    listEvents.mockReset()
    mockGetLogs.mockReset()

    const result = await runRoot()

    expect(result.isErr()).toBe(true)
    expect(listEvents).not.toHaveBeenCalled()
    expect(mockGetLogs).not.toHaveBeenCalled()
  })
})
