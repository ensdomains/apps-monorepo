import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { errAsync, fromPromise } from 'neverthrow'
import type { WalletClient } from 'viem'
import {
  prepareSaveRecordsTransaction,
  type SaveRecordsTransactionParameters,
} from '../helpers/saveRecords'
import { transformPendingChangesToSetRecords } from '../helpers/transformPendingChanges'

class GetSaveRecordsIntentError extends TaggedError(
  'GetSaveRecordsIntentError',
)<{
  readonly cause: unknown
}> {}

type GetSaveRecordsIntentParameters = Readonly<
  Omit<SaveRecordsTransactionParameters, 'walletClient'>
> & {
  readonly walletClient: WalletClient | undefined
  readonly isOpen: boolean
  readonly changesCount: number
}

export const getSaveRecordsIntentQueryOptions = ({
  name,
  resolverAddress,
  originalRecords,
  pendingChanges,
  walletClient,
  chainId,
  isOpen,
  changesCount,
}: GetSaveRecordsIntentParameters) =>
  resultQueryOptions({
    // Preview and submission use the same encoder, and changes to the draft re-estimate gas.
    queryKey: [
      'save-records-intent',
      name,
      resolverAddress,
      walletClient?.account?.address,
      transformPendingChangesToSetRecords(originalRecords, pendingChanges),
    ],
    enabled:
      isOpen &&
      changesCount > 0 &&
      Boolean(walletClient?.account && walletClient.chain?.id === chainId),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: 2,
    queryFn: () => {
      if (!walletClient) {
        return errAsync(
          new GetSaveRecordsIntentError({
            cause: new Error('Wallet not connected'),
          }),
        )
      }
      return fromPromise(
        prepareSaveRecordsTransaction({
          name,
          resolverAddress,
          originalRecords,
          pendingChanges,
          walletClient,
          chainId,
        }),
        (cause) => new GetSaveRecordsIntentError({ cause }),
      )
    },
  })
