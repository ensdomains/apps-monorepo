import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { type Address, getAddress, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const OWNER: Address = getAddress('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const OTHER: Address = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

// A resource carrying a non-zero eacVersionId, i.e. a re-registered name. The
// indexer matches it verbatim, version bits included.
const RESOURCE = 0xabcd_0000_0007n

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: (...args: unknown[]) => mockGraphqlRequest(...args),
  },
}))

const { getNameRolesAccounts } = await import('./useNameRoleAccounts')

const holder = ({
  account = OWNER,
  roleBitmap = registryRoles.ROLE_SET_RESOLVER,
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

const run = (resource: bigint | null = RESOURCE) =>
  getNameRolesAccounts({
    resource: resource as never,
    registryAddress: REGISTRY,
  })

describe('getNameRolesAccounts', () => {
  beforeEach(() => {
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
        resource: `0x${RESOURCE.toString(16).padStart(64, '0')}`,
      }),
    )
  })

  it('reads nothing when there is no resource to read for', async () => {
    const roles = (await run(null))._unsafeUnwrap()

    expect(roles.size).toBe(0)
    expect(mockGraphqlRequest).not.toHaveBeenCalled()
  })

  it('decodes each account’s current bitmap into roles', async () => {
    mockGraphqlRequest.mockResolvedValue(
      assignments([
        holder({ roleBitmap: registryRoles.ROLE_UNREGISTER }),
        holder({ account: OTHER, id: '2' }),
      ]),
    )

    const roles = (await run())._unsafeUnwrap()

    expect(roles.get(OWNER)).toEqual(['ROLE_UNREGISTER'])
    expect(roles.get(OTHER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  it('drops an account whose bitmap decodes to no roles', async () => {
    mockGraphqlRequest.mockResolvedValue(
      assignments([holder({ roleBitmap: 0n }), holder({ account: OTHER })]),
    )

    const roles = (await run())._unsafeUnwrap()

    expect(roles.has(OWNER)).toBe(false)
    expect(roles.get(OTHER)).toEqual(['ROLE_SET_RESOLVER'])
  })

  it('ignores the zero address', async () => {
    mockGraphqlRequest.mockResolvedValue(
      assignments([holder({ account: zeroAddress })]),
    )

    const roles = (await run())._unsafeUnwrap()

    expect(roles.size).toBe(0)
  })

  it('surfaces an indexer failure as an error result', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer unavailable'))

    const result = await run()

    expect(result.isErr()).toBe(true)
  })
})
