import type { TransactionMachineActor } from '@ens-apps/transaction-manager'
import type { Transaction } from '../types'
import { getStatus } from './getStatus'

/**
 * Whether a step's `waitUntil` countdown should be visible: the wait is still
 * ahead and the step has not started.
 *
 * Earlier steps do not hide it. The wait runs on its own clock (a commit-reveal
 * window counts from the commit), so hiding it while an earlier step finishes
 * only makes it appear partway through. The caller decides when a step has a
 * wait at all.
 */
export const shouldShowWaitCountdown = (
  transaction: Transaction,
  activeTransactionsMap: Map<string, TransactionMachineActor>,
): boolean =>
  !!transaction.waitUntil &&
  transaction.waitUntil > Date.now() &&
  getStatus(transaction.id, activeTransactionsMap) === undefined
