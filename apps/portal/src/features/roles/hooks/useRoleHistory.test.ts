import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = getAddress(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
)

// A resource carrying a non-zero eacVersionId, i.e. a re-registered name.
const RESOURCE = 0xabcd_0000_0007n
const RESOURCE_HEX = `0x${RESOURCE.toString(16).padStart(64, '0')}`

const mockGetResource = vi.fn()
const mockGraphqlRequest = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: (...args: unknown[]) => mockGraphqlRequest(...args),
  },
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getResource: (...args: unknown[]) => mockGetResource(...args),
}))

const { getRoleHistory } = await import('./useRoleHistory')

const row = ({
  block,
  account = ACCOUNT,
  newRoleBitmap = registryRoles.ROLE_RENEW,
}: {
  readonly block: number
  readonly account?: Address
  readonly newRoleBitmap?: bigint
}) => ({
  blockNumber: block,
  timestamp: block * 12,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  asEACRolesChanged: {
    resource: RESOURCE_HEX,
    account,
    oldRoleBitmap: '0x0',
    newRoleBitmap: `0x${newRoleBitmap.toString(16)}`,
  },
})

const indexedPage = (rows: readonly unknown[]) => ({
  eventConnection: {
    pageInfo: { hasNextPage: false, endCursor: null },
    edges: rows.map((node) => ({ node })),
  },
})

const run = (params: { account?: Address; name?: string } = {}) =>
  getRoleHistory({
    name: 'test.chakri.eth',
    registryAddress: REGISTRY,
    ...params,
  })

describe('getRoleHistory', () => {
  beforeEach(() => {
    mockGetResource.mockReset()
    mockGetResource.mockResolvedValue(RESOURCE)
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockResolvedValue(indexedPage([]))
  })

  it('asks for the resource the registry reports, on that registry, version bits included', async () => {
    await run()

    expect(mockGetResource).toHaveBeenCalledWith(expect.anything(), {
      label: 'test',
      registryAddress: REGISTRY,
    })
    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contractAddress: REGISTRY.toLowerCase(),
        resource: RESOURCE_HEX,
      }),
    )
  })

  it('derives the label from the normalized name', async () => {
    await run({ name: 'TEST.chakri.eth' })

    expect(mockGetResource).toHaveBeenCalledWith(expect.anything(), {
      label: 'test',
      registryAddress: REGISTRY,
    })
  })

  it('fails rather than guessing when the name will not normalize', async () => {
    const result = await run({ name: 'in..valid.eth' })

    expect(result.isErr()).toBe(true)
    expect(mockGraphqlRequest).not.toHaveBeenCalled()
  })

  it('narrows to one account when asked', async () => {
    const OTHER = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row({ block: 10 }), row({ block: 20, account: OTHER })]),
    )

    const entries = (await run({ account: ACCOUNT }))._unsafeUnwrap()

    expect(entries.map((entry) => entry.account)).toEqual([ACCOUNT])
  })

  it('decodes bitmaps and carries indexed times, newest first', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([
        row({ block: 10 }),
        row({ block: 20 }),
        row({ block: 30, newRoleBitmap: registryRoles.ROLE_SET_RESOLVER }),
      ]),
    )

    const entries = (await run())._unsafeUnwrap()

    expect(entries.map((entry) => entry.blockNumber)).toEqual([30n, 20n, 10n])
    expect(entries.map((entry) => entry.timestamp)).toEqual([360n, 240n, 120n])
    expect(entries[0]?.newRoles).toEqual(['ROLE_SET_RESOLVER'])
    expect(entries[0]?.resource).toBe(RESOURCE_HEX)
  })

  it('surfaces an indexer failure as an error result', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer unavailable'))

    expect((await run()).isErr()).toBe(true)
  })

  describe('scoping to the governing registry (#92825)', () => {
    const UNRELATED: Address = '0x2222222222222222222222222222222222222222'
    const FORGED = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

    // Anyone can deploy a registry and emit `EACRolesChanged` with another
    // name's resource. The indexer filters by emitter and resource, so the
    // forged event surfaces only if the read stops pinning the registry.
    const indexed = [
      { contractAddress: REGISTRY, row: row({ block: 10 }) },
      {
        contractAddress: UNRELATED,
        row: row({ block: 20, account: FORGED }),
      },
    ]

    beforeEach(() => {
      mockGraphqlRequest.mockImplementation(
        async (
          _query: unknown,
          variables: { contractAddress?: string; resource: string },
        ) =>
          indexedPage(
            indexed
              .filter(
                (entry) =>
                  (!variables.contractAddress ||
                    entry.contractAddress.toLowerCase() ===
                      variables.contractAddress) &&
                  entry.row.asEACRolesChanged.resource === variables.resource,
              )
              .map((entry) => entry.row),
          ),
      )
    })

    it("drops an unrelated registry's event carrying the name's resource", async () => {
      const entries = (await run())._unsafeUnwrap()

      expect(entries.map((entry) => entry.account)).not.toContain(FORGED)
    })

    it('shows only events emitted by the governing registry', async () => {
      const entries = (await run())._unsafeUnwrap()

      expect(entries.map((entry) => entry.blockNumber)).toEqual([10n])
      expect(entries.map((entry) => entry.account)).toEqual([ACCOUNT])
    })
  })
})
