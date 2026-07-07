import type { Signer } from '@ens-apps/transaction-manager'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getWalletClient } from '@wagmi/core/actions'
import { useRef, useState } from 'react'
import type { Address, PublicClient, WalletClient } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getEnsTokenId } from '@/features/profile/hooks/useTokenId'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { getLabel } from '@/utils/token/getLabel'
import { resetNameRegistry } from '../helpers/resetNameRegistry'
import { resetNameResolver } from '../helpers/resetNameResolver'
import { transferToken } from '../helpers/transferToken'
import {
  buildTransferPlan,
  getTransferStepLabel,
  type TransferOptions,
  type TransferStepKind,
} from '../utils/buildTransferPlan'

type UseTransferNameParams = {
  readonly name: string
  readonly registryAddress: Address
  readonly owner: Address
}

export type StartTransferParams = {
  readonly recipient: Address
  readonly options: TransferOptions
}

type SavedParams = {
  readonly recipient: Address
  readonly tokenId: bigint
  readonly options: TransferOptions
}

const GAS_BY_STEP: Record<TransferStepKind, number> = {
  'reset-resolver': 0.0001,
  'reset-registry': 0.0001,
  'transfer-token': 0.0003,
}

const chainId = sepoliaWithEns.id

export const useTransferName = ({
  name,
  registryAddress,
  owner,
}: UseTransferNameParams) => {
  const config = useConfig()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { openModal, closeModal, clearTransaction } = useTransactionModal()

  const [savedParams, setSavedParams] = useState<SavedParams | null>(null)

  // `startedSteps` makes each step's `onStart` idempotent — both the modal UI and
  // the previous step's auto-fired `onDone` route into it (see
  // ConfigureRegistryForm for the same pattern).
  const startedStepsRef = useRef<Set<string>>(new Set())

  const getRuntime = async (): Promise<{
    walletClient: WalletClient
    publicClient: PublicClient
    signer: Signer
  }> => {
    const walletClient = await getWalletClient(config, { account: owner })
    if (!walletClient || !publicClient) throw new Error('No connected wallet')
    return { walletClient, publicClient, signer: createEOASigner(walletClient) }
  }

  const finishFlow = () => {
    closeModal()
    clearTransaction()
    setSavedParams(null)
    const invalidate = () =>
      queryClient.invalidateQueries({
        queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
      })
    void invalidate()
    pollForIndexerSync({ invalidateQueries: invalidate })
    void navigate({ to: '/$name/ownership', params: { name } })
  }

  // Prepares the flow: reads the token id up front (so a bad name fails before
  // the modal opens), then stores the plan and opens the modal. Loading and error
  // state come straight from the mutation — no manual bookkeeping.
  const prepareMutation = useMutation({
    mutationFn: async ({
      recipient,
      options,
    }: StartTransferParams): Promise<SavedParams> => {
      const tokenId = await getEnsTokenId({
        label: getLabel(name),
        registryAddress,
      }).match(
        (value) => value,
        (error) => {
          throw error
        },
      )
      return { recipient, tokenId, options }
    },
    onSuccess: (params) => {
      startedStepsRef.current = new Set()
      setSavedParams(params)
      openModal()
    },
  })

  const runStep = async (
    step: TransferStepKind,
    id: string,
    recipient: Address,
    tokenId: bigint,
  ): Promise<void> => {
    const { walletClient, publicClient: pc, signer } = await getRuntime()
    const common = { name, walletClient, publicClient: pc, signer, chainId }
    const label = getLabel(name)

    switch (step) {
      case 'reset-resolver': {
        await resetNameResolver({
          ...common,
          label,
          registryAddress,
          id,
        })
        return
      }
      case 'reset-registry': {
        await resetNameRegistry({
          ...common,
          label,
          registryAddress,
          id,
        })
        return
      }
      case 'transfer-token': {
        await transferToken({
          ...common,
          registryAddress,
          tokenId,
          recipient,
          id,
        })
        return
      }
    }
  }

  // Built fresh each render (like useRenewalTransactions) — the modal holds the
  // array in a ref for auto-advance, so referential stability isn't required.
  const buildTransactions = (): Transaction[] => {
    if (!savedParams) return []
    const { recipient, tokenId, options } = savedParams
    const steps = buildTransferPlan(options)

    // Idempotent runner per step: `onStart` may be invoked twice (modal UI +
    // the prior step's auto-advance `onDone`). Errors clear the guard so the
    // step can be retried; the tx error surfaces via the modal's machine state.
    const runners = steps.map((step) => async () => {
      const id = `transfer-${name}-${step}`
      if (startedStepsRef.current.has(id)) return
      startedStepsRef.current.add(id)
      try {
        await runStep(step, id, recipient, tokenId)
      } catch (err) {
        // Tx reverts surface via the modal's machine state. Non-tx failures
        // (e.g. the wallet resolving without a connected account) aren't tracked
        // there, so log them rather than swallow silently. Clearing the guard
        // allows a retry from the modal.
        console.error(`Transfer step "${step}" failed:`, err)
        startedStepsRef.current.delete(id)
      }
    })

    return steps.map((step, i) => ({
      id: `transfer-${name}-${step}`,
      title: getTransferStepLabel(step),
      transactionName: `${getTransferStepLabel(step)} - ${name}`,
      estimatedGasCost: GAS_BY_STEP[step],
      onStart: runners[i],
      onDone: i < runners.length - 1 ? runners[i + 1] : finishFlow,
    }))
  }

  const transactions = buildTransactions()

  return {
    startTransfer: prepareMutation.mutate,
    transactions,
    isPreparing: prepareMutation.isPending,
    prepError: prepareMutation.error,
  }
}
