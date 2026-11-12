import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Address } from 'viem'
import { normalize } from 'viem/ens'
import { usePublicClient, useWalletClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import type { IntentContext } from '@/features/transaction-manager/types'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import type { V1ManagerAuthority } from '@/features/transfer/v1/rules'
import {
  prepareSetV1RegistryOwnerTransaction,
  prepareTransferV1NameTransaction,
} from '@/features/transfer/v1/writes'
import { ensChain } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { getV1NameManagerQueryOptions } from '../queries/getV1NameManager'

/** The new manager, and the authority the connected wallet hands the role over with. */
export type V1ManagerChange = {
  readonly manager: Address
  readonly authority: V1ManagerAuthority
}

/**
 * `BaseRegistrar.reclaim` as registrant, `ENSRegistry.setOwner` as controller; the token never moves.
 *
 * `name` is route-supplied so it is normalised here — the registrar's token id
 * is the label's hash, and an unnormalised spelling hashes to a different name.
 */
export const prepareChangeManagerTransaction = ({
  name,
  manager,
  authority,
  ...intent
}: IntentContext & V1ManagerChange & { readonly name: string }) =>
  authority === 'registrant'
    ? prepareTransferV1NameTransaction({
        ...intent,
        name: normalize(name),
        recipient: manager,
        contract: 'registrar',
        shouldReclaim: true,
      })
    : prepareSetV1RegistryOwnerTransaction({
        ...intent,
        name: normalize(name),
        recipient: manager,
      })

/**
 * Sends the single manager change, then refreshes everything that reads the
 * manager: the Manager row, the V1 ownership shape the transfer gate runs on,
 * and `getEnsOwner` — which flattens an unwrapped 2LD to its *controller*, so
 * it changes here even though the ERC-721 hasn't moved.
 */
export const useChangeManagerMutation = ({
  name,
  id,
  description,
}: {
  readonly name: string
  readonly id: string
  readonly description: string
}) => {
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  return useMutation({
    mutationFn: async (change: V1ManagerChange) => {
      if (!walletClient?.account || !publicClient)
        throw new Error('Wallet not connected')

      return waitForTransaction(
        transactionManager.startTransaction(
          prepareChangeManagerTransaction({
            ...change,
            name,
            walletClient,
            chainId: ensChain.id,
          }),
          createEOASigner(walletClient),
          {
            id,
            description,
            publicClient,
            chainId: ensChain.id,
          },
        ),
      )
    },
    onSuccess: () => {
      const invalidate = () =>
        Promise.all(
          [
            getV1NameManagerQueryOptions({ name }).queryKey,
            getV1NameStateQueryOptions({ name }).queryKey,
            getEnsOwnerQueryOptions({ name }).queryKey,
          ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        ).then(() => undefined)

      void invalidate()
      pollForIndexerSync({ invalidateQueries: invalidate })
    },
  })
}
