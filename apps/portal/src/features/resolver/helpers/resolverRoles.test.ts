import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  RESOLVER_ROLE_LINK,
  RESOLVER_ROLE_SET_ADDRESS,
  RESOLVER_ROLE_SET_TEXT,
} from '@ensdomains/ensjs/utils/v2'
import {
  permissionedResolverGrantRootRolesSnippet,
  permissionedResolverGrantSetterRolesSnippet,
  permissionedResolverRevokeRolesSnippet,
  permissionedResolverRevokeRootRolesSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import { type Address, decodeFunctionData, type WalletClient } from 'viem'
import { describe, expect, it } from 'vitest'
import type { IntentContext } from '@/features/transaction-manager/types'
import {
  computeResolverResource,
  encodeResolverSetterScope,
  ROOT_RESOURCE,
} from '@/lib/roles/resolverRoles'
import { prepareGrantResolverRolesTransaction } from './grantResolverRoles'
import {
  prepareResolverRolesSaveIntent,
  type ResolverRolesSaveAction,
} from './prepareResolverRolesIntent'
import { prepareRevokeResolverRolesTransaction } from './revokeResolverRoles'

const rolesAbi = [
  ...permissionedResolverGrantRootRolesSnippet,
  ...permissionedResolverGrantSetterRolesSnippet,
  ...permissionedResolverRevokeRootRolesSnippet,
  ...permissionedResolverRevokeRolesSnippet,
] as const

const resolverAddress = '0x1111111111111111111111111111111111111111' as Address
const from = '0x2222222222222222222222222222222222222222' as Address
const account = '0x3333333333333333333333333333333333333333' as Address
const walletClient = {
  account: { address: from },
  chain: { id: 11155111 },
} as unknown as WalletClient

const decode = (intent: CustomTransactionIntent) => {
  if (intent.request.type !== 'eoa' || !intent.request.data)
    throw new Error('expected an EOA request with calldata')
  return decodeFunctionData({ abi: rolesAbi, data: intent.request.data })
}

describe('prepareGrantResolverRolesTransaction', () => {
  it('encodes grantRootRoles for the root scope', () => {
    const intent = prepareGrantResolverRolesTransaction({
      resolverAddress,
      account,
      scope: { type: 'root', roles: ['ROLE_SET_TEXT', 'ROLE_LINK'] },
      walletClient,
      chainId: 11155111,
    })

    expect(decode(intent)).toEqual({
      functionName: 'grantRootRoles',
      args: [RESOLVER_ROLE_SET_TEXT | RESOLVER_ROLE_LINK, account],
    })
  })

  it('encodes grantSetterRoles with setter calldata for an argument scope', () => {
    const setter = { kind: 'text', key: 'avatar' } as const
    const intent = prepareGrantResolverRolesTransaction({
      resolverAddress,
      account,
      scope: { type: 'setter', setter },
      walletClient,
      chainId: 11155111,
    })

    expect(decode(intent)).toEqual({
      functionName: 'grantSetterRoles',
      args: [encodeResolverSetterScope(setter), account],
    })
  })

  it('rejects an empty root grant', () => {
    expect(() =>
      prepareGrantResolverRolesTransaction({
        resolverAddress,
        account,
        scope: { type: 'root', roles: [] },
        walletClient,
        chainId: 11155111,
      }),
    ).toThrow(/at least one role/i)
  })
})

describe('prepareRevokeResolverRolesTransaction', () => {
  it('encodes revokeRootRoles on the root resource', () => {
    const intent = prepareRevokeResolverRolesTransaction({
      resolverAddress,
      resource: ROOT_RESOURCE,
      account,
      roles: ['ROLE_SET_ADDRESS'],
      walletClient,
      chainId: 11155111,
    })

    expect(decode(intent)).toEqual({
      functionName: 'revokeRootRoles',
      args: [RESOLVER_ROLE_SET_ADDRESS, account],
    })
  })

  it('encodes revokeRoles(resource, ...) on a setter resource', () => {
    const resource = computeResolverResource({ kind: 'address', coinType: 60n })
    const intent = prepareRevokeResolverRolesTransaction({
      resolverAddress,
      resource,
      account,
      roles: ['ROLE_SET_ADDRESS'],
      walletClient,
      chainId: 11155111,
    })

    expect(decode(intent)).toEqual({
      functionName: 'revokeRoles',
      args: [resource, RESOLVER_ROLE_SET_ADDRESS, account],
    })
  })
})

// The modal estimates gas for this intent before the save starts, so it has to
// be the call the save will send: the row's own resource, and no single
// estimate when the save is really two transactions.
describe('prepareResolverRolesSaveIntent', () => {
  const ctx = { walletClient, chainId: 11155111 } as IntentContext
  const avatar = computeResolverResource({ kind: 'text', key: 'avatar' })
  const save = (
    edit: Pick<
      ResolverRolesSaveAction,
      'resource' | 'rolesToGrant' | 'rolesToRevoke'
    >,
  ): ResolverRolesSaveAction => ({
    type: 'save',
    resourceLabel: 'label',
    account,
    ...edit,
  })

  it('estimates a root grant when the save only grants', () => {
    const intent = prepareResolverRolesSaveIntent(
      save({
        resource: ROOT_RESOURCE,
        rolesToGrant: ['ROLE_SET_TEXT'],
        rolesToRevoke: [],
      }),
      resolverAddress,
      ctx,
    )

    expect(intent && decode(intent)).toEqual({
      functionName: 'grantRootRoles',
      args: [RESOLVER_ROLE_SET_TEXT, account],
    })
  })

  it("estimates the revoke on the row's own resource, not root", () => {
    const intent = prepareResolverRolesSaveIntent(
      save({
        resource: avatar,
        rolesToGrant: [],
        rolesToRevoke: ['ROLE_SET_TEXT'],
      }),
      resolverAddress,
      ctx,
    )

    expect(intent && decode(intent)).toEqual({
      functionName: 'revokeRoles',
      args: [avatar, RESOLVER_ROLE_SET_TEXT, account],
    })
  })

  it('gives no single estimate when the save both grants and revokes', () => {
    expect(
      prepareResolverRolesSaveIntent(
        save({
          resource: ROOT_RESOURCE,
          rolesToGrant: ['ROLE_SET_TEXT'],
          rolesToRevoke: ['ROLE_SET_ADDRESS'],
        }),
        resolverAddress,
        ctx,
      ),
    ).toBeUndefined()
  })
})
