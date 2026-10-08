import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { revokeResolverRolesWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { assertRoleContractKind } from '@/features/roles/helpers/assertRoleContractKind'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import {
  assertCalldataFunction,
  assertCalldataResourceId,
  type ResourceId,
} from '@/lib/resource/resourceId'
import {
  describeResolverResource,
  type ResolverRole,
  ROOT_RESOURCE,
} from '@/lib/roles/resolverRoles'

export interface RevokeResolverRolesTransactionParameters {
  readonly resolverAddress: Address
  /**
   * EAC resource the roles are held on: `ROOT_RESOURCE` or a setter resource.
   * Typed so it can only come from a fail-closed conversion — a resource that
   * could not be read must never arrive here as `0n`, which would revoke at
   * root scope instead (WEB-1513).
   */
  readonly resource: ResourceId
  readonly account: Address
  readonly roles: readonly ResolverRole[]
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

  const writeParams = revokeResolverRolesWriteParameters(
    walletClient as Parameters<typeof revokeResolverRolesWriteParameters>[0],
    resource === ROOT_RESOURCE
      ? {
          resolverAddress,
          targetAccount: account,
          scope: 'root',
          roles: [...roles],
        }
      : {
          resolverAddress,
          targetAccount: account,
          scope: 'resource',
          resource,
          roles: [...roles],
        },
  )

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  // What is about to be signed, re-read: a root-scoped revoke must be the
  // root-scoped function, and a scoped one must name its own resource.
  const action = `Revoking roles on ${describeResolverResource(resource).toLowerCase()}`
  if (resource === ROOT_RESOURCE) {
    assertCalldataFunction({
      abi: writeParams.abi,
      data,
      functionName: 'revokeRootRoles',
      action,
    })
  } else {
    assertCalldataResourceId({
      abi: writeParams.abi,
      data,
      expected: resource,
      action,
    })
  }

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

  await assertRoleContractKind(resolverAddress, 'permissioned-resolver')

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
