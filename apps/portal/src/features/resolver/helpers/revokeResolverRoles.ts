import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import {
  type Address,
  encodeFunctionData,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { packetToBytes } from 'viem/ens'
import { toHex } from 'viem/utils'
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

function encodeRoleBitmapFromKeys(roles: readonly ResolverRoleKey[]): bigint {
  let bitmap = 0n
  for (const role of roles) {
    bitmap |= resolverRoles[role]
  }
  return bitmap
}

export interface RevokeResolverRolesParameters {
  readonly resolverAddress: Address
  readonly name: string
  readonly account: Address
  readonly roles: readonly ResolverRoleKey[]
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

export const revokeResolverRoles = async (
  params: RevokeResolverRolesParameters,
): Promise<Hash> => {
  const {
    resolverAddress,
    name,
    account,
    roles,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
  } = params

  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  if (roles.length === 0) {
    throw new Error('At least one role must be selected')
  }

  const roleBitmap = encodeRoleBitmapFromKeys(roles)
  const dnsName = name === '' ? '0x00' : toHex(packetToBytes(name))
  const data = encodeFunctionData({
    abi: revokeNameRolesSnippet,
    functionName: 'revokeNameRoles',
    args: [dnsName, roleBitmap, account],
  })

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: walletClient.account.address,
        to: resolverAddress,
        data,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Revoke resolver roles for ${name || '(root)'}`,
      publicClient,
      chainId,
    },
  )
  const result = await waitForTransaction(txId)
  return result.hash
}
