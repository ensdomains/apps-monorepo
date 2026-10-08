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
import { prepareTransferV1NameTransaction } from '@/features/transfer/v1/writes'
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { getV1NameManagerQueryOptions } from '../queries/getV1NameManager'

/**
 * `BaseRegistrar.reclaim(tokenId, account)` — points the name's legacy-registry
 * slot back at its registrant, making them the manager again. The same call the
 * transfer flow's `reclaim` step sends, with the registrant as the recipient:
 * there it hands the role to the buyer before the token moves, here it takes it
 * back. Shared by the modal's gas estimate and the submit below.
 *
 * `name` is route-supplied so it is normalised here — the registrar's token id
 * is the label's hash, and an unnormalised spelling hashes to a different name.
 */
export const prepareReclaimManagerTransaction = ({
  name,
  account,
  ...intent
}: IntentContext & {
  readonly name: string
  /** Who the manager role goes to — the registrant reclaiming it. */
  readonly account: Address
}) =>
  prepareTransferV1NameTransaction({
    ...intent,
    name: normalize(name),
    recipient: account,
    contract: 'registrar',
    shouldReclaim: true,
  })

/**
 * Sends the single reclaim, then refreshes everything that reads the manager:
 * the Manager row, the V1 ownership shape the transfer gate runs on, and
 * `getEnsOwner` — which flattens an unwrapped 2LD to its *controller*, so it
 * changes here even though the ERC-721 hasn't moved.
 */
export const useReclaimManagerMutation = ({
  name,
  id,
}: {
  readonly name: string
  readonly id: string
}) => {
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  return useMutation({
    mutationFn: async () => {
      if (!walletClient?.account || !publicClient)
        throw new Error('Wallet not connected')

      return waitForTransaction(
        transactionManager.startTransaction(
          prepareReclaimManagerTransaction({
            name,
            account: walletClient.account.address,
            walletClient,
            chainId: sepoliaWithEns.id,
          }),
          createEOASigner(walletClient),
          {
            id,
            description: `Reclaim manager role - ${name}`,
            publicClient,
            chainId: sepoliaWithEns.id,
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
