import type { Address, Hash, WalletClient } from 'viem'
import { writeContract } from 'viem/actions'
import { type ResolverRoleKey, resolverRoles } from '@/lib/roles/resolverRoles'

const revokeNameRolesSnippet = [
  {
    name: 'revokeNameRoles',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'toName', type: 'bytes' },
      { name: 'roleBitmap', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

function encodeRoleBitmapFromKeys(roles: ResolverRoleKey[]): bigint {
  let bitmap = 0n
  for (const role of roles) {
    bitmap |= resolverRoles[role]
  }
  return bitmap
}

export interface RevokeResolverRolesParameters {
  readonly resolverAddress: Address
  readonly account: Address
  readonly roles: ResolverRoleKey[]
  readonly walletClient: WalletClient
}

export const revokeResolverRoles = async (
  params: RevokeResolverRolesParameters,
): Promise<Hash> => {
  const { resolverAddress, account, roles, walletClient } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  if (roles.length === 0) {
    throw new Error('At least one role must be selected')
  }

  const roleBitmap = encodeRoleBitmapFromKeys(roles)

  return writeContract(walletClient, {
    address: resolverAddress,
    abi: revokeNameRolesSnippet,
    functionName: 'revokeNameRoles',
    args: ['0x00', roleBitmap, account],
    chain: walletClient.chain,
    account: walletClient.account,
  })
}
