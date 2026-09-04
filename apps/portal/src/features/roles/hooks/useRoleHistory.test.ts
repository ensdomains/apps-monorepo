import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { ok, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FROM_BLOCK = 9_782_822n

// A resource carrying a non-zero eacVersionId, i.e. a re-registered name.
const RESOURCE = 0xabcd_0000_0007n

const mockGetLogs = vi.fn()
const mockGetResource = vi.fn()
const mockGetBlockTimestamps = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getResource: (...args: unknown[]) => mockGetResource(...args),
}))

vi.mock('@/features/profile/hooks/useBlockTimestamps', () => ({
  getBlockTimestamps: (params: { blocks: bigint[] }) =>
    mockGetBlockTimestamps(params),
}))

const { getRoleHistory } = await import('./useRoleHistory')

const log = ({
  block,
  newRoleBitmap = registryRoles.ROLE_RENEW,
}: {
  block: bigint
  newRoleBitmap?: bigint
}) => ({
  blockNumber: block,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  args: {
    resource: RESOURCE,
    account: ACCOUNT,
    oldRoleBitmap: 0n,
    newRoleBitmap,
  },
})

const run = (params: { account?: Address; name?: string } = {}) =>
  getRoleHistory({
    fromBlock: FROM_BLOCK,
    name: 'test.chakri.eth',
    registryAddress: REGISTRY,
    ...params,
  })

describe('getRoleHistory', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
    mockGetResource.mockReset()
    mockGetResource.mockResolvedValue(RESOURCE)
    mockGetBlockTimestamps.mockReset()
    mockGetBlockTimestamps.mockReturnValue(okAsync(new Map<bigint, bigint>()))
  })

  it('pins the resource the registry reports, version bits included', async () => {
    await run()

    expect(mockGetResource).toHaveBeenCalledWith(expect.anything(), {
      label: 'test',
      registryAddress: REGISTRY,
    })
    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY,
        args: { resource: RESOURCE },
        fromBlock: FROM_BLOCK,
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
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  it('narrows to one account when asked', async () => {
    await run({ account: ACCOUNT })

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { resource: RESOURCE, account: ACCOUNT },
      }),
    )
  })

  it('decodes bitmaps and backfills block times, newest first', async () => {
    mockGetLogs.mockResolvedValue([
      log({ block: 10n }),
      log({ block: 30n, newRoleBitmap: registryRoles.ROLE_SET_RESOLVER }),
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
    expect(entries.map((entry) => entry.timestamp)).toEqual([360n, 240n, 120n])
    expect(entries[0]?.newRoles).toEqual(['ROLE_SET_RESOLVER'])
    expect(entries[0]?.resource).toBe(
      `0x${RESOURCE.toString(16).padStart(64, '0')}`,
    )
  })
})
