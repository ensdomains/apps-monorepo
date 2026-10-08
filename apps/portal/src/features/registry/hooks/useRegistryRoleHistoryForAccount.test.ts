import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = getAddress(
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
)
const OTHER: Address = getAddress('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')

const ROOT_RESOURCE_HEX = `0x${'0'.repeat(64)}`

const mockGraphqlRequest = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: (...args: unknown[]) => mockGraphqlRequest(...args),
  },
}))

const { getRegistryRoleHistoryForAccount } = await import(
  './useRegistryRoleHistoryForAccount'
)

const row = ({
  block,
  account = ACCOUNT,
  oldRoleBitmap = 0n,
  newRoleBitmap = registryRoles.ROLE_RENEW,
}: {
  readonly block: number
  readonly account?: Address
  readonly oldRoleBitmap?: bigint
  readonly newRoleBitmap?: bigint
}) => ({
  blockNumber: block,
  timestamp: block * 12,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  asEACRolesChanged: {
    resource: ROOT_RESOURCE_HEX,
    account,
    oldRoleBitmap: `0x${oldRoleBitmap.toString(16)}`,
    newRoleBitmap: `0x${newRoleBitmap.toString(16)}`,
  },
})

const indexedPage = (rows: readonly unknown[]) => ({
  eventConnection: {
    pageInfo: { hasNextPage: false, endCursor: null },
    edges: rows.map((node) => ({ node })),
  },
})

const run = () =>
  getRegistryRoleHistoryForAccount({
    registryAddress: REGISTRY,
    account: ACCOUNT,
  })

describe('getRegistryRoleHistoryForAccount', () => {
  beforeEach(() => {
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockResolvedValue(indexedPage([]))
  })

  it('asks the indexer for the root resource on this registry', async () => {
    await run()

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contractAddress: REGISTRY.toLowerCase(),
        resource: ROOT_RESOURCE_HEX,
      }),
    )
  })

  it('keeps only this account’s changes', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row({ block: 10 }), row({ block: 20, account: OTHER })]),
    )

    const entries = (await run())._unsafeUnwrap()

    expect(entries.map((entry) => entry.account)).toEqual([ACCOUNT])
  })

  it('decodes both bitmaps into role names', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([
        row({
          block: 10,
          oldRoleBitmap: registryRoles.ROLE_RENEW,
          newRoleBitmap:
            registryRoles.ROLE_RENEW | registryRoles.ROLE_UNREGISTER,
        }),
      ]),
    )

    const entries = (await run())._unsafeUnwrap()

    expect(entries[0]?.oldRoles).toEqual(['ROLE_RENEW'])
    expect(entries[0]?.newRoles).toEqual(
      expect.arrayContaining(['ROLE_RENEW', 'ROLE_UNREGISTER']),
    )
    expect(entries[0]?.newRoles).toHaveLength(2)
  })

  it('carries each change’s indexed time, newest first', async () => {
    mockGraphqlRequest.mockResolvedValue(
      indexedPage([row({ block: 10 }), row({ block: 20 }), row({ block: 30 })]),
    )

    const entries = (await run())._unsafeUnwrap()

    expect(entries.map((entry) => entry.blockNumber)).toEqual([30n, 20n, 10n])
    expect(entries.map((entry) => entry.timestamp)).toEqual([360n, 240n, 120n])
  })

  it('records the resource as padded hex, as the other producers do', async () => {
    mockGraphqlRequest.mockResolvedValue(indexedPage([row({ block: 10 })]))

    const entries = (await run())._unsafeUnwrap()

    expect(entries[0]?.resource).toBe(ROOT_RESOURCE_HEX)
  })

  it('surfaces an indexer failure as an error result', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer unavailable'))

    expect((await run()).isErr()).toBe(true)
  })
})
