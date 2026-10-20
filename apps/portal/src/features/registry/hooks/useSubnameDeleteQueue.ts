import {
  type CustomTransactionIntent,
  type FlowScope,
  scopeTransactionId,
} from '@ens-apps/transaction-manager'
import { fromPromise } from 'neverthrow'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import type { SubnameRow } from '@/features/names/components/SubnamesTable'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type {
  IntentContext,
  Transaction,
} from '@/features/transaction-manager/types'

const DELETE_SUBNAME_TX_ID_PREFIX = 'tx-delete-ens-subname'

/** One transaction of a row's delete. Most rows take one; some take two. */
export type SubnameDeleteStepSpec = {
  readonly title: string
  readonly transactionName: string
  /** The call, for the modal's estimate; omitted when it can only be built once the step before has landed. */
  readonly prepare?: (ctx: IntentContext) => CustomTransactionIntent | undefined
}

export type SubnameDeleteStep = SubnameDeleteStepSpec & {
  readonly row: SubnameRow
  readonly index: number
  readonly isLastForRow: boolean
}

const stepTxId = (
  { row, index, isLastForRow }: SubnameDeleteStep,
  scope: FlowScope | null,
) =>
  scopeTransactionId(
    index === 0 && isLastForRow
      ? `${DELETE_SUBNAME_TX_ID_PREFIX}-${row.name}`
      : `${DELETE_SUBNAME_TX_ID_PREFIX}-${row.name}-${index}`,
    scope,
  )

const withName = (names: ReadonlySet<string>, name: string) =>
  names.has(name) ? names : new Set(names).add(name)

const withoutNames = (
  names: ReadonlySet<string>,
  removed: Iterable<string>,
) => {
  const next = new Set(names)
  let changed = false
  for (const name of removed) changed = next.delete(name) || changed
  return changed ? next : names
}

interface UseSubnameDeleteQueueParams {
  readonly connectedAccount: Address | undefined
  /** Every subname the indexer still serves, to drop rows hidden after their delete. */
  readonly servedNames: readonly string[] | undefined
  /** A row's delete transactions; none when it cannot be deleted. */
  readonly stepsFor: (row: SubnameRow) => readonly SubnameDeleteStepSpec[]
  /** Signs and waits for one step. Rejects when it fails or is refused. */
  readonly runStep: (step: SubnameDeleteStep, id: string) => Promise<unknown>
}

/**
 * The delete queue behind a subnames table: the rows queued for the modal,
 * the rows dimmed while their transactions run, and the rows hidden once
 * deleted until the indexer stops serving them.
 */
export const useSubnameDeleteQueue = ({
  connectedAccount,
  servedNames,
  stepsFor,
  runStep,
}: UseSubnameDeleteQueueParams) => {
  const {
    isOpen: isTransactionModalOpen,
    closeModal: closeTransactionModal,
    clearTransaction,
  } = useTransactionModal()

  // Names the attempt the modal is showing. A bulk delete queues several steps
  // under one attempt, so an abandoned run cannot hand its finished actors to
  // the next one and skip straight to the last subname.
  const attempt = useFlowAttempt()

  const [queuedSteps, setQueuedSteps] = useState<readonly SubnameDeleteStep[]>(
    [],
  )
  // Names whose delete is in flight, dimmed in the table. Queued names are
  // marked up front so every row dims at once, not just the one being signed.
  const [pendingNames, setPendingNames] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  // Names whose delete already succeeded, hidden before the indexer catches up.
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<
    ReadonlySet<string>
  >(() => new Set())

  // Steps whose run is in flight. The modal's auto-advance and the user's
  // "Open wallet" click can both start the same step; the second is a no-op.
  const inFlightRef = useRef<Set<string>>(new Set())

  const run = useCallback(
    async (step: SubnameDeleteStep, id: string) => {
      if (inFlightRef.current.has(id)) return
      inFlightRef.current.add(id)
      const { name } = step.row
      setPendingNames((prev) => withName(prev, name))

      const result = await fromPromise(runStep(step, id), (error) => error)

      if (result.isErr() || step.isLastForRow) {
        setPendingNames((prev) => withoutNames(prev, [name]))
      }
      if (result.isOk() && step.isLastForRow) {
        setOptimisticallyDeleted((prev) => withName(prev, name))
      }
      inFlightRef.current.delete(id)
    },
    [runStep],
  )

  const queue = useCallback(
    (rows: readonly SubnameRow[]) => {
      const steps = rows.flatMap((row) => {
        const specs = stepsFor(row)
        return specs.map(
          (spec, index): SubnameDeleteStep => ({
            ...spec,
            row,
            index,
            isLastForRow: index === specs.length - 1,
          }),
        )
      })
      if (steps.length === 0) return
      setQueuedSteps(steps)
      setPendingNames((prev) => {
        const next = new Set(prev)
        for (const step of steps) next.add(step.row.name)
        return next
      })
      if (connectedAccount) attempt.start(connectedAccount)
    },
    [attempt, connectedAccount, stepsFor],
  )

  // The modal walks the steps top to bottom; each onDone starts the next, so
  // the wallet prompts follow one another without a "Next" click between them.
  const transactions: readonly Transaction[] = queuedSteps.map((step, i) => {
    const id = stepTxId(step, attempt.scope)
    const next = queuedSteps[i + 1]
    return {
      id,
      title: step.title,
      transactionName: step.transactionName,
      ...(step.prepare && { intent: { prepare: step.prepare } }),
      onStart: () => {
        void run(step, id)
      },
      onDone: next
        ? () => {
            void run(next, stepTxId(next, attempt.scope))
          }
        : () => {
            closeTransactionModal()
            clearTransaction()
            attempt.end()
            setQueuedSteps([])
          },
    }
  })

  // When the modal closes, drop the queue and undim the names that never started.
  useEffect(() => {
    if (isTransactionModalOpen) return
    if (queuedSteps.length === 0) return
    const queuedNames = queuedSteps.map((step) => step.row.name)
    setQueuedSteps([])
    setPendingNames((prev) => withoutNames(prev, queuedNames))
  }, [isTransactionModalOpen, queuedSteps])

  // Once the indexer stops serving a deleted name, the local override can go.
  useEffect(() => {
    if (!servedNames) return
    const served = new Set(servedNames)
    setOptimisticallyDeleted((prev) =>
      withoutNames(
        prev,
        [...prev].filter((name) => !served.has(name)),
      ),
    )
  }, [servedNames])

  return { queue, transactions, pendingNames, optimisticallyDeleted }
}
