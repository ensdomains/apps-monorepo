import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { type Address, decodeFunctionData, type WalletClient } from 'viem'
import { describe, expect, it } from 'vitest'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'
import {
  computeSetterResource,
  encodeSetterScope,
  ROOT_RESOURCE,
  resolverRoles,
} from '@/lib/roles/resolverRoles'
import { prepareGrantResolverRolesTransaction } from './grantResolverRoles'
import { prepareRevokeResolverRolesTransaction } from './revokeResolverRoles'

const resolverAddress = '0x1111111111111111111111111111111111111111' as Address
const from = '0x2222222222222222222222222222222222222222' as Address
const account = '0x3333333333333333333333333333333333333333' as Address
const walletClient = {
  account: { address: from },
  chain: { id: 11155111 },
} as unknown as WalletClient

const eoaRequest = (intent: CustomTransactionIntent) => {
  if (intent.request.type !== 'eoa' || !intent.request.data)
    throw new Error('expected an EOA request with calldata')
  return { ...intent.request, data: intent.request.data }
}

const decode = (data: `0x${string}`) =>
  decodeFunctionData({ abi: permissionedResolverAbi, data })

describe('prepareGrantResolverRolesTransaction', () => {
  it('encodes grantRootRoles for the root scope', () => {
    const intent = prepareGrantResolverRolesTransaction({
      resolverAddress,
      account,
      scope: { type: 'root', roles: ['ROLE_SET_TEXT', 'ROLE_LINK'] },
      walletClient,
      chainId: 11155111,
    })

    expect(eoaRequest(intent).to).toBe(resolverAddress)
    expect(decode(eoaRequest(intent).data)).toEqual({
      functionName: 'grantRootRoles',
      args: [resolverRoles.ROLE_SET_TEXT | resolverRoles.ROLE_LINK, account],
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

    expect(decode(eoaRequest(intent).data)).toEqual({
      functionName: 'grantSetterRoles',
      args: [encodeSetterScope(setter), account],
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

    expect(decode(eoaRequest(intent).data)).toEqual({
      functionName: 'revokeRootRoles',
      args: [resolverRoles.ROLE_SET_ADDRESS, account],
    })
  })

  it('encodes revokeRoles(resource, ...) on a setter resource', () => {
    const resource = computeSetterResource({ kind: 'address', coinType: 60n })
    const intent = prepareRevokeResolverRolesTransaction({
      resolverAddress,
      resource,
      account,
      roles: ['ROLE_SET_ADDRESS'],
      walletClient,
      chainId: 11155111,
    })

    expect(decode(eoaRequest(intent).data)).toEqual({
      functionName: 'revokeRoles',
      args: [resource, resolverRoles.ROLE_SET_ADDRESS, account],
    })
  })
})
