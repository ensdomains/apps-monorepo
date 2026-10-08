import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok } from 'neverthrow'
import { type Address, getAddress, toHex, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from '@/lib/roles/rolesFromBlock'
import { toResourceHex } from '@/lib/roles/toResourceHex'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const OWNER = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const OTHER = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

// A resource carrying a non-zero eacVersionId, i.e. a re-registered name. Both
// the indexer and the node match it verbatim, version bits included.
const RESOURCE = 0xabcd_0000_0007n

const BLOCK = 12_000_000n

const mockGetLogs = vi.fn()
const mockGetBlockNumber = vi.fn()
const mockReadContract = vi.fn()
const mockGraphqlRequest = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok({
      chain: { id: 11155111 },
      getLogs: mockGetLogs,
      getBlockNumber: mockGetBlockNumber,
      readContract: mockReadContract,
    }),
}))

vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: (...args: unknown[]) => mockGraphqlRequest(...args),
  },
}))

const { getNameRolesAccounts } = await import('./useNameRoleAccounts')
const { INDEXED_ROLE_EVENTS_PAGE_SIZE } = await import(
  '@/lib/roles/roleChangeLogs'
)

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

const row = ({
  block,
  account = OWNER,
  newRoleBitmap = registryRoles.ROLE_SET_RESOLVER,
}: {
  block: number
  account?: Address
  newRoleBitmap?: bigint
}) => ({
  id: `0x${block.toString(16).padStart(64, '0')}-0`,
  blockNumber: block,
  timestamp: block * 12,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  asEACRolesChanged: {
    resource: toResourceHex(RESOURCE),
    account: account.toLowerCase(),
    oldRoleBitmap: '0x0',
    newRoleBitmap: toHex(newRoleBitmap),
  },
})

const SET_RESOLVER = registryRoles.ROLE_SET_RESOLVER

/** Registry state at `BLOCK`: `roleCount` and each account's `roles`. */
const onChain = (roles: Partial<Record<Address, bigint>>) =>
  mockReadContract.mockImplementation(
    ({
      functionName,
      args,
    }: {
      functionName: string
      args: [bigint, Address]
    }) =>
      Promise.resolve(
        functionName === 'roleCount'
          ? Object.values(roles).reduce((sum, b) => (sum ?? 0n) + (b ?? 0n), 0n)
          : (roles[args[1]] ?? 0n),
      ),
  )

const run = (resource: bigint | null = RESOURCE) =>
  getNameRolesAccounts({
    resource: resource as never,
    registryAddress: REGISTRY,
  })

