import type { Config as WagmiConfig } from '@wagmi/core'
import { readContracts } from '@wagmi/core'
import { type Address, decodeFunctionData } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OPERATOR_APPROVAL_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  buildMigrationApprovalCalls,
  buildMigrationCleanupCalls,
  checkMigrationApprovals,
  type MigrationApprovalStatus,
  planMigrationApprovals,
  trackCreatedMigrationApproval,
} from './migrationApprovals'

vi.mock('@wagmi/core', () => ({
  readContracts: vi.fn(),
}))

const readContractsMock = vi.mocked(readContracts)
const EOA: Address = '0x0000000000000000000000000000000000000001'
const HELPER: Address = '0x0000000000000000000000000000000000000002'
const HCA: Address = '0x0000000000000000000000000000000000000003'
const WAGMI = {} as WagmiConfig

const NONE_APPROVED: MigrationApprovalStatus = {
  baseRegistrarHelperApproved: false,
  baseRegistrarHcaApproved: false,
  nameWrapperHelperApproved: false,
  nameWrapperHcaApproved: false,
  ethRegistryHcaApproved: false,
}

beforeEach(() => {
  readContractsMock.mockReset()
})

describe('checkMigrationApprovals', () => {
  it('skips reads and treats irrelevant approvals as satisfied', async () => {
    await expect(
      checkMigrationApprovals({
        eoa: EOA,
        hcaAddress: HCA,
        helperAddress: HELPER,
        needs: {
          hasUnwrapped: false,
          hasWrapped: false,
          requiresManagerRestoration: false,
        },
        wagmiConfig: WAGMI,
      }),
    ).resolves.toEqual({
      baseRegistrarHelperApproved: true,
      baseRegistrarHcaApproved: true,
      nameWrapperHelperApproved: true,
      nameWrapperHcaApproved: true,
      ethRegistryHcaApproved: true,
    })
    expect(readContractsMock).not.toHaveBeenCalled()
  })

  it('checks both MigrationHelper and HCA plus conditional registry approval', async () => {
    readContractsMock.mockResolvedValueOnce([
      true,
      false,
      false,
      true,
      false,
    ] as never)

    await expect(
      checkMigrationApprovals({
        eoa: EOA,
        hcaAddress: HCA,
        helperAddress: HELPER,
        needs: {
          hasUnwrapped: true,
          hasWrapped: true,
          requiresManagerRestoration: true,
        },
        wagmiConfig: WAGMI,
      }),
    ).resolves.toEqual({
      baseRegistrarHelperApproved: true,
      baseRegistrarHcaApproved: false,
      nameWrapperHelperApproved: false,
      nameWrapperHcaApproved: true,
      ethRegistryHcaApproved: false,
    })

    const options = readContractsMock.mock.calls[0]?.[1] as unknown as {
      contracts: readonly {
        address: Address
        args: readonly [Address, Address]
        functionName: string
      }[]
    }
    expect(options.contracts).toMatchObject([
      {
        address: V1_CONTRACTS.BaseRegistrar,
        args: [EOA, HELPER],
        functionName: 'isApprovedForAll',
      },
      {
        address: V1_CONTRACTS.BaseRegistrar,
        args: [EOA, HCA],
        functionName: 'isApprovedForAll',
      },
      {
        address: V1_CONTRACTS.NameWrapper,
        args: [EOA, HELPER],
        functionName: 'isApprovedForAll',
      },
      {
        address: V1_CONTRACTS.NameWrapper,
        args: [EOA, HCA],
        functionName: 'isApprovedForAll',
      },
      {
        address: V2_CONTRACTS.ETHRegistry,
        args: [EOA, HCA],
        functionName: 'isApprovedForAll',
      },
    ])
  })
})

describe('planMigrationApprovals', () => {
  const needs = {
    hasUnwrapped: true,
    hasWrapped: true,
    requiresManagerRestoration: true,
  } as const

  it('plans missing grants to both MigrationHelper and HCA', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        helperAddress: HELPER,
        needs,
        status: NONE_APPROVED,
      }).map((approval) => approval.id),
    ).toEqual([
      'base-registrar:migration-helper',
      'base-registrar:hca',
      'name-wrapper:migration-helper',
      'name-wrapper:hca',
      'eth-registry:hca',
    ])
  })

  it('omits pre-existing and irrelevant grants', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        helperAddress: HELPER,
        needs: {
          hasUnwrapped: true,
          hasWrapped: false,
          requiresManagerRestoration: false,
        },
        status: {
          ...NONE_APPROVED,
          baseRegistrarHelperApproved: true,
        },
      }).map((approval) => approval.id),
    ).toEqual(['base-registrar:hca'])
  })

  it('deduplicates a contract/operator pair when helper and HCA coincide', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        helperAddress: HCA,
        needs,
        status: NONE_APPROVED,
      }).map((approval) => approval.id),
    ).toEqual([
      'base-registrar:migration-helper',
      'name-wrapper:migration-helper',
      'eth-registry:hca',
    ])
  })
})

describe('approval cleanup ledger', () => {
  it('revokes only confirmed grants, in reverse creation order', () => {
    const plan = planMigrationApprovals({
      hcaAddress: HCA,
      helperAddress: HELPER,
      needs: {
        hasUnwrapped: true,
        hasWrapped: true,
        requiresManagerRestoration: false,
      },
      status: NONE_APPROVED,
    })
    const first = plan[0]
    const third = plan[2]
    if (!first || !third) throw new Error('expected four planned approvals')

    const created = trackCreatedMigrationApproval([], first)
    const afterSecondConfirmation = trackCreatedMigrationApproval(
      created,
      third,
    )
    const deduped = trackCreatedMigrationApproval(
      afterSecondConfirmation,
      third,
    )

    expect(deduped).toHaveLength(2)
    expect(buildMigrationApprovalCalls(plan)).toHaveLength(4)

    const cleanup = buildMigrationCleanupCalls(deduped)
    expect(cleanup.map((call) => call.to)).toEqual([
      third.contractAddress,
      first.contractAddress,
    ])
    expect(
      cleanup.map(
        (call) =>
          decodeFunctionData({
            abi: OPERATOR_APPROVAL_ABI,
            data: call.data,
          }).args,
      ),
    ).toEqual([
      [third.operatorAddress, false],
      [first.operatorAddress, false],
    ])
  })
})
