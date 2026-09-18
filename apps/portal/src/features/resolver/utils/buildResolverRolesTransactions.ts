import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import type { Transaction } from '@/features/transaction-manager/types'
import type { ResolverRevocation } from '@/lib/roles/resolverRoles'
import {
  prepareResolverRolesSaveIntent,
  type ResolverRolesAction,
  type ResolverRolesSaveAction,
} from '../helpers/prepareResolverRolesIntent'
import { prepareRevokeResolverRolesTransaction } from '../helpers/revokeResolverRoles'

export const SAVE_RESOLVER_ROLES_TX_ID = 'tx-save-resolver-roles'

/** One step per resource, so each step's id names the grant it revokes. */
export const removeResolverUserTxId = (account: Address, resource: bigint) =>
  `tx-remove-resolver-user:${account.toLowerCase()}:${resource}`

export type ResolverRolesTransactionHandlers = {
  readonly save: (action: ResolverRolesSaveAction) => void
  readonly revoke: (params: {
    readonly account: Address
    readonly revocation: ResolverRevocation
    readonly id: string
  }) => void
  /** Runs after the last step. */
  readonly done: () => void
}

/**
 * The modal steps for a pending sidebar action. A save is one step. A removal
 * is one revoke per resource the account holds, chained so each step's
 * `onDone` starts the next.
 */
export const buildResolverRolesTransactions = (
  action: ResolverRolesAction | null,
  resolverAddress: Address,
  handlers: ResolverRolesTransactionHandlers,
): readonly Transaction[] =>
  match(action)
    .returnType<readonly Transaction[]>()
    .with(P.nullish, () => [])
    .with({ type: 'save' }, (save) => [
      {
        id: SAVE_RESOLVER_ROLES_TX_ID,
        title: 'Save resolver role changes',
        transactionName: `Update roles for ${save.account} on ${save.resourceLabel}`,
        intent: {
          prepare: (ctx) =>
            prepareResolverRolesSaveIntent(save, resolverAddress, ctx),
        },
        onStart: () => handlers.save(save),
        onDone: handlers.done,
      },
    ])
    .with({ type: 'remove' }, ({ account, revocations }) => {
      const steps = revocations.map((revocation) => ({
        revocation,
        id: removeResolverUserTxId(account, revocation.resource),
      }))
      const run = (step: (typeof steps)[number]) =>
        handlers.revoke({ account, revocation: step.revocation, id: step.id })

      return steps.map((step, index): Transaction => {
        const next = steps[index + 1]
        return {
          id: step.id,
          title: `Remove roles on ${step.revocation.resourceLabel}`,
          transactionName: `Revoke every role ${account} holds on ${step.revocation.resourceLabel}`,
          intent: {
            prepare: ({ walletClient, chainId }) =>
              prepareRevokeResolverRolesTransaction({
                resolverAddress,
                resource: step.revocation.resource,
                account,
                roles: step.revocation.roles,
                walletClient,
                chainId,
              }),
          },
          onStart: () => run(step),
          onDone: next ? () => run(next) : handlers.done,
        }
      })
    })
    .exhaustive()
