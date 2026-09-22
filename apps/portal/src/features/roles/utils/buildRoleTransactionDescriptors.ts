/**
 * Pure function to build role transaction descriptors from pending save/remove state.
 *
 * Returns an array of descriptors (data only) that can be mapped to full
 * Transaction objects with onStart/onDone callbacks.
 */

import {
  type FlowScope,
  scopeTransactionId,
} from '@ens-apps/transaction-manager'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

const GRANT_ROLES_TX_ID = 'tx-grant-roles'
const REVOKE_ROLES_TX_ID = 'tx-revoke-roles'

export type PendingSave = {
  readonly account: Address
  readonly rolesToGrant: readonly Role[]
  readonly rolesToRevoke: readonly Role[]
}

export type PendingRemove = {
  readonly account: Address
  readonly roles: readonly Role[]
}

export type RoleTransactionDescriptor = {
  readonly id: string
  readonly title: string
  readonly transactionName: string
  readonly type: 'grant' | 'revoke'
  readonly account: Address
  readonly roles: readonly Role[]
}

/**
 * Builds an ordered array of transaction descriptors from pending save or remove state.
 *
 * For pending save:
 * - If roles to grant: adds grant descriptor
 * - If roles to revoke: adds revoke descriptor
 *
 * For pending remove:
 * - Adds single revoke descriptor
 *
 * `flowScope` names the attempt these descriptors belong to. Without one the
 * ids are fixed strings, so a second grant/revoke in the same session matches
 * the actor the first one left behind: the modal renders it as already done
 * and the wallet is never asked. Callers pass a scope built when they clear
 * the manager and open the modal.
 */
export function buildRoleTransactionDescriptors(
  pendingSave: PendingSave | null,
  pendingRemove: PendingRemove | null,
  name: string,
  flowScope?: FlowScope | null,
): readonly RoleTransactionDescriptor[] {
  const grantId = scopeTransactionId(GRANT_ROLES_TX_ID, flowScope)
  const revokeId = scopeTransactionId(REVOKE_ROLES_TX_ID, flowScope)

  if (pendingSave) {
    const {
      account,
      rolesToGrant: toGrant,
      rolesToRevoke: toRevoke,
    } = pendingSave
    const descriptors: RoleTransactionDescriptor[] = []

    if (toGrant.length > 0) {
      descriptors.push({
        id: grantId,
        title: 'Grant roles',
        transactionName: `Grant roles for ${truncateAddress(account, 6, 4)}`,
        type: 'grant',
        account,
        roles: toGrant,
      })
    }

    if (toRevoke.length > 0) {
      descriptors.push({
        id: revokeId,
        title: 'Revoke roles',
        transactionName: `Revoke roles for ${truncateAddress(account, 6, 4)}`,
        type: 'revoke',
        account,
        roles: toRevoke,
      })
    }

    return descriptors
  }

  if (pendingRemove) {
    const { account, roles } = pendingRemove
    return [
      {
        id: revokeId,
        title: 'Remove user',
        transactionName: `Remove ${truncateAddress(account, 6, 4)} from ${name}`,
        type: 'revoke',
        account,
        roles,
      },
    ]
  }

  return []
}
