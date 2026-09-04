import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { resultMutationOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getWalletClient } from '@wagmi/core/actions'
import { fromPromise, ok } from 'neverthrow'
import { useRef, useState } from 'react'
import type { Address } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { getSubnamesQueryOptions } from '@/features/profile/hooks/useSubnames'
import { getEnsTokenId } from '@/features/profile/hooks/useTokenId'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getParentName, is2LD } from '@/utils/ens/tldHelpers'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { getLabel } from '@/utils/token/getLabel'
import type { WalletClientWithAccount } from '@/utils/types'
import { getEthAddressQueryOptions } from '../queries/getEthAddress'
import {
  type GetOwnResolverError,
  getOwnResolverQueryOptions,
} from '../queries/getOwnResolver'
import type { TransferSubject } from '../types'
import {
  buildTransferPlan,
  STEP_LABELS,
  type TransferOptions,
} from '../utils/buildTransferPlan'
import { buildTransferStepIntent } from '../utils/buildTransferStepIntent'
import {
  type GetV1NameStateError,
  getV1NameStateQueryOptions,
} from '../v1/getV1NameState'

export type StartTransferParams = {
  readonly recipient: Address
  readonly options: TransferOptions
}

type SavedParams = StartTransferParams & {
  /** V2 only — the versioned ERC-1155 id. Null for V1 subjects. */
  readonly tokenId: bigint | null
  /** The name's own resolver, or null if it has none. */
  readonly resolverAddress: Address | null
}

export type TransferControls = {
  readonly startTransfer: (params: StartTransferParams) => void
  readonly transactions: Transaction[]
  readonly isPreparing: boolean
  readonly prepError: Error | null
}

const chainId = sepoliaWithEns.id

/**
 * Runs a transfer plan through the transaction modal, one step per transaction.
 * Every step's calldata comes from `buildTransferStepIntent`, shared between the
 * modal's gas estimate and the submit so the two can't drift.
 */
export const useTransferName = ({
  name,
  account,
  subject,
}: {
  readonly name: string
  /** The connected wallet doing the sending. */
  readonly account: Address
  readonly subject: TransferSubject
}): TransferControls => {
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

  const finishFlow = () => {
    closeModal()
    clearTransaction()
    setSavedParams(null)
    // The parent's subname table lists this name's owner, so it goes stale too.
    // Only relevant below the TLD — a 2LD's "parent" is `eth`, which has no
    // subname listing of its own in the app.
    const parentName = is2LD(name) ? null : getParentName(name)
    const invalidate = () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: getV1NameStateQueryOptions({ name }).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: getPrimaryNameQueryOptions(account).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: getEthAddressQueryOptions(name).queryKey,
        }),
        ...(parentName
          ? [
              queryClient.invalidateQueries({
                queryKey: getSubnamesQueryOptions({
                  name: parentName,
                  protocolVersion: subject.kind === 'v2' ? 'ENSv2' : 'ENSv1',
                }).queryKey,
              }),
            ]
          : []),
      ]).then(() => undefined)
    void invalidate()
    pollForIndexerSync({ invalidateQueries: invalidate })
    void navigate({ to: '/$name/ownership', params: { name } })
  }

  // Prepares the flow: reads the name's own resolver and (V2) token id up front,
  // so a bad name fails before the modal opens and every step's intent can be
  // built synchronously for the gas estimate. Then stores the plan and opens
  // the modal. Loading and error state come straight from the mutation.
  const prepareMutation = useMutation(
    resultMutationOptions({
      mutationFn: ({ recipient, options }: StartTransferParams) =>
        fromPromise(
          subject.kind === 'v2'
            ? queryClient.fetchQuery(
                getOwnResolverQueryOptions({
                  label: getLabel(name),
                  registryAddress: subject.registryAddress,
                }),
              )
            : queryClient
                .fetchQuery(getV1NameStateQueryOptions({ name }))
                .then((state) => state?.resolverAddress ?? null),
          (e) => e as GetOwnResolverError | GetV1NameStateError,
        ).andThen((resolverAddress) =>
          subject.kind === 'v2'
            ? getEnsTokenId({
                label: getLabel(name),
                registryAddress: subject.registryAddress,
              }).map(
                (tokenId): SavedParams => ({
                  recipient,
                  options,
                  tokenId,
                  resolverAddress,
                }),
              )
            : ok<SavedParams>({
                recipient,
                options,
                tokenId: null,
                resolverAddress,
              }),
        ),
      onSuccess: (params) => {
        startedStepsRef.current = new Set()
        setSavedParams(params)
        openModal()
      },
    }),
  )

  // Built fresh each render (like useRenewalTransactions) — the modal holds the
  // array in a ref for auto-advance, so referential stability isn't required.
  const buildTransactions = (): Transaction[] => {
    if (!savedParams) return []
    const steps = buildTransferPlan(savedParams.options, subject.kind)
    const stepContext = { ...savedParams, name, subject }

    // Idempotent runner per step: `onStart` may be invoked twice (modal UI +
    // the prior step's auto-advance `onDone`). Errors clear the guard so the
    // step can be retried; the tx error surfaces via the modal's machine state.
    const runners = steps.map((step) => async () => {
      const id = `transfer-${name}-${step}`
      if (startedStepsRef.current.has(id)) return
      startedStepsRef.current.add(id)
      try {
        const walletClient = await getWalletClient(config, { account })
        if (!walletClient?.account || !publicClient)
          throw new Error('No connected wallet')
        const txId = transactionManager.startTransaction(
          buildTransferStepIntent(step, {
            ...stepContext,
            walletClient: walletClient as WalletClientWithAccount,
            chainId,
          }),
          createEOASigner(walletClient),
          {
            id,
            description: `${STEP_LABELS[step]} - ${name}`,
            publicClient,
            timeout: 120_000,
          },
        )
        await waitForTransaction(txId)
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
      title: STEP_LABELS[step],
      transactionName: `${STEP_LABELS[step]} - ${name}`,
      // Same builder as the submit path, so the modal's live gas estimate is
      // for exactly the call that will be sent.
      intent: {
        prepare: (ctx) =>
          buildTransferStepIntent(step, { ...stepContext, ...ctx }),
      },
      onStart: runners[i],
      onDone: i < runners.length - 1 ? runners[i + 1] : finishFlow,
    }))
  }

  return {
    startTransfer: prepareMutation.mutate,
    transactions: buildTransactions(),
    isPreparing: prepareMutation.isPending,
    prepError: prepareMutation.error,
  }
}
