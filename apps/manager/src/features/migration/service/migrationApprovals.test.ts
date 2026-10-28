import type { Config as WagmiConfig } from '@wagmi/core'
import { readContracts } from '@wagmi/core'
import { type Address, decodeFunctionData, erc721Abi } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OPERATOR_APPROVAL_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  buildMigrationApprovalCall,
  buildMigrationOperatorApprovalRevocationCall,
  checkMigrationApprovals,
  getMigrationApprovalReview,
  type MigrationApprovalStatus,
  type MigrationCleanupApproval,
  migrationApprovalForId,
  orderMigrationCleanupApprovals,
  planMigrationApprovalPreflight,
  planMigrationApprovals,
  planMigrationCleanupApprovals,
  readActiveMigrationOperatorApprovals,
  temporaryMigrationHcaApproval,
} from './migrationApprovals'

vi.mock('@wagmi/core', () => ({
  readContracts: vi.fn(),
}))

const readContractsMock = vi.mocked(readContracts)
const EOA: Address = '0x0000000000000000000000000000000000000001'
const HCA: Address = '0x0000000000000000000000000000000000000003'
const OTHER: Address = '0x0000000000000000000000000000000000000004'
const WAGMI = {} as WagmiConfig
const TOKEN_ONE = 1n
const TOKEN_TWO = 2n
const TOKEN_THREE = 3n

const statusFor = (
  tokenIds: readonly bigint[],
  overrides: Partial<MigrationApprovalStatus> = {},
): MigrationApprovalStatus => ({
  baseRegistrarHcaApproved: false,
  unwrappedTokenApprovals: tokenIds.map((tokenId) => ({
    tokenId,
    approved: false,
  })),
  nameWrapperHcaApproved: false,
  ethRegistryHcaApproved: false,
  ...overrides,
})

beforeEach(() => {
  readContractsMock.mockReset()
})

describe('planMigrationCleanupApprovals', () => {
  const registrar: MigrationCleanupApproval = {
    kind: 'operator',
    id: 'base-registrar:hca',
    contractAddress: V1_CONTRACTS.BaseRegistrar,
    operatorAddress: V2_CONTRACTS.MigrationHelper,
  }
  const registry = temporaryMigrationHcaApproval(HCA)
  it.each([
    {
      strategy: 'per-token' as const,
      missing: [registrar],
      owned: [],
      active: false,
      expected: [],
    },
    {
      strategy: 'temporary-operator' as const,
      missing: [registrar, registry],
      owned: [registrar],
      active: false,
      expected: [registrar, registry],
    },
    {
      strategy: 'temporary-operator' as const,
      missing: [],
      owned: [registrar],
      active: true,
      expected: [registrar, registry],
    },
  ])(
    'derives cleanup from reviewed and owned permissions: $strategy, active $active',
    ({ strategy, missing, owned, active, expected }) => {
      expect(
        planMigrationCleanupApprovals({
          hcaAddress: HCA,
          strategy,
          missing,
          ownedRegistrationCleanup: owned,
          hasHcaApproval: active,
        }),
      ).toEqual(expected)
    },
  )
})