describe('getNameRolesAccounts', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
    mockGetBlockNumber.mockReset()
    mockGetBlockNumber.mockResolvedValue(BLOCK)
    mockReadContract.mockReset()
    onChain({})
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockResolvedValue({ eacRolesChangeds: [] })
  })

  // The caller resolves the resource and hands it over, version bits included,
  // so the rows are about the same resource the writes address (WEB-1458).
  it('reads logs for the resource it was given, version bits included', async () => {
    await run()

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resource: toResourceHex(RESOURCE) }),
    )
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY,
        functionName: 'roleCount',
        args: [RESOURCE],
        blockNumber: BLOCK,
      }),
    )
  })

  it('reads nothing when there is no resource to read for', async () => {
    const { holders, isVerified } = (await run(null))._unsafeUnwrap()

    expect(holders.size).toBe(0)
    expect(isVerified).toBe(false)
    expect(mockGraphqlRequest).not.toHaveBeenCalled()
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('trusts an indexed replay that matches the registry', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [row({ block: 10 })],
    })
    onChain({ [OWNER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(true)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  // WEB-1484
  it('still lists a live grant behind more than a page of role events', async () => {
    const churn = Array.from(
      { length: INDEXED_ROLE_EVENTS_PAGE_SIZE - 1 },
      (_, i) =>
        row({
          block: 100 + i,
          account: OTHER,
          newRoleBitmap: i % 2 === 0 ? SET_RESOLVER : 0n,
        }),
    )
    mockGraphqlRequest
      .mockResolvedValueOnce({
        eacRolesChangeds: [row({ block: 10 }), ...churn],
      })
      .mockResolvedValueOnce({
        eacRolesChangeds: [
          row({ block: 5000, account: OTHER, newRoleBitmap: 0n }),
        ],
      })
    onChain({ [OWNER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(true)
    expect([...holders.keys()]).toEqual([OWNER])
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('re-reads from the node, up to the same block, when the indexed replay is short', async () => {
    onChain({ [OWNER]: SET_RESOLVER })
    mockGetLogs.mockResolvedValue([log({ block: 10n })])

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(mockGetLogs).toHaveBeenCalledWith({
      address: REGISTRY,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: RESOURCE, account: undefined },
      fromBlock: ROLES_FROM_BLOCK,
      toBlock: BLOCK,
      strict: true,
    })
    expect(isVerified).toBe(true)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  // The count alone can't tell a role moving from one account to another.
  it('re-reads from the node when a role moved to an account the indexer missed', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [row({ block: 10 })],
    })
    onChain({ [OTHER]: SET_RESOLVER })
    mockGetLogs.mockResolvedValue([
      log({ block: 10n }),
      log({ block: 20n, newRoleBitmap: 0n }),
      log({ block: 20n, account: OTHER }),
    ])

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(true)
    expect([...holders.keys()]).toEqual([OTHER])
  })

  it('reports the list unverified when the node also disagrees', async () => {
    onChain({ [OWNER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect(holders.size).toBe(0)
  })

  it('keeps the indexed holders, unverified, when the node read fails', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [row({ block: 10 })],
    })
    onChain({ [OWNER]: SET_RESOLVER, [OTHER]: SET_RESOLVER })
    mockGetLogs.mockRejectedValue(new Error('query returns too many logs'))

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  it('reports the list unverified when the registry cannot be read', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [row({ block: 10 })],
    })
    mockReadContract.mockRejectedValue(new Error('execution reverted'))

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('keeps the indexed holders, unverified, when the block number cannot be read', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [row({ block: 10 })],
    })
    onChain({ [OWNER]: SET_RESOLVER })
    mockGetBlockNumber.mockRejectedValue(new Error('rpc unavailable'))

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
    expect(mockReadContract).not.toHaveBeenCalled()
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('reads on-chain roles only for accounts that still hold some', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [
        row({ block: 10, account: OTHER }),
        row({ block: 20, account: OTHER, newRoleBitmap: 0n }),
        row({ block: 30 }),
      ],
    })
    onChain({ [OWNER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(true)
    expect([...holders.keys()]).toEqual([OWNER])
    expect(mockReadContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'roles',
        args: [RESOURCE, OTHER],
      }),
    )
  })

  describe('replay', () => {
    beforeEach(() => {
      mockGraphqlRequest.mockRejectedValue(new Error('indexer unavailable'))
    })

    it('keeps the latest bitmap per account', async () => {
      mockGetLogs.mockResolvedValue([
        log({ block: 10n, newRoleBitmap: registryRoles.ROLE_SET_RESOLVER }),
        log({ block: 20n, newRoleBitmap: registryRoles.ROLE_UNREGISTER }),
      ])
      onChain({ [OWNER]: registryRoles.ROLE_UNREGISTER })

      const { holders, isVerified } = (await run())._unsafeUnwrap()

      expect(isVerified).toBe(true)
      expect(holders.get(OWNER)).toEqual(['ROLE_UNREGISTER'])
    })

    it('drops an account whose roles were revoked', async () => {
      mockGetLogs.mockResolvedValue([
        log({ block: 10n }),
        log({ block: 20n, account: OTHER }),
        log({ block: 30n, newRoleBitmap: 0n }),
      ])
      onChain({ [OTHER]: SET_RESOLVER })

      const { holders, isVerified } = (await run())._unsafeUnwrap()

      expect(isVerified).toBe(true)
      expect(holders.has(OWNER)).toBe(false)
      expect(holders.get(OTHER)).toEqual(['ROLE_SET_RESOLVER'])
    })

    it('ignores the zero address', async () => {
      mockGetLogs.mockResolvedValue([log({ block: 10n, account: zeroAddress })])

      const { holders, isVerified } = (await run())._unsafeUnwrap()

      expect(isVerified).toBe(true)
      expect(holders.size).toBe(0)
    })

    it('surfaces a node failure as an error result', async () => {
      mockGetLogs.mockRejectedValue(new Error('query returns too many logs'))

      const result = await run()

      expect(result.isErr()).toBe(true)
    })
  })
})
