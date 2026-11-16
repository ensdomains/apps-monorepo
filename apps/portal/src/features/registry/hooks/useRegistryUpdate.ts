import {
  scopeTransactionId,
  transactionManager,
  useAtomicBatchSupport,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { useQueryClient } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { fromPromise } from 'neverthrow'
import { useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getNameLabels } from '@/features/registry/utils/nameUtils'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  toEoaBatchIntent,
  toEoaCustomIntent,
} from '@/features/transaction-manager/helpers/intents'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { ensChain } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import {
  getRegistryUpdatePlanQueryOptions,
  type RegistryUpdatePlan,
} from '../queries/getRegistryUpdatePlan'
import {
  getRegistryUpdateDetails,
  getRegistryUpdateSteps,
  type RegistryUpdateStep,
} from '../utils/registryUpdate'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'

const TX_ID_PREFIX = 'tx-registry-update'

export type RegistryUpdateStatus =
  | { readonly type: 'idle' }
  | { readonly type: 'planning' }
  | { readonly type: 'running'; readonly plan: RegistryUpdatePlan }
  /** The plan couldn't be read or built; nothing was sent. */
  | { readonly type: 'plan-failed' }
  /** The copy stopped before it matched; starting again resumes it. */
  | { readonly type: 'incomplete' }

const nowInSeconds = () => BigInt(Math.floor(Date.now() / 1000))

const stepTitle = (
  step: RegistryUpdateStep,
  index: number,
  copySteps: number,
) =>
  step.kind === 'copy'
    ? `Copy subnames (${index + 1} of ${copySteps})`
    : 'Switch to the new registry'

/** Copies a registry that needs an update into a replacement, then points the name at it. */
export const useRegistryUpdate = ({
  name,
  registryAddress,
  parentRegistry,
}: {
  readonly name: string
  readonly registryAddress: Address | undefined
  readonly parentRegistry: Address | undefined
}) => {
  const config = useConfig()
  const queryClient = useQueryClient()
  const publicClient = usePublicClient()
  const { address: account } = useConnection()
  const chainId = ensChain.id
  const canBatchAtomically = useAtomicBatchSupport(chainId)
  const attempt = useFlowAttempt()
  const { isOpen, closeModal, clearTransaction } = useTransactionModal()

  const [status, setStatus] = useState<RegistryUpdateStatus>({ type: 'idle' })
  const [steps, setSteps] = useState<readonly RegistryUpdateStep[]>([])
  // The modal's auto-advance and an "Open wallet" click can both start a step.
  const inFlightRef = useRef<Set<string>>(new Set())

  const fetchPlan = () =>
    registryAddress && parentRegistry && account
      ? fromPromise(
          queryClient.fetchQuery(
            getRegistryUpdatePlanQueryOptions({
              registryAddress,
              parent: {
                registry: parentRegistry,
                label: getNameLabels(name).currentLabel,
              },
              account,
              now: nowInSeconds(),
            }),
          ),
          (error) => error,
        )
      : null

  const start = async () => {
    const planning = fetchPlan()
    if (!planning || !account) return
    setStatus({ type: 'planning' })
    const result = await planning
    if (result.isErr()) {
      setStatus({ type: 'plan-failed' })
      return
    }
    inFlightRef.current = new Set()
    setSteps(
      getRegistryUpdateSteps({ plan: result.value.plan, canBatchAtomically }),
    )
    setStatus({ type: 'running', plan: result.value })
    attempt.start(account)
  }

  const intentFor = (from: Address, step: RegistryUpdateStep) => {
    const intents = step.calls.map((call) =>
      toEoaCustomIntent({ from, to: call.to, data: call.data, chainId }),
    )
    const [only] = intents
    return intents.length === 1 && only ? only : toEoaBatchIntent(intents)
  }

  const submit = async (step: RegistryUpdateStep, id: string) => {
    const walletClient = await getWalletClient(config, { account })
    if (!walletClient.account || !publicClient) return
    const txId = transactionManager.startTransaction(
      intentFor(walletClient.account.address, step),
      createEOASigner(walletClient),
      {
        id,
        description: `Upgrade the registry of ${name}`,
        publicClient,
        chainId,
      },
    )
    await waitForTransaction(txId)
  }

  // A failed step surfaces in the modal; clearing the guard lets it be retried.
  const send = async (step: RegistryUpdateStep, id: string) => {
    if (inFlightRef.current.has(id)) return
    inFlightRef.current.add(id)
    const result = await fromPromise(submit(step, id), (error) => error)
    if (result.isErr()) inFlightRef.current.delete(id)
  }

  const end = (next: RegistryUpdateStatus) => {
    closeModal()
    clearTransaction()
    attempt.end()
    setSteps([])
    setStatus(next)
  }

  const finish = () => {
    end({ type: 'idle' })
    const invalidate = () =>
      queryClient.invalidateQueries({
        queryKey: getNameRegistriesQueryOptions({ name }).queryKey,
      })
    void invalidate()
    pollForIndexerSync({ invalidateQueries: invalidate })
  }

  // Before each finishing step, re-read both registries and the name: the copy must be whole and the name still on this registry.
  const checkThenSend = async (next: RegistryUpdateStep, id: string) => {
    const planning = fetchPlan()
    const result = planning ? await planning : null
    if (!result || result.isErr()) {
      end({ type: 'plan-failed' })
      return
    }
    if (result.value.plan.copyCalls.length > 0) {
      end({ type: 'incomplete' })
      return
    }
    await send(next, id)
  }

  // Closing the modal part way leaves the copy where it is; the next start resumes it.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = isOpen
    if (!wasOpen || isOpen) return
    setSteps([])
    setStatus((current) =>
      current.type === 'running' ? { type: 'idle' } : current,
    )
  }, [isOpen])

  const idOf = (index: number) =>
    scopeTransactionId(`${TX_ID_PREFIX}-${name}-${index}`, attempt.scope)
  const copySteps = steps.filter((step) => step.kind === 'copy').length
  const details =
    status.type === 'running' ? getRegistryUpdateDetails(status.plan) : []

  const transactions: readonly Transaction[] = steps.map((step, index) => {
    const next = steps[index + 1]
    const id = idOf(index)
    return {
      id,
      title: stepTitle(step, index, copySteps),
      transactionName: `Upgrade the registry of ${name}`,
      ...(index === 0 && details.length > 0 && { details }),
      intent: {
        prepare: ({ walletClient }) =>
          intentFor(walletClient.account.address, step),
      },
      onStart: () => {
        void send(step, id)
      },
      onDone: next
        ? () => {
            const nextId = idOf(index + 1)
            void (next.kind === 'finish'
              ? checkThenSend(next, nextId)
              : send(next, nextId))
          }
        : finish,
    }
  })

  return { start, status, transactions }
}
