import type { TransactionMachineState } from '@ens-apps/transaction-manager'

export const getProgressFraction = (
  statuses: readonly (TransactionMachineState | undefined)[],
): number => {
  if (statuses.length === 0) return 0
  if (statuses.every((status) => status === 'success')) return 1

  // Confirmation keeps the same boundary. Only starting the next transaction
  // advances the fill to the next gap, including across commit/reveal waits.
  const lastStartedIndex = statuses.findLastIndex(
    (status) => status !== undefined,
  )
  if (lastStartedIndex === -1) return 0

  return (lastStartedIndex + 0.5) / statuses.length
}
