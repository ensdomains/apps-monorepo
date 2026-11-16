import {
  scopeTransactionId,
  transactionManager,
  useAtomicBatchSupport,
  useHasDeclinedAtomicUpgrade,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { useQueryClient } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { useActorRef, useSelector } from '@xstate/react'
import { useEffect, useRef } from 'react'
import type { Address } from 'viem'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import type { StateValueFrom } from 'xstate'
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
import { getRegistryUpdatePlanQueryOptions } from '../queries/getRegistryUpdatePlan'
import {
  type RegistryUpgradeRuntime,
  registryUpgradeMachine,
} from '../state/registryUpgrade.machine'
import {
  getRegistryUpdateDetails,
  type RegistryUpdateStep,
} from '../utils/registryUpdate'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'

const TX_ID_PREFIX = 'tx-registry-update'

export type RegistryUpgradeState = StateValueFrom<typeof registryUpgradeMachine>

const stepTitle = (
  step: RegistryUpdateStep,
  index: number,
  copySteps: number,
) =>
  step.kind === 'copy'
    ? `Copy subnames (${index + 1} of ${copySteps})`
    : 'Switch to the new registry'

/** Connects the registry upgrade machine to the wallet, the plan query and the transaction modal. */
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
  const hasDeclinedUpgrade = useHasDeclinedAtomicUpgrade(chainId)
  const attempt = useFlowAttempt()
  const { isOpen, closeModal, clearTransaction } = useTransactionModal()

  const idOf = (index: number) =>
    scopeTransactionId(`${TX_ID_PREFIX}-${name}-${index}`, attempt.scope)

  const intentFor = (from: Address, step: RegistryUpdateStep) => {
    const intents = step.calls.map((call) =>
      toEoaCustomIntent({ from, to: call.to, data: call.data, chainId }),
    )
    const [only] = intents
    return intents.length === 1 && only ? only : toEoaBatchIntent(intents)
  }

  const runtime: RegistryUpgradeRuntime = {
    plan: () => {
      if (!registryAddress || !parentRegistry || !account)
        return Promise.reject(new Error('The registry or wallet is not ready'))
      return queryClient.fetchQuery(
        getRegistryUpdatePlanQueryOptions({
          registryAddress,
          parent: {
            registry: parentRegistry,
            label: getNameLabels(name).currentLabel,
          },
          account,
        }),
      )
    },
    sendStep: async (step, index) => {
      const walletClient = await getWalletClient(config, { account })
      if (!walletClient.account || !publicClient)
        throw new Error('No connected wallet')
      const txId = transactionManager.startTransaction(
        intentFor(walletClient.account.address, step),
        createEOASigner(walletClient),
        {
          id: idOf(index),
          description: `Upgrade the registry of ${name}`,
          publicClient,
          chainId,
        },
      )
      await waitForTransaction(txId)
    },
    openFlow: () => {
      if (account) attempt.start(account)
    },
    closeFlow: () => {
      closeModal()
      clearTransaction()
      attempt.end()
    },
    finished: () => {
      const invalidate = () =>
        queryClient.invalidateQueries({
          queryKey: getNameRegistriesQueryOptions({ name }).queryKey,
        })
      void invalidate()
      pollForIndexerSync({ invalidateQueries: invalidate })
    },
  }
  // The machine keeps the runtime it started with; this one always reads the latest render.
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const actor = useActorRef(registryUpgradeMachine, {
    input: {
      runtime: {
        plan: () => runtimeRef.current.plan(),
        sendStep: (step, index) => runtimeRef.current.sendStep(step, index),
        openFlow: () => runtimeRef.current.openFlow(),
        closeFlow: () => runtimeRef.current.closeFlow(),
        finished: () => runtimeRef.current.finished(),
      },
    },
  })
  const state = useSelector(actor, (snapshot) => snapshot.value)
  const isInModal = useSelector(actor, (snapshot) => snapshot.hasTag('inModal'))
  const canStart = useSelector(actor, (snapshot) =>
    snapshot.hasTag('startable'),
  )
  const plan = useSelector(actor, (snapshot) => snapshot.context.plan)
  const failure = useSelector(actor, (snapshot) => snapshot.context.failure)
  const steps = useSelector(actor, (snapshot) => snapshot.context.steps)

  // Closing the modal part way leaves the copy where it is; the next start resumes it.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = isOpen
    if (wasOpen && !isOpen) actor.send({ type: 'CANCEL' })
  }, [actor, isOpen])

  const copySteps = steps.filter((step) => step.kind === 'copy').length
  const details = plan ? getRegistryUpdateDetails(plan) : []
  // The machine sends each step once the one before it lands; the modal only starts or retries the current one.
  const transactions: readonly Transaction[] = isInModal
    ? steps.map((step, index) => ({
        id: idOf(index),
        title: stepTitle(step, index, copySteps),
        transactionName: `Upgrade the registry of ${name}`,
        ...(index === 0 && details.length > 0 && { details }),
        intent: {
          prepare: ({ walletClient }) =>
            intentFor(walletClient.account.address, step),
        },
        onStart: () => actor.send({ type: 'SEND' }),
        onDone: () => {},
      }))
    : []

  return {
    start: () =>
      actor.send({
        type: 'START',
        canBatchAtomically: canBatchAtomically && !hasDeclinedUpgrade,
      }),
    state,
    canStart,
    failure,
    transactions,
  }
}
