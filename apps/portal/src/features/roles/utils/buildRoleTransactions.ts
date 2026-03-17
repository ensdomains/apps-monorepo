/**
 * Pure function to build full Transaction objects from pending save/remove state.
 *
 * Internally calls buildRoleTransactionDescriptors, then maps descriptors
 * to Transaction objects by attaching onStart/onDone from the provided handlers.
 * When a transaction has a next one in the chain, onDone triggers the next.
 */

import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import type { Transaction } from '@/features/transaction-manager/types'
import {
  buildRoleTransactionDescriptors,
  type PendingRemove,
  type PendingSave,
  type RoleTransactionDescriptor,
} from './buildRoleTransactionDescriptors'

export type RoleTransactionHandlers = {
  readonly grantRoles: (params: {
    readonly name: string
    readonly account: Address
    readonly roles: readonly Role[]
    readonly id: string
  }) => void
  readonly revokeRoles: (params: {
    readonly name: string
    readonly account: Address
    readonly roles: readonly Role[]
    readonly id: string
  }) => void
  readonly handleDone: () => void
}

/**
 * Builds full Transaction objects from pending save/remove state.
 *
 * Internally calls buildRoleTransactionDescriptors, then maps descriptors
 * to Transaction objects by attaching onStart/onDone from the handlers.
 * When a transaction has a next one in the chain, onDone triggers the next.
 */
export function buildRoleTransactions(
  pendingSave: PendingSave | null,
  pendingRemove: PendingRemove | null,
  name: string,
  handlers: RoleTransactionHandlers,
): readonly Transaction[] {
  const descriptors = buildRoleTransactionDescriptors(
    pendingSave,
    pendingRemove,
    name,
  )

  const { grantRoles, revokeRoles, handleDone } = handlers

  const runDescriptor = (d: RoleTransactionDescriptor) =>
    d.type === 'grant'
      ? grantRoles({ name, account: d.account, roles: d.roles, id: d.id })
      : revokeRoles({ name, account: d.account, roles: d.roles, id: d.id })

  return descriptors.map((descriptor, index) => {
    const nextDescriptor = descriptors[index + 1]
    return {
      id: descriptor.id,
      title: descriptor.title,
      transactionName: descriptor.transactionName,
      estimatedGasCost: descriptor.estimatedGasCost,
      onStart: () => runDescriptor(descriptor),
      onDone:
        nextDescriptor !== undefined
          ? () => runDescriptor(nextDescriptor)
          : handleDone,
    }
  })
}
