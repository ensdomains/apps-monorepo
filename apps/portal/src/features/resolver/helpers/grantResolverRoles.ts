import type { ResolverRole } from '@ensdomains/ensjs/public/v2'
import { grantResolverNameRoles } from '@ensdomains/ensjs/wallet/v2'
import type { Address, Hash, WalletClient } from 'viem'

export interface GrantResolverRolesParameters {
  readonly resolverAddress: Address
  readonly account: Address
  readonly roles: ResolverRole[]
  readonly walletClient: WalletClient
}

export const grantResolverRoles = async (
  params: GrantResolverRolesParameters,
): Promise<Hash> => {
  const { resolverAddress, account, roles, walletClient } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  if (roles.length === 0) {
    throw new Error('At least one role must be selected')
  }

  const client = walletClient as Parameters<typeof grantResolverNameRoles>[0]

  return grantResolverNameRoles(client, {
    resolverAddress,
    name: '',
    roles,
    account,
  })
}
