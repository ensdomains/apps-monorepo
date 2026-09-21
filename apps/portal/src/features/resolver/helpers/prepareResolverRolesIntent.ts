import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import type { Address } from 'viem'
import type { IntentContext } from '@/features/transaction-manager/types'
import type {
  ResolverRevocation,
  ResolverRole,
} from '@/lib/roles/resolverRoles'
import { prepareGrantResolverRolesTransaction } from './grantResolverRoles'
import { prepareRevokeResolverRolesTransaction } from './revokeResolverRoles'

/**
 * An edit to one row (one account on one resource). Grants are only possible
 * on the root resource: argument-scoped grants need the setter calldata, which
 * the sidebar does not reconstruct from a resource hash.
 */
export type ResolverRolesSaveAction = {
  readonly type: 'save'
  readonly resource: bigint
  readonly resourceLabel: string
  readonly account: Address
  readonly rolesToGrant: readonly ResolverRole[]
  readonly rolesToRevoke: readonly ResolverRole[]
}

/** Every grant the account holds on the resolver, one revoke per resource. */
export type ResolverRolesRemoveAction = {
  readonly type: 'remove'
  readonly account: Address
  readonly revocations: readonly ResolverRevocation[]
}

/**
 * A pending resolver-roles action awaiting confirmation in the sidebar. It is a
 * snapshot: the table refetches while the flow runs, and the steps must keep
 * sending what the user confirmed.
 */
export type ResolverRolesAction =
  | ResolverRolesSaveAction
  | ResolverRolesRemoveAction

/**
 * The prepared intent for a pending save, for the modal's pre-start gas
 * estimate. Returns `undefined` when the save can't be represented by a single
 * call: one that both grants and revokes submits two transactions under one
 * step, so it's estimated once each starts.
 */
export const prepareResolverRolesSaveIntent = (
  { resource, account, rolesToGrant, rolesToRevoke }: ResolverRolesSaveAction,
  resolverAddress: Address,
  { walletClient, chainId }: IntentContext,
): CustomTransactionIntent | undefined => {
  if (rolesToGrant.length > 0 && rolesToRevoke.length > 0) return undefined
  if (rolesToGrant.length > 0) {
    return prepareGrantResolverRolesTransaction({
      resolverAddress,
      account,
      scope: { type: 'root', roles: rolesToGrant },
      walletClient,
      chainId,
    })
  }
  if (rolesToRevoke.length > 0) {
    return prepareRevokeResolverRolesTransaction({
      resolverAddress,
      resource,
      account,
      roles: rolesToRevoke,
      walletClient,
      chainId,
    })
  }
  return undefined
}
