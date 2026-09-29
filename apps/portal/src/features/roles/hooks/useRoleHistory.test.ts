import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { ok, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

// A resource carrying a non-zero eacVersionId, i.e. a re-registered name.
const RESOURCE = 0xabcd_0000_0007n

const mockGetLogs = vi.fn()
const mockGetResource = vi.fn()
const mockGetBlockTimestamps = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

// These cases exercise the node path; the indexer is the first source now.
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: () => Promise.reject(new Error('indexer unavailable')),
  },
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

  describe('scoping to the governing registry (#92825)', () => {
    const UNRELATED: Address = '0x2222222222222222222222222222222222222222'
    const FORGED: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    // Anyone can deploy a registry and emit `EACRolesChanged` with another
    // name's resource. The node filters by emitter and topic the way a real
    // RPC does, so the forged log surfaces only if the read stops pinning the
    // registry.
    const onChain = [
      { ...log({ block: 10n }), address: REGISTRY },
      {
        ...log({ block: 20n }),
        address: UNRELATED,
        args: { ...log({ block: 20n }).args, account: FORGED },
      },
    ]

    beforeEach(() => {
      mockGetLogs.mockImplementation(
        async ({
          address,
          args,
        }: {
          address?: Address
          args: { resource: bigint }
        }) =>
          onChain.filter(
            (entry) =>
              (!address ||
                entry.address.toLowerCase() === address.toLowerCase()) &&
              entry.args.resource === args.resource,
          ),
      )
      mockGetBlockTimestamps.mockReturnValue(
        okAsync(
          new Map([
            [10n, 120n],
            [20n, 240n],
          ]),
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
