import type { Address, PublicClient, WalletClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoleContractKind } from '../utils/roleContractKind'

const target = '0x1111111111111111111111111111111111111111' as Address
const grantee = '0x3333333333333333333333333333333333333333' as Address

let kind: RoleContractKind = 'unsupported'
vi.mock('@/features/roles/hooks/useRoleContractKind', () => ({
  getRoleContractKindQueryOptions: (params: { address: Address }) => ({
    queryKey: ['role-contract-kind', params],
    queryFn: async () => kind,
  }),
}))

const startTransaction = vi.fn(() => 'tx-1')
vi.mock('@ens-apps/transaction-manager', () => ({
  transactionManager: { startTransaction },
  waitForTransaction: vi.fn(async () => ({ hash: '0xhash' })),
}))

const { assertRoleContractKind } = await import('./assertRoleContractKind')
const { grantRegistryRoles } = await import(
  '@/features/registry/helpers/grantRegistryRoles'
)
const { revokeRegistryRoles } = await import(
  '@/features/registry/helpers/revokeRegistryRoles'
)
const { grantResolverRoles } = await import(
  '@/features/resolver/helpers/grantResolverRoles'
)
const { revokeResolverRoles } = await import(
  '@/features/resolver/helpers/revokeResolverRoles'
)

const clients = {
  walletClient: {
    account: { address: '0x2222222222222222222222222222222222222222' },
    chain: { id: 11155111 },
  } as unknown as WalletClient,
  publicClient: {} as PublicClient,
  signer: { type: 'eoa' } as never,
  chainId: 11155111,
  id: 'tx-test',
}

describe('assertRoleContractKind', () => {
  it('passes when the contract uses the expected role model', async () => {
    kind = 'registry'
    await expect(
      assertRoleContractKind(target, 'registry'),
    ).resolves.toBeUndefined()
  })

  it('names both models when they differ', async () => {
    kind = 'permissioned-resolver'
    await expect(
      assertRoleContractKind(target, 'registry'),
    ).rejects.toMatchObject({
      _tag: 'RoleContractMismatchError',
      expected: 'registry',
      actual: 'permissioned-resolver',
    })
  })

  it('refuses a contract that is neither', async () => {
    kind = 'unsupported'
    await expect(
      assertRoleContractKind(target, 'permissioned-resolver'),
    ).rejects.toMatchObject({ _tag: 'RoleContractMismatchError' })
  })
})

// Immunefi #91335 / #92771: the same bitmap means different roles on the
// other contract, so nothing may be sent once the kinds disagree.
describe('role writes check the contract before sending', () => {
  beforeEach(() => startTransaction.mockClear())

  it('grantRegistryRoles refuses a permissioned resolver', async () => {
    kind = 'permissioned-resolver'
    await expect(
      grantRegistryRoles({
        ...clients,
        registryAddress: target,
        account: grantee,
        roles: ['ROLE_REGISTRAR'],
      }),
    ).rejects.toMatchObject({ _tag: 'RoleContractMismatchError' })
    expect(startTransaction).not.toHaveBeenCalled()
  })

  it('revokeRegistryRoles refuses a permissioned resolver', async () => {
    kind = 'permissioned-resolver'
    await expect(
      revokeRegistryRoles({
        ...clients,
        registryAddress: target,
        account: grantee,
        roles: ['ROLE_REGISTRAR'],
      }),
    ).rejects.toMatchObject({ _tag: 'RoleContractMismatchError' })
    expect(startTransaction).not.toHaveBeenCalled()
  })

  it('grantResolverRoles refuses a registry', async () => {
    kind = 'registry'
    await expect(
      grantResolverRoles({
        ...clients,
        resolverAddress: target,
        account: grantee,
        scope: { type: 'root', roles: ['ROLE_SET_TEXT'] },
      }),
    ).rejects.toMatchObject({ _tag: 'RoleContractMismatchError' })
    expect(startTransaction).not.toHaveBeenCalled()
  })

  it('revokeResolverRoles refuses a registry', async () => {
    kind = 'registry'
    await expect(
      revokeResolverRoles({
        ...clients,
        resolverAddress: target,
        resource: 0n,
        account: grantee,
        roles: ['ROLE_SET_TEXT'],
      }),
    ).rejects.toMatchObject({ _tag: 'RoleContractMismatchError' })
    expect(startTransaction).not.toHaveBeenCalled()
  })

  it('sends once the kinds agree', async () => {
    kind = 'registry'
    await grantRegistryRoles({
      ...clients,
      registryAddress: target,
      account: grantee,
      roles: ['ROLE_REGISTRAR'],
    })
    expect(startTransaction).toHaveBeenCalledTimes(1)
  })
})
