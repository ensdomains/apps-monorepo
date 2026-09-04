import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const ROOT_RESOURCE_HEX = `0x${'0'.repeat(64)}`
const FROM_BLOCK = 9_782_822n

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

const run = (fromBlock = FROM_BLOCK) =>
  getRegistryRoleHistoryForAccount({
    registryAddress: REGISTRY,
    account: ACCOUNT,
    fromBlock,
  })

describe('getRegistryRoleHistoryForAccount', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetBlockTimestamps.mockReset()
    mockGetBlockTimestamps.mockReturnValue(okAsync(new Map<bigint, bigint>()))
  })

  it('asks the node for this account at the root resource only', async () => {
    mockGetLogs.mockResolvedValue([])

    await run()

    expect(mockGetLogs).toHaveBeenCalledWith({
      address: REGISTRY,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: 0n, account: ACCOUNT },
      fromBlock: FROM_BLOCK,
    })
  })

  it('scans from the caller-supplied block', async () => {
    mockGetLogs.mockResolvedValue([])

    await run(11_383_897n)

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 11_383_897n }),
    )
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

  it('reads a missing block time as 0 rather than failing', async () => {
    mockGetLogs.mockResolvedValue([log({ block: 10n })])

    const entries = (await run())._unsafeUnwrap()

    expect(entries[0]?.timestamp).toBe(0n)
  })

  it('returns the newest change first', async () => {
    mockGetLogs.mockResolvedValue([
      log({ block: 10n }),
      log({ block: 30n }),
      log({ block: 20n }),
    ])

    const entries = (await run())._unsafeUnwrap()

    expect(entries.map((entry) => entry.blockNumber)).toEqual([30n, 20n, 10n])
  })

  it('records the resource as padded hex, as the other producers do', async () => {
    mockGetLogs.mockResolvedValue([log({ block: 10n })])

    const entries = (await run())._unsafeUnwrap()

    expect(entries[0]?.resource).toBe(ROOT_RESOURCE_HEX)
  })

  it('surfaces a node failure as an error result', async () => {
    mockGetLogs.mockRejectedValue(new Error('query returns too many logs'))

    const result = await run()

    expect(result.isErr()).toBe(true)
  })
})
