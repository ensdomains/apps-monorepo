import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import type { IntentContext } from '@/features/transaction-manager/types'
import type { ResolverRoleKey } from '@/lib/roles/resolverRoles'
import { prepareGrantResolverRolesTransaction } from './grantResolverRoles'
import { prepareRevokeResolverRolesTransaction } from './revokeResolverRoles'

/**
 * A pending resolver-roles edit awaiting confirmation in the sidebar. Both
 * carry the EAC resource the row's roles live on; grants are only possible on
 * the root resource (argument-scoped grants need the setter calldata, which the
 * sidebar does not reconstruct from a resource hash).
 */
export type ResolverRolesAction =
  | {
      readonly type: 'save'
      readonly resource: bigint
      readonly account: Address
      readonly rolesToGrant: ResolverRoleKey[]
      readonly rolesToRevoke: ResolverRoleKey[]
    }
  | {
      readonly type: 'remove'
      readonly resource: bigint
      readonly account: Address
      readonly roles: readonly ResolverRoleKey[]
    }

/**
 * The prepared intent for a pending resolver-roles action, for the modal's
 * pre-start gas estimate. Returns `undefined` when the action can't be
 * represented by a single call — a "save" that both grants and revokes submits
 * two transactions under one step, so it's estimated once each starts.
 */
export const prepareResolverRolesIntent = (
  action: ResolverRolesAction,
  resolverAddress: Address,
  { walletClient, chainId }: IntentContext,
): CustomTransactionIntent | undefined =>
  match(action)
    .with({ type: 'remove' }, ({ resource, account, roles }) =>
      prepareRevokeResolverRolesTransaction({
        resolverAddress,
        resource,
        account,
        roles,
        walletClient,
        chainId,
      }),
    )
    .with(
      { type: 'save' },
      ({ resource, account, rolesToGrant, rolesToRevoke }) => {
        if (rolesToGrant.length > 0 && rolesToRevoke.length > 0)
          return undefined
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
      },
    )
    .exhaustive()
