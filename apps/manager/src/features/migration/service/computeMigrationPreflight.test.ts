import type { Address, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { OWNER as EOA, makeDomain } from './_fixtures'
import { computeMigrationPreflight } from './computeMigrationPreflight'

const readContract = vi.fn()

const publicClient = {
  readContract,
} as unknown as PublicClient

const run = (
  domains: readonly Parameters<typeof makeDomain>[0][],
): ReturnType<typeof computeMigrationPreflight> =>
  computeMigrationPreflight({
    eoa: EOA,
    domains: domains.map(makeDomain),
    publicClient,
  })

beforeEach(() => {
  readContract.mockReset()
})

describe('computeMigrationPreflight', () => {
  it('checks BaseRegistrar helper approval when unwrapped names exist', async () => {
    readContract.mockResolvedValueOnce(false)

    const result = await run([{ isWrapped: false }])

    expect(readContract).toHaveBeenCalledWith({
      address: V1_CONTRACTS.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'isApprovedForAll',
      args: [EOA, V2_CONTRACTS.MigrationHelper],
    })
    expect(result.needsBaseRegistrarApproval).toBe(true)
    expect(result.needsNameWrapperApproval).toBe(false)
    expect(result.skipApprovalPhase).toBe(false)
  })

  it('checks NameWrapper helper approval when wrapped names exist', async () => {
    readContract.mockResolvedValueOnce(false)

    const result = await run([
      {
        isWrapped: true,
        registrantId: null,
        wrappedOwnerId: EOA,
        fuses: 0,
      },
    ])

    expect(readContract).toHaveBeenCalledWith({
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'isApprovedForAll',
      args: [EOA, V2_CONTRACTS.MigrationHelper],
    })
    expect(result.needsBaseRegistrarApproval).toBe(false)
    expect(result.needsNameWrapperApproval).toBe(true)
    expect(result.skipApprovalPhase).toBe(false)
  })

  it('skips approval phase when required approvals already exist', async () => {
    readContract.mockResolvedValueOnce(true)
    readContract.mockResolvedValueOnce(true)

    const result = await run([
      { isWrapped: false },
      {
        isWrapped: true,
        registrantId: null,
        wrappedOwnerId: EOA,
        fuses: 0,
      },
    ])

    expect(result.needsBaseRegistrarApproval).toBe(false)
    expect(result.needsNameWrapperApproval).toBe(false)
    expect(result.skipApprovalPhase).toBe(true)
    expect(result.skipFetchProfilesPhase).toBe(true)
    expect(result.preExistingOwnedPermRes).toBeNull()
  })

  it('does not check approvals when no owned names are classifiable', async () => {
    const result = await run([
      { registrantId: '0x00000000000000000000000000000000000000aa' as Address },
    ])

    expect(readContract).not.toHaveBeenCalled()
    expect(result.skipApprovalPhase).toBe(true)
  })
})
