import { transactionManager } from '@ens-apps/transaction-manager'
import { createAnalyticsFlowId } from '@ens-apps/utils/posthog/flowId'
import { startAnalyticsOperation } from '@/lib/posthog/events'
import { observeTransactionReceipt } from '@/utils/observeTransactionReceipt'

type StartTransaction = typeof transactionManager.startTransaction
type TransactionIdentity =
  | NonNullable<ReturnType<typeof transactionManager.getTransaction>>
  | string
export type RenewalTransactionStarter = (
  stage: 'approval' | 'execution',
  transactionCount: number,
  ...args: Parameters<StartTransaction>
) => ReturnType<StartTransaction>

/** Observe the actual transaction actor; modal dismissal never determines success. */
export const createRenewalAnalytics = (
  itemCount: number,
  chainId: number,
  operation = startAnalyticsOperation(),
): { readonly startTransaction: RenewalTransactionStarter } => {
  const flowId = createAnalyticsFlowId()
  if (!flowId)
    return {
      startTransaction: (_stage, _count, ...args) =>
        transactionManager.startTransaction(...args),
    }
  const properties = { flow_id: flowId, chain_id: chainId }
  let completed: ReadonlySet<string> = new Set()
  let pending: ReadonlyMap<string, TransactionIdentity> = new Map()
  let attempted: ReadonlySet<string> = new Set()
  let isComplete = false
  operation.capture('renewal:flow_start', properties)

  return {
    startTransaction: (stage, transactionCount, ...args) => {
      const txId = transactionManager.startTransaction(...args)
      const identity = transactionManager.getTransaction?.(txId) ?? txId
      if (pending.get(txId) === identity || completed.has(txId)) return txId
      if (attempted.has(txId))
        operation.capture('renewal:flow_retry', properties)
      attempted = new Set([...attempted, txId])
      pending = new Map([...pending, [txId, identity]])
      operation.capture('renewal:stage_enter', { ...properties, stage })
      observeTransactionReceipt(txId, (outcome) => {
        if (pending.get(txId) !== identity) return
        pending = new Map([...pending].filter(([id]) => id !== txId))
        if (outcome.status === 'unobserved') return
        if (
          outcome.status === 'failed' ||
          outcome.receipt.status !== 'success'
        ) {
          operation.capture('renewal:stage_fail', {
            ...properties,
            stage,
            is_retryable: true,
          })
          return
        }
        completed = new Set([...completed, txId])
        operation.capture('renewal:transaction_confirm', {
          ...properties,
          stage,
        })
        if (completed.size === transactionCount && !isComplete) {
          isComplete = true
          operation.capture('renewal:flow_complete', {
            ...properties,
            item_count: itemCount,
          })
        }
      })
      return txId
    },
  }
}
