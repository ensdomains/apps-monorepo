import { QueryClient } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config as WagmiConfig } from 'wagmi'
import {
  GetMigrationHcaApprovalError,
  GetMigrationOperatorApprovalsError,
  getMigrationHcaApprovalQueryOptions,
  getMigrationOperatorApprovalsQueryOptions,
} from './migrationApprovalQueries'
import {
  hasTemporaryMigrationHcaApproval,
  readActiveMigrationOperatorApprovals,
} from './migrationApprovals'

vi.mock('./migrationApprovals', () => ({
  hasTemporaryMigrationHcaApproval: vi.fn(),
  readActiveMigrationOperatorApprovals: vi.fn(),
}))

const owner: Address = '0x0000000000000000000000000000000000000001'
const hca: Address = '0x0000000000000000000000000000000000000002'
const wagmiConfig = {} as WagmiConfig
const publicClient = { chain: { id: 1 } } as PublicClient
const queryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })

const readOperatorsMock = vi.mocked(readActiveMigrationOperatorApprovals)
const readHcaMock = vi.mocked(hasTemporaryMigrationHcaApproval)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('migration approval queries', () => {
  it('unwraps operator approvals and exposes a typed read error', async () => {
    readOperatorsMock.mockResolvedValueOnce([])
    const options = getMigrationOperatorApprovalsQueryOptions({
      owner,
      hca,
      chainId: 1,
      wagmiConfig,
    })

    await expect(queryClient().fetchQuery(options)).resolves.toEqual([])

    const cause = new Error('operator read failed')
    readOperatorsMock.mockRejectedValueOnce(cause)
    const error = await queryClient()
      .fetchQuery(options)
      .catch((error: unknown) => error)
    expect(error).toBeInstanceOf(GetMigrationOperatorApprovalsError)
    expect(error).toMatchObject({
      name: 'GetMigrationOperatorApprovalsError',
      cause,
    })
    expect(readOperatorsMock).toHaveBeenCalledWith({
      eoa: owner,
      hcaAddress: hca,
      wagmiConfig,
    })
  })

  it('unwraps HCA approval status and exposes a typed read error', async () => {
    readHcaMock.mockResolvedValueOnce(true)
    const options = getMigrationHcaApprovalQueryOptions({
      owner,
      hca,
      publicClient,
    })

    await expect(queryClient().fetchQuery(options)).resolves.toBe(true)

    const cause = new Error('HCA read failed')
    readHcaMock.mockRejectedValueOnce(cause)
    const error = await queryClient()
      .fetchQuery(options)
      .catch((error: unknown) => error)
    expect(error).toBeInstanceOf(GetMigrationHcaApprovalError)
    expect(error).toMatchObject({
      name: 'GetMigrationHcaApprovalError',
      cause,
    })
    expect(readHcaMock).toHaveBeenCalledWith({
      publicClient,
      eoa: owner,
      hcaAddress: hca,
    })
  })
})
