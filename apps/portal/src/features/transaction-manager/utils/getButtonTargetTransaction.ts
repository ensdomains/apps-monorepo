import type { TransactionMachineState } from '@ens-apps/transaction-manager'
import type { Transaction } from '../types'

/**
 * The step the modal's primary button acts on: the next step once the active
 * one has succeeded, otherwise the active step itself. Callers use it to gate
 * the button on that step's `waitUntil` cooldown.
 */
export const getButtonTargetTransaction = (
  transactions: readonly Transaction[],
  activeIndex: number,
  activeStatus: TransactionMachineState | undefined,
): Transaction | undefined =>
  activeStatus === 'success'
    ? transactions[activeIndex + 1]
    : transactions[activeIndex]
