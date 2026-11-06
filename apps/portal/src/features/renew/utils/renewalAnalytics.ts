import type { Transaction } from '@/features/transaction-manager/types'
import { startAnalyticsOperation } from '@/lib/posthog/events'

/** Receipt-gated modal callbacks track batch progress without exposing transaction ids. */
export const createRenewalAnalytics = (
  itemCount: number,
  chainId: number,
  operation = startAnalyticsOperation(),
) => {
  const properties = { flow_id: crypto.randomUUID(), chain_id: chainId }
  let completed = new Set<string>()
  let isComplete = false
  operation.capture('renewal:flow_start', properties)
  operation.capture('renewal:step_view', { ...properties, step: 'review' })

  return {
    decorate: (transactions: readonly Transaction[]): Transaction[] =>
      transactions.map((transaction, index) => ({
        ...transaction,
        onStart: () => {
          operation.capture('renewal:step_view', {
            ...properties,
            step: 'execution',
          })
          return transaction.onStart()
        },
        onDone: () => {
          if (!completed.has(transaction.id)) {
            completed = new Set([...completed, transaction.id])
            operation.capture('renewal:step_result', {
              ...properties,
              step: 'execution',
              outcome: 'success',
              is_retryable: false,
            })
          }
          if (
            index === transactions.length - 1 &&
            !isComplete &&
            transactions.every((step) => completed.has(step.id))
          ) {
            isComplete = true
            operation.capture('renewal:flow_complete', {
              ...properties,
              item_count: itemCount,
            })
          }
          if (index < transactions.length - 1) {
            operation.capture('renewal:step_view', {
              ...properties,
              step: 'execution',
            })
          }
          return transaction.onDone()
        },
      })),
  }
}