describe('checkMigrationApprovals', () => {
  it('checks for leftover HCA access even when this selection needs no grants', async () => {
    readContractsMock.mockResolvedValueOnce([true] as never)
    await expect(
      checkMigrationApprovals({
        eoa: EOA,
        hcaAddress: HCA,
        needs: {
          hasUnwrapped: false,
          unwrappedTokenIds: [],
          hasWrapped: false,
          requiresManagerRestoration: false,
        },
        wagmiConfig: WAGMI,
      }),
    ).resolves.toEqual({
      baseRegistrarHcaApproved: true,
      unwrappedTokenApprovals: [],
      nameWrapperHcaApproved: true,
      ethRegistryHcaApproved: true,
    })
    expect(readContractsMock).toHaveBeenCalledOnce()
    expect(readContractsMock.mock.calls[0]?.[1].contracts).toHaveLength(1)
  })

  it('checks helper NFT approvals and the HCA manager approval in one batch', async () => {
    readContractsMock.mockResolvedValueOnce([
      false,
      V2_CONTRACTS.MigrationHelper,
      OTHER,
      true,
      false,
    ] as never)

    await expect(
      checkMigrationApprovals({
        eoa: EOA,
        hcaAddress: HCA,
        needs: {
          hasUnwrapped: true,
          unwrappedTokenIds: [TOKEN_ONE, TOKEN_TWO],
          hasWrapped: true,
          requiresManagerRestoration: true,
        },
        wagmiConfig: WAGMI,
      }),
    ).resolves.toEqual({
      baseRegistrarHcaApproved: false,
      unwrappedTokenApprovals: [
        { tokenId: TOKEN_ONE, approved: true },
        { tokenId: TOKEN_TWO, approved: false },
      ],
      nameWrapperHcaApproved: true,
      ethRegistryHcaApproved: false,
    })

    const options = readContractsMock.mock.calls[0]?.[1] as unknown as {
      contracts: readonly {
        readonly address: Address
        readonly args: readonly unknown[]
        readonly functionName: string
      }[]
    }
    expect(options.contracts).toMatchObject([
      {
        address: V1_CONTRACTS.BaseRegistrar,
        args: [EOA, V2_CONTRACTS.MigrationHelper],
        functionName: 'isApprovedForAll',
      },
      {
        address: V1_CONTRACTS.BaseRegistrar,
        args: [TOKEN_ONE],
        functionName: 'getApproved',
      },
      {
        address: V1_CONTRACTS.BaseRegistrar,
        args: [TOKEN_TWO],
        functionName: 'getApproved',
      },
      {
        address: V1_CONTRACTS.NameWrapper,
        args: [EOA, V2_CONTRACTS.MigrationHelper],
        functionName: 'isApprovedForAll',
      },
      {
        address: V2_CONTRACTS.ETHRegistry,
        args: [EOA, HCA],
        functionName: 'isApprovedForAll',
      },
    ])
    expect(options.contracts.at(-1)).toMatchObject({
      address: V2_CONTRACTS.ETHRegistry,
      args: [EOA, HCA],
    })
  })
})

describe('readActiveMigrationOperatorApprovals', () => {
  it('shows active helper and HCA operators independently of selected names', async () => {
    readContractsMock.mockResolvedValueOnce([true, false, true] as never)

    const active = await readActiveMigrationOperatorApprovals({
      eoa: EOA,
      hcaAddress: HCA,
      wagmiConfig: WAGMI,
    })

    expect(active.map(({ id }) => id)).toEqual([
      'base-registrar:hca',
      'eth-registry:hca',
    ])
    expect(readContractsMock.mock.calls[0]?.[1].contracts).toHaveLength(3)
  })
})

