import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ResultAsync } from 'neverthrow'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { ensChain } from '@/lib/wagmi'
import { prepareDeleteV1SubnameSubmit } from '../helpers/prepareDeleteV1SubnameSubmit'
import {
  prepareDeleteV1SubnameTransactions,
  type V1SubnameDelete,
} from '../utils/delete-v1-subname.helpers'
import { refreshSubnameQueries } from '../utils/refreshSubnameQueries'

/**
 * V1 subname deletes: `check` re-reads every queued subname on-chain before the
 * modal opens, since the table's rows come from the indexer; `deleteStepAsync`
 * sends one transaction of a delete.
 */
export const useDeleteV1Subname = ({ name }: { readonly name: string }) => {
  const chainId = ensChain.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })
  const queryClient = useQueryClient()

  const check = useMutation({
    mutationFn: async (deletes: readonly V1SubnameDelete[]) => {
      const account = walletClient?.account?.address
      if (!account) throw new Error('Wallet not connected')
      const checked = await ResultAsync.combine(
        deletes.map(({ labelhash, labelName, target }) =>
          prepareDeleteV1SubnameSubmit({
            parentName: name,
            labelhash,
            labelName,
            account,
            target,
          }),
        ),
      )
      if (checked.isErr()) throw checked.error
      return deletes
    },
  })

  const step = useMutation({
    mutationFn: async ({
      stepIndex,
      id,
      ...entry
    }: V1SubnameDelete & {
      /** Which of the target's transactions to send. */
      readonly stepIndex: number
      readonly id: string
    }) => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }
      const intents = prepareDeleteV1SubnameTransactions({
        ...entry,
        parentName: name,
        walletClient,
        chainId,
      })
      const intent = intents[stepIndex]
      if (!intent) throw new Error('No such delete step')

      const txId = transactionManager.startTransaction(
        intent,
        createEOASigner(walletClient),
        {
          id,
          description: `Delete subname ${entry.subname}`,
          publicClient,
          chainId,
        },
      )
      const result = await waitForTransaction(txId)
      return { hash: result.hash, isLastStep: stepIndex === intents.length - 1 }
    },
    onSuccess: ({ isLastStep }) => {
      if (isLastStep) {
        refreshSubnameQueries(queryClient, { name, protocolVersion: 'ENSv1' })
      }
    },
  })

  return {
    checkAsync: check.mutateAsync,
    isChecking: check.isPending,
    deleteStepAsync: step.mutateAsync,
    isDeleting: step.isPending,
    error: check.error ?? step.error,
  }
}
