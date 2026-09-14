import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { grantResolverRolesWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import {
  type Address,
  encodeFunctionData,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { toEoaCustomIntent } from '@/features/transaction-manager/helpers/intents'
import {
  formatSetterScope,
  type ResolverRole,
  type ResolverSetterScope,
} from '@/lib/roles/resolverRoles'

/**
 * Where a resolver grant applies. `root` covers every name on the resolver;
 * `setter` narrows the setter's own role to one argument (a coin type, a text
 * key, ...). Per-name grants do not exist on the post-audit-2 resolver.
 */
export type ResolverGrantScope =
  | { readonly type: 'root'; readonly roles: readonly ResolverRole[] }
  | { readonly type: 'setter'; readonly setter: ResolverSetterScope }

export interface GrantResolverRolesTransactionParameters {
  readonly resolverAddress: Address
  readonly account: Address
  readonly scope: ResolverGrantScope
  readonly walletClient: WalletClient
  readonly chainId: number
}

export const describeGrantScope = (scope: ResolverGrantScope): string =>
  scope.type === 'root' ? 'all names' : formatSetterScope(scope.setter)

/** The grant intent, shared by the gas estimate and `grantResolverRoles`. */
export const prepareGrantResolverRolesTransaction = ({
  resolverAddress,
  account,
  scope,
  walletClient,
  chainId,
}: GrantResolverRolesTransactionParameters): CustomTransactionIntent => {
  if (!walletClient.account || !walletClient.chain) {
    throw new Error('Wallet client must have account and chain configured')
  }

  if (scope.type === 'root' && scope.roles.length === 0) {
    throw new Error('At least one role must be selected')
  }

  const writeParams = grantResolverRolesWriteParameters(
    walletClient as Parameters<typeof grantResolverRolesWriteParameters>[0],
    scope.type === 'root'
      ? {
          resolverAddress,
          targetAccount: account,
          scope: 'root',
          roles: [...scope.roles],
        }
      : {
          resolverAddress,
          targetAccount: account,
          scope: 'setter',
          setter: scope.setter,
        },
  )

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  return toEoaCustomIntent({
    from: walletClient.account.address,
    to: resolverAddress,
    data,
    chainId,
  })
}

export interface GrantResolverRolesParameters
  extends GrantResolverRolesTransactionParameters {
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly id: string
}

export const grantResolverRoles = async (
  params: GrantResolverRolesParameters,
): Promise<Hash> => {
  const {
    resolverAddress,
    account,
    scope,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
  } = params

  const txId = transactionManager.startTransaction(
    prepareGrantResolverRolesTransaction({
      resolverAddress,
      account,
      scope,
      walletClient,
      chainId,
    }),
    signer,
    {
      id,
      description: `Grant resolver roles for ${describeGrantScope(scope)}`,
      publicClient,
      chainId,
    },
  )

  const result = await waitForTransaction(txId)
  return result.hash
}