describe('planMigrationApprovals', () => {
  const needsFor = (unwrappedTokenIds: readonly bigint[]) => ({
    hasUnwrapped: unwrappedTokenIds.length > 0,
    unwrappedTokenIds,
    hasWrapped: false,
    requiresManagerRestoration: false,
  })

  it.each([1, 2, 3, 4])(
    'plans one temporary grant and revocation for %i missing approvals',
    (count) => {
      const tokenIds = Array.from({ length: count }, (_, index) =>
        BigInt(index + 1),
      )
      const preflight = planMigrationApprovalPreflight({
        hcaAddress: HCA,
        needs: needsFor(tokenIds),
        status: statusFor(tokenIds),
        registrationApprovalPolicy: 'temporary-operator',
      })
      const grant = migrationApprovalForId({
        id: 'base-registrar:hca',
        hcaAddress: HCA,
      })
      expect(preflight.registrationApprovalStrategy).toBe('temporary-operator')
      expect(preflight.migrationApprovals).toEqual([grant])
      expect(preflight.migrationCleanupApprovals).toEqual([grant])
    },
  )

  it('does not replace existing global permission with a new grant in bulk mode', () => {
    const preflight = planMigrationApprovalPreflight({
      hcaAddress: HCA,
      needs: needsFor([1n, 2n, 3n]),
      status: statusFor([1n, 2n, 3n], { baseRegistrarHcaApproved: true }),
      registrationApprovalPolicy: 'temporary-operator',
    })
    expect(preflight.migrationApprovals).toEqual([])
    expect(preflight.migrationCleanupApprovals).toEqual([])
  })

  it.each([false, true])(
    'reuses selected token approvals in bulk mode (all approved: %s)',
    (allApproved) => {
      const tokenIds = [TOKEN_ONE, TOKEN_TWO]
      const preflight = planMigrationApprovalPreflight({
        hcaAddress: HCA,
        needs: needsFor(tokenIds),
        status: statusFor(tokenIds, {
          unwrappedTokenApprovals: [
            { tokenId: TOKEN_ONE, approved: true },
            { tokenId: TOKEN_TWO, approved: allApproved },
          ],
        }),
        registrationApprovalPolicy: 'temporary-operator',
      })
      const expected = allApproved
        ? []
        : [
            migrationApprovalForId({
              id: 'base-registrar:hca',
              hcaAddress: HCA,
            }),
          ]
      expect(preflight.migrationApprovals).toEqual(expected)
      expect(preflight.migrationCleanupApprovals).toEqual(expected)
    },
  )

  it('preserves a reviewed token-scoped strategy when the current policy uses bulk approvals', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        needs: needsFor([TOKEN_ONE]),
        status: statusFor([TOKEN_ONE]),
        registrationApprovalStrategy: 'per-token',
        registrationApprovalPolicy: 'temporary-operator',
      }),
    ).toEqual([
      migrationApprovalForId({
        id: 'base-registrar:hca-token',
        hcaAddress: HCA,
        tokenId: TOKEN_ONE,
      }),
    ])
  })

  it.each([1, 2])(
    'keeps the reviewed bulk strategy for %i remaining registrations on retry',
    (count) => {
      const tokenIds = Array.from({ length: count }, (_, index) =>
        BigInt(index + 1),
      )
      expect(
        planMigrationApprovals({
          hcaAddress: HCA,
          needs: needsFor(tokenIds),
          status: statusFor(tokenIds),
          registrationApprovalStrategy: 'temporary-operator',
        }),
      ).toEqual([
        migrationApprovalForId({ id: 'base-registrar:hca', hcaAddress: HCA }),
      ])
    },
  )

  it('uses per-token approval for one missing registration', () => {
    const oneTokenPlan = planMigrationApprovals({
      hcaAddress: HCA,
      needs: needsFor([TOKEN_ONE]),
      status: statusFor([TOKEN_ONE]),
    })
    expect(oneTokenPlan).toMatchObject([
      { kind: 'erc721-token', tokenId: TOKEN_ONE },
    ])
  })

  it('keeps approvals token-scoped when two registrations are missing', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        needs: needsFor([TOKEN_ONE, TOKEN_TWO]),
        status: statusFor([TOKEN_ONE, TOKEN_TWO]),
      }),
    ).toMatchObject([
      { kind: 'erc721-token', tokenId: TOKEN_ONE },
      { kind: 'erc721-token', tokenId: TOKEN_TWO },
    ])
  })

  it('approves only the selected tokens still missing permission', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        needs: needsFor([TOKEN_ONE, TOKEN_TWO, TOKEN_THREE]),
        status: statusFor([TOKEN_ONE, TOKEN_TWO, TOKEN_THREE], {
          unwrappedTokenApprovals: [
            { tokenId: TOKEN_ONE, approved: true },
            { tokenId: TOKEN_TWO, approved: false },
            { tokenId: TOKEN_THREE, approved: false },
          ],
        }),
      }),
    ).toMatchObject([
      { kind: 'erc721-token', tokenId: TOKEN_TWO },
      { kind: 'erc721-token', tokenId: TOKEN_THREE },
    ])
  })

  it('omits registration grants when every token is already approved', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        needs: needsFor([TOKEN_ONE, TOKEN_TWO]),
        status: statusFor([TOKEN_ONE, TOKEN_TWO], {
          unwrappedTokenApprovals: [
            { tokenId: TOKEN_ONE, approved: true },
            { tokenId: TOKEN_TWO, approved: true },
          ],
        }),
      }),
    ).toEqual([])
  })

  it('omits all registration grants when the helper is already an operator', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        needs: needsFor([TOKEN_ONE, TOKEN_TWO, TOKEN_THREE]),
        status: statusFor([TOKEN_ONE, TOKEN_TWO, TOKEN_THREE], {
          baseRegistrarHcaApproved: true,
        }),
      }),
    ).toEqual([])
  })

  it('adds only missing wrapped-name and manager HCA operators', () => {
    expect(
      planMigrationApprovals({
        hcaAddress: HCA,
        needs: {
          hasUnwrapped: false,
          unwrappedTokenIds: [],
          hasWrapped: true,
          requiresManagerRestoration: true,
        },
        status: statusFor([], { nameWrapperHcaApproved: true }),
      }).map((approval) => approval.id),
    ).toEqual(['eth-registry:hca'])
  })
})

