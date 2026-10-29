import type { Config as WagmiConfig } from '@wagmi/core'
import { readContracts } from '@wagmi/core'
import { type Address, decodeFunctionData, erc721Abi } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OPERATOR_APPROVAL_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  buildMigrationApprovalCall,
  checkMigrationApprovals,
  isDefinitelyUnsubmittedMigrationApprovalError,
  isExpectedMigrationApprovalRequest,
  isRegistrationApprovalRecoveryScopeValid,
  type MigrationApprovalStatus,
  migrationApprovalForId,
  planMigrationApprovals,
  prepareMigrationApprovals,
  readActiveMigrationOperatorApprovals,
  registrationApprovalRecoveryDecision,
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
})

describe('prepareMigrationApprovals', () => {
  it.each([1, 3])(
    'uses one bulk grant for %i missing token approvals',
    (count) => {
      const approvals = Array.from({ length: count }, (_, index) =>
        migrationApprovalForId({
          id: 'base-registrar:hca-token',
          hcaAddress: HCA,
          tokenId: BigInt(index + 1),
        }),
      )
      expect(
        prepareMigrationApprovals({
          approvals,
          hcaAddress: HCA,
          canBatchAtomically: false,
        }),
      ).toEqual([
        migrationApprovalForId({ id: 'base-registrar:hca', hcaAddress: HCA }),
      ])
      expect(
        prepareMigrationApprovals({
          approvals,
          hcaAddress: HCA,
          canBatchAtomically: true,
        }),
      ).toEqual(approvals)
    },
  )
  it('leaves existing operator and wrapped approvals unchanged', () => {
    const approvals = [
      migrationApprovalForId({ id: 'name-wrapper:hca', hcaAddress: HCA }),
    ]
    expect(
      prepareMigrationApprovals({
        approvals,
        hcaAddress: HCA,
        canBatchAtomically: false,
      }),
    ).toEqual(approvals)
  })
})

describe('isRegistrationApprovalRecoveryScopeValid', () => {
  const currentApproval = migrationApprovalForId({
    id: 'base-registrar:hca',
    hcaAddress: HCA,
  })
  it.each([
    {
      savedNames: ['bob.eth', 'alice.eth'],
      approval: currentApproval,
      expected: true,
    },
    { savedNames: ['alice.eth'], approval: currentApproval, expected: false },
    {
      savedNames: ['alice.eth', 'bob.eth'],
      approval: { ...currentApproval, operatorAddress: OTHER },
      expected: false,
    },
    {
      savedNames: ['alice.eth', 'bob.eth'],
      approval: { ...currentApproval, contractAddress: OTHER },
      expected: false,
    },
  ])(
    'validates the saved grant against the existing migration scope: %o',
    ({ savedNames, approval, expected }) => {
      expect(
        isRegistrationApprovalRecoveryScopeValid({
          approval,
          currentApproval,
          names: ['alice.eth', 'bob.eth'],
          savedNames,
        }),
      ).toBe(expected)
    },
  )
})

describe('isDefinitelyUnsubmittedMigrationApprovalError', () => {
  it.each([
    [{ _tag: 'ChainIdMismatchError' }, true],
    [{ cause: { _tag: 'SignerAddressMismatchError' } }, true],
    [{ cause: { name: 'ChainMismatchError' } }, true],
    [
      { _tag: 'TransactionSubmissionError', cause: new Error('response lost') },
      false,
    ],
    [new Error('network disconnected'), false],
    [undefined, false],
  ])(
    'only releases confirmed pre-submission failures: %o',
    (error, expected) => {
      expect(isDefinitelyUnsubmittedMigrationApprovalError(error)).toBe(
        expected,
      )
    },
  )
})

describe('registrationApprovalRecoveryDecision', () => {
  it.each([
    ['grant-pending', false, undefined, 'unresolved'],
    ['grant-pending', true, undefined, 'unresolved'],
    ['grant-pending', false, 'success', 'complete'],
    ['grant-pending', true, 'success', 'granted'],
    ['grant-pending', false, 'reverted', 'complete'],
    ['grant-pending', true, 'reverted', 'complete'],
    ['granted', false, undefined, 'complete'],
    ['granted', true, undefined, 'granted'],
    ['revoke-pending', false, undefined, 'complete'],
    ['revoke-pending', true, undefined, 'unresolved'],
    ['revoke-pending', true, 'reverted', 'granted'],
    ['revoke-pending', true, 'success', 'unresolved'],
  ] as const)(
    'resolves %s with permission %s and receipt %s as %s',
    (status, isActive, receiptStatus, expected) => {
      expect(
        registrationApprovalRecoveryDecision({
          status,
          isActive,
          receiptStatus,
        }),
      ).toBe(expected)
    },
  )
})

describe('isExpectedMigrationApprovalRequest', () => {
  const expected = {
    owner: '0x0000000000000000000000000000000000000001',
    contractAddress: '0x0000000000000000000000000000000000000002',
    chainId: 1,
    data: '0x1234',
  } as const
  const request = {
    from: expected.owner,
    to: expected.contractAddress,
    chainId: expected.chainId,
    data: expected.data,
    value: 0n,
  }

  it('accepts the exact account, chain, target, calldata and zero-value request', () => {
    expect(isExpectedMigrationApprovalRequest({ ...expected, request })).toBe(
      true,
    )
  })

  it.each([
    { from: expected.contractAddress },
    { to: expected.owner },
    { chainId: 11155111 },
    { data: '0x5678' },
    { value: 1n },
  ])(
    'rejects a recovered request with a different scope or call: %o',
    (override) => {
      expect(
        isExpectedMigrationApprovalRequest({
          ...expected,
          request: { ...request, ...override },
        }),
      ).toBe(false)
    },
  )
})
