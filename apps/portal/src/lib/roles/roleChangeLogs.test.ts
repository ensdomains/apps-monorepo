import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok } from 'neverthrow'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from './rolesFromBlock'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FROM_BLOCK = 9_782_822n

const mockGetLogs = vi.fn()
const mockGraphqlRequest = vi.fn()
const mockGetBlockTimestamps = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

vi.mock('@/features/profile/hooks/useBlockTimestamps', () => ({
  getBlockTimestamps: (params: { blocks: bigint[] }) =>
    mockGetBlockTimestamps(params),
}))

vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: {
    request: (...args: unknown[]) => mockGraphqlRequest(...args),
  },
}))

const {
  getRoleChangeLogs,
  INDEXED_ROLE_EVENTS_TIMEOUT_MS,
  ROOT_RESOURCE,
  toRoleHistoryEntries,
} = await import('./roleChangeLogs')

const ROOT_HEX = `0x${'0'.repeat(64)}`

const row = ({
  block,
  account = ACCOUNT,
  newRoleBitmap = '0x1',
}: {
  block: number
  account?: string
  newRoleBitmap?: string
}) => ({
  blockNumber: block,
  timestamp: block * 12,
  transactionHash: `0x${block.toString(16).padStart(64, '0')}`,
  asEACRolesChanged: {
    resource: ROOT_HEX,
    account,
    oldRoleBitmap: '0x0',
    newRoleBitmap,
  },
})

describe('getRoleChangeLogs via the indexer', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockResolvedValue({ eacRolesChangeds: [] })
  })

  it('asks the indexer for the registry and padded resource, oldest first', async () => {
    await getRoleChangeLogs({ registryAddress: REGISTRY, resource: 0x1234n })

    expect(mockGraphqlRequest).toHaveBeenCalledWith(expect.anything(), {
      contractAddress: REGISTRY.toLowerCase(),
      resource: `0x${'1234'.padStart(64, '0')}`,
      fromBlock: Number(ROLES_FROM_BLOCK),
      first: 1000,
    })
    expect(mockGetLogs).not.toHaveBeenCalled()
  })

  // The node read honours `fromBlock`; the indexed read must ask the same
  // question or the two sources disagree for a caller that narrows the range.
  it('applies the caller lower bound to the indexed read', async () => {
    await getRoleChangeLogs({
      registryAddress: REGISTRY,
      resource: 0n,
      fromBlock: FROM_BLOCK,
    })

    expect(mockGraphqlRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fromBlock: Number(FROM_BLOCK) }),
    )
  })

  it('falls back to the node when the indexer stalls', async () => {
    vi.useFakeTimers()
    try {
      mockGraphqlRequest.mockReturnValue(new Promise(() => {}))
      const logs = [{ blockNumber: 10n }]
      mockGetLogs.mockResolvedValue(logs)

      const pending = getRoleChangeLogs({
        registryAddress: REGISTRY,
        resource: ROOT_RESOURCE,
      })
      await vi.advanceTimersByTimeAsync(INDEXED_ROLE_EVENTS_TIMEOUT_MS)

      expect((await pending)._unsafeUnwrap()).toEqual(logs)
    } finally {
      vi.useRealTimers()
    }
  })

  it('maps rows to the node log shape, checksummed and with a timestamp', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [row({ block: 10, account: ACCOUNT.toLowerCase() })],
    })

    const [log] = (
      await getRoleChangeLogs({ registryAddress: REGISTRY, resource: 0n })
    )._unsafeUnwrap()

    expect(log).toEqual({
      blockNumber: 10n,
      timestamp: 120n,
      transactionHash: `0x${'a'.padStart(64, '0')}`,
      args: {
        resource: 0n,
        account: getAddress(ACCOUNT),
        oldRoleBitmap: 0n,
        newRoleBitmap: 1n,
      },
    })
  })

  // The indexer cannot filter on the changed account, so it happens here.
  it('narrows to one account when asked', async () => {
    const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: [
        row({ block: 10, account: ACCOUNT }),
        row({ block: 11, account: OTHER }),
      ],
    })

    const logs = (
      await getRoleChangeLogs({
        registryAddress: REGISTRY,
        resource: 0n,
        account: ACCOUNT,
      })
    )._unsafeUnwrap()

    expect(logs.map((log) => log.blockNumber)).toEqual([10n])
  })

  it('falls back to the node when the indexer fails', async () => {
    mockGraphqlRequest.mockRejectedValue(new Error('indexer down'))
    const logs = [{ blockNumber: 10n }]
    mockGetLogs.mockResolvedValue(logs)

    const result = await getRoleChangeLogs({
      registryAddress: REGISTRY,
      resource: ROOT_RESOURCE,
    })

    expect(result._unsafeUnwrap()).toEqual(logs)
    expect(mockGetLogs).toHaveBeenCalledTimes(1)
  })

  // A full page may have been cut short; an incomplete fold would drop grants.
  it('falls back to the node when the indexer returns a full page', async () => {
    mockGraphqlRequest.mockResolvedValue({
      eacRolesChangeds: Array.from({ length: 1000 }, (_, i) =>
        row({ block: i + 1 }),
      ),
    })

    await getRoleChangeLogs({ registryAddress: REGISTRY, resource: 0n })

    expect(mockGetLogs).toHaveBeenCalledTimes(1)
  })
})