describe('migration approval review', () => {
  const required = {
    chainId: 1,
    owner: EOA,
    contractAddress: V1_CONTRACTS.BaseRegistrar,
    operatorAddress: V2_CONTRACTS.MigrationHelper,
    names: ['alice.eth', 'bob.eth'],
  }

  it('requires a review only for a new global registration grant', () => {
    expect(
      getMigrationApprovalReview({
        chainId: 1,
        owner: EOA,
        names: required.names,
        approvals: [
          migrationApprovalForId({ id: 'base-registrar:hca', hcaAddress: HCA }),
        ],
      }),
    ).toEqual(required)
    expect(
      getMigrationApprovalReview({
        chainId: 1,
        owner: EOA,
        names: required.names,
        approvals: [],
      }),
    ).toBeNull()
  })
})

describe('cleanup order', () => {
  it('skips inactive permissions and a matching approval id for a different operator', () => {
    const registration: MigrationCleanupApproval = {
      kind: 'operator',
      id: 'base-registrar:hca',
      contractAddress: V1_CONTRACTS.BaseRegistrar,
      operatorAddress: V2_CONTRACTS.MigrationHelper,
    }

    expect(
      orderMigrationCleanupApprovals({
        planned: [registration, temporaryMigrationHcaApproval(HCA)],
        active: [{ ...registration, operatorAddress: OTHER }],
      }),
    ).toEqual([])
  })
})

describe('approval calldata', () => {
  it('encodes ERC-721 approval for MigrationHelper', () => {
    const approval = migrationApprovalForId({
      id: 'base-registrar:hca-token',
      hcaAddress: HCA,
      tokenId: TOKEN_ONE,
    })
    const grant = decodeFunctionData({
      abi: erc721Abi,
      data: buildMigrationApprovalCall(approval).data,
    })
    expect(grant.functionName).toBe('approve')
    expect(grant.args).toEqual([V2_CONTRACTS.MigrationHelper, TOKEN_ONE])
  })

  it('encodes a persistent operator grant', () => {
    const approval = migrationApprovalForId({
      id: 'name-wrapper:hca',
      hcaAddress: HCA,
    })
    if (approval.kind !== 'operator') throw new Error('Expected operator')
    const decoded = decodeFunctionData({
      abi: OPERATOR_APPROVAL_ABI,
      data: buildMigrationApprovalCall(approval).data,
    })
    expect(decoded.args).toEqual([V2_CONTRACTS.MigrationHelper, true])
  })

  it('encodes operator revocation after migration', () => {
    const approval = migrationApprovalForId({
      id: 'name-wrapper:hca',
      hcaAddress: HCA,
    })
    if (approval.kind !== 'operator') throw new Error('Expected operator')
    const decoded = decodeFunctionData({
      abi: OPERATOR_APPROVAL_ABI,
      data: buildMigrationOperatorApprovalRevocationCall(approval).data,
    })
    expect(decoded.args).toEqual([V2_CONTRACTS.MigrationHelper, false])
  })
})
