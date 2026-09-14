import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_FROM_BLOCK } from './rolesFromBlock'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const FROM_BLOCK = 9_782_822n

const mockGetLogs = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 }, getLogs: mockGetLogs }),
}))

const { getRoleChangeLogs, ROOT_RESOURCE } = await import('./roleChangeLogs')

describe('getRoleChangeLogs', () => {
  beforeEach(() => {
    mockGetLogs.mockReset()
    mockGetLogs.mockResolvedValue([])
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