describe('toRoleHistoryEntries', () => {
  beforeEach(() => {
    mockGetBlockTimestamps.mockReset()
  })

  it('uses indexed timestamps without a block lookup', async () => {
    const entries = (
      await toRoleHistoryEntries({
        logs: [
          {
            blockNumber: 10n,
            timestamp: 120n,
            transactionHash: `0x${'a'.padStart(64, '0')}`,
            args: {
              resource: 0n,
              account: ACCOUNT,
              oldRoleBitmap: 0n,
              newRoleBitmap: 1n,
            },
          },
        ],
        resource: 0n,
      })
    )._unsafeUnwrap()

    expect(entries[0]?.timestamp).toBe(120n)
    expect(mockGetBlockTimestamps).not.toHaveBeenCalled()
  })
})

describe('getRoleChangeLogs', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
    // The node path is the fallback: these cases pin what it asks for.
    mockGraphqlRequest.mockReset()
    mockGraphqlRequest.mockRejectedValue(new Error('indexer unavailable'))
  })

  it('pins the resource topic and the single event', async () => {
    await getRoleChangeLogs({
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
    })

    expect(mockGetLogs).toHaveBeenCalledWith({
      address: REGISTRY,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: 0n, account: undefined },
      fromBlock: FROM_BLOCK,
      strict: true,
    })
  })

  it('pins a non-root resource unchanged, version bits included', async () => {
    const resource = 0x1234_0000_0001n

    await getRoleChangeLogs({
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource,
    })

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ args: { resource, account: undefined } }),
    )
  })

  it('adds the account topic when an account is given', async () => {
    await getRoleChangeLogs({
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
      account: ACCOUNT,
    })

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ args: { resource: 0n, account: ACCOUNT } }),
    )
  })

  it('defaults to the shared scan start when no block is given', async () => {
    await getRoleChangeLogs({
      registryAddress: REGISTRY,
      resource: ROOT_RESOURCE,
    })

    expect(mockGetLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: ROLES_FROM_BLOCK }),
    )
  })

  it('returns the logs the node gave back', async () => {
    const logs = [{ blockNumber: 10n }, { blockNumber: 20n }]
    mockGetLogs.mockResolvedValue(logs)

    const result = await getRoleChangeLogs({
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
    })

    expect(result._unsafeUnwrap()).toEqual(logs)
  })

  it('surfaces a rejected query as an error result', async () => {
    mockGetLogs.mockRejectedValue(
      new Error('query returns too many logs, narrow your filter: 20000'),
    )

    const result = await getRoleChangeLogs({
      registryAddress: REGISTRY,
      fromBlock: FROM_BLOCK,
      resource: ROOT_RESOURCE,
    })

    expect(result.isErr()).toBe(true)
  })
})
