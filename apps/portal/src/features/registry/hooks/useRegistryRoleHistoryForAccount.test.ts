import { BignameError, type EventRow } from '@ens-apps/indexer/bigname'
import { ResultAsync } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockEventRootPermissionChanged } from '@/test-utils/bigname/bigname.mock'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ROOT_RESOURCE_HEX = `0x${'0'.repeat(64)}`
const listPermissions = vi.fn()
const listEvents = vi.fn()
vi.mock('@/lib/bigname', () => ({
  bigname: {
    permissions: (...args: unknown[]) =>
      ResultAsync.fromPromise(listPermissions(...args), (e) => e),
    events: (...args: unknown[]) =>
      ResultAsync.fromPromise(listEvents(...args), (e) => e),
  },
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
    listPermissions.mockReset()
    listEvents.mockReset()
    listEvents.mockResolvedValue(page([mockEventRootPermissionChanged]))
  })

  it('asks bigname for this account’s root role changes on this registry, newest first', async () => {
    await runRoot()

    expect(listEvents).toHaveBeenCalledTimes(1)
    expect(listPermissions).not.toHaveBeenCalled()
    expect(listEvents).toHaveBeenCalledWith({
      contract_address: ROOT_REGISTRY.toLowerCase(),
      address: ROOT_ACCOUNT.toLowerCase(),
      kind: ['RootPermissionChanged'],
      include: ['data', 'raw'],
      order: 'desc',
      page_size: 200,
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
  })
})
