import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const OWNER: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

// A resource carrying a non-zero eacVersionId, i.e. a re-registered name. The
// indexer stores these with the low 32 bits zeroed; logs carry them verbatim.
const RESOURCE = 0xabcd_0000_0007n

const mockGetLogs = vi.fn()
const mockGetResource = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getResource: (...args: unknown[]) => mockGetResource(...args),
}))

const { getNameRolesAccounts } = await import('./useNameRoleAccounts')

const log = ({
  block,
  account = OWNER,
  newRoleBitmap = registryRoles.ROLE_SET_RESOLVER,
}: {
  block: bigint
  account?: Address
  newRoleBitmap?: bigint
}) => ({
  blockNumber: block,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  args: { resource: RESOURCE, account, oldRoleBitmap: 0n, newRoleBitmap },
})

const run = (name = 'test.chakri.eth') =>
  getNameRolesAccounts({ name, registryAddress: REGISTRY })

describe('getNameRolesAccounts', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
    mockGetResource.mockReset()
    mockGetResource.mockResolvedValue(RESOURCE)
  })

  it('pins the resource the registry reports, version bits included', async () => {
    await run()

    expect(mockGetResource).toHaveBeenCalledWith(expect.anything(), {
      label: 'test',
      registryAddress: REGISTRY,
    })
    expect(mockGetLogs).toHaveBeenCalledWith({
      address: REGISTRY,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: RESOURCE, account: undefined },
      fromBlock: ROLES_FROM_BLOCK,
      strict: true,
    })
  })

  it('derives the label from the normalized name', async () => {
    await run('TEST.chakri.eth')

    expect(mockGetResource).toHaveBeenCalledWith(expect.anything(), {
      label: 'test',
      registryAddress: REGISTRY,
    })
  })

  it('fails rather than guessing when the name will not normalize', async () => {
    const result = await run('in..valid.eth')

    expect(result.isErr()).toBe(true)
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('keeps the latest bitmap per account', async () => {
    mockGetLogs.mockResolvedValue([
      log({ block: 10n, newRoleBitmap: registryRoles.ROLE_SET_RESOLVER }),
      log({ block: 20n, newRoleBitmap: registryRoles.ROLE_UNREGISTER }),
    ])

    const roles = (await run())._unsafeUnwrap()

    expect(roles.get(OWNER)).toEqual(['ROLE_UNREGISTER'])
  })

  it('drops an account whose roles were revoked', async () => {
    mockGetLogs.mockResolvedValue([
      log({ block: 10n }),
      log({ block: 20n, account: OTHER }),
      log({ block: 30n, newRoleBitmap: 0n }),
    ])

    const roles = (await run())._unsafeUnwrap()

    expect(roles.has(OWNER)).toBe(false)
    expect(roles.get(OTHER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  it('ignores the zero address', async () => {
    mockGetLogs.mockResolvedValue([log({ block: 10n, account: zeroAddress })])

    const roles = (await run())._unsafeUnwrap()

    expect(roles.size).toBe(0)
  })

  it('surfaces a node failure as an error result', async () => {
    mockGetLogs.mockRejectedValue(new Error('query returns too many logs'))

    const result = await run()

    expect(result.isErr()).toBe(true)
  })
})
