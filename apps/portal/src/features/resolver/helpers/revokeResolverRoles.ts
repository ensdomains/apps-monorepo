import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
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
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import { permissionedResolverAbi } from '@/lib/abis/permissionedResolver'
import {
  describeResolverResource,
  encodeResolverRoleBitmap,
  type ResolverRoleKey,
  ROOT_RESOURCE,
} from '@/lib/roles/resolverRoles'

export interface RevokeResolverRolesTransactionParameters {
  readonly resolverAddress: Address
  /** EAC resource the roles are held on: `ROOT_RESOURCE` or a setter resource. */
  readonly resource: bigint
  readonly account: Address
  readonly roles: readonly ResolverRoleKey[]
  readonly walletClient: WalletClient
  readonly chainId: number
}

/** The revoke intent, shared by the gas estimate and `revokeResolverRoles`. */
export const prepareRevokeResolverRolesTransaction = ({
  resolverAddress,
  resource,
  account,
  roles,
  walletClient,
  chainId,
}: RevokeResolverRolesTransactionParameters): CustomTransactionIntent => {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  if (roles.length === 0) {
    throw new Error('At least one role must be selected')
  }

  const roleBitmap = encodeResolverRoleBitmap(roles)

  const data =
    resource === ROOT_RESOURCE
      ? encodeFunctionData({
          abi: permissionedResolverAbi,
          functionName: 'revokeRootRoles',
          args: [roleBitmap, account],
        })
      : encodeFunctionData({
          abi: permissionedResolverAbi,
          functionName: 'revokeRoles',
          args: [resource, roleBitmap, account],
        })

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: resolverAddress,
    data,
    chainId,
  })
}

export interface RevokeResolverRolesParameters
  extends RevokeResolverRolesTransactionParameters {
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly id: string
}

export const revokeResolverRoles = async (
  params: RevokeResolverRolesParameters,
): Promise<Hash> => {
  const {
    resolverAddress,
    resource,
    account,
    roles,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
  } = params

  const txId = transactionManager.startTransaction(
    prepareRevokeResolverRolesTransaction({
      resolverAddress,
      resource,
      account,
      roles,
      walletClient,
      chainId,
    }),
    signer,
    {
      id,
      description: `Revoke resolver roles for ${describeResolverResource(resource).toLowerCase()}`,
      publicClient,
      chainId,
    },
  )
  const result = await waitForTransaction(txId)
  return result.hash
}
