import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, getAddress, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toResourceHex } from '@/lib/roles/toResourceHex'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const OWNER: Address = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const OTHER: Address = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

// A resource carrying a non-zero eacVersionId, i.e. a re-registered name. The
// indexer and the registry match it verbatim, version bits included.
const RESOURCE = 0xabcd_0000_0007n

const BLOCK = 12_000_000n

const SET_RESOLVER = registryRoles.ROLE_SET_RESOLVER

const mockGetBlockNumber = vi.fn()
const mockReadContract = vi.fn()
const mockGraphqlRequest = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok({
      chain: { id: 11155111 },
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

const holder = ({
  account = OWNER,
  roleBitmap = SET_RESOLVER,
  id = '1',
}: {
  readonly account?: Address
  readonly roleBitmap?: bigint
  readonly id?: string
}) => ({
  id,
  account,
  roleBitmap: `0x${roleBitmap.toString(16)}`,
})

const assignments = (rows: readonly unknown[]) => ({
  roleConnection: {
    pageInfo: { hasNextPage: false, endCursor: null },
    edges: rows.map((node) => ({ node })),
  },
})

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
    mockGetBlockNumber.mockReset()
    mockGetBlockNumber.mockResolvedValue(BLOCK)
    mockReadContract.mockReset()
    onChain({})
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockResolvedValue(assignments([]))
  })

  // The caller resolves the resource and hands it over, version bits included,
  // so the rows are about the same resource the writes address (WEB-1458).
  it('reads holders for the resource it was given, version bits included', async () => {
    await run()

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contract: REGISTRY.toLowerCase(),
        resource: toResourceHex(RESOURCE),
      }),
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
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  it('decodes each account’s current bitmap into roles, verified against the registry', async () => {
    mockGraphqlRequest.mockResolvedValue(
      assignments([
        holder({ roleBitmap: registryRoles.ROLE_UNREGISTER }),
        holder({ account: OTHER, id: '2' }),
      ]),
    )
    onChain({ [OWNER]: registryRoles.ROLE_UNREGISTER, [OTHER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(true)
    expect(holders.get(OWNER)).toEqual(['ROLE_UNREGISTER'])
    expect(holders.get(OTHER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  it('drops an account whose bitmap decodes to no roles, without reading it on chain', async () => {
    mockGraphqlRequest.mockResolvedValue(
      assignments([
        holder({ roleBitmap: 0n }),
        holder({ account: OTHER, id: '2' }),
      ]),
    )
    onChain({ [OTHER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(true)
    expect([...holders.keys()]).toEqual([OTHER])
    expect(mockReadContract).not.toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'roles',
        args: [RESOURCE, OWNER],
      }),
    )
  })

  it('ignores the zero address', async () => {
    mockGraphqlRequest.mockResolvedValue(
      assignments([holder({ account: zeroAddress })]),
    )

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(true)
    expect(holders.size).toBe(0)
  })

  // WEB-1484
  it('reports the list unverified when the registry counts a holder the indexer lacks', async () => {
    mockGraphqlRequest.mockResolvedValue(assignments([holder({})]))
    onChain({ [OWNER]: SET_RESOLVER, [OTHER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  // The count alone can't tell a role moving from one account to another.
  it('reports the list unverified when a role moved to an account the indexer missed', async () => {
    mockGraphqlRequest.mockResolvedValue(assignments([holder({})]))
    onChain({ [OTHER]: SET_RESOLVER })

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect([...holders.keys()]).toEqual([OWNER])
  })

  it('reports the list unverified when the registry cannot be read', async () => {
    mockGraphqlRequest.mockResolvedValue(assignments([holder({})]))
    mockReadContract.mockRejectedValue(new Error('execution reverted'))

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  it('keeps the indexed holders, unverified, when the block number cannot be read', async () => {
    mockGraphqlRequest.mockResolvedValue(assignments([holder({})]))
    onChain({ [OWNER]: SET_RESOLVER })
    mockGetBlockNumber.mockRejectedValue(new Error('rpc unavailable'))

    const { holders, isVerified } = (await run())._unsafeUnwrap()

    expect(isVerified).toBe(false)
    expect(holders.get(OWNER)).toEqual(['ROLE_SET_RESOLVER'])
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  it('surfaces an indexer failure as an error result', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer unavailable'))

    const result = await run()

    expect(result.isErr()).toBe(true)
  })
})
