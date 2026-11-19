import { verifyStandaloneHca } from '@ens-apps/smart-account'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { errAsync, fromPromise } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { isRecordImageOwner } from '../helpers/recordImageUpload'

class RecordImageHcaError extends TaggedError('RecordImageHcaError')<{
  cause: unknown
}> {}

type RecordImageHcaParameters = {
  readonly owner: Address
  readonly address: Address
  readonly chainId: number
}

const recordImageHcaQueryKey = createQueryKey<
  'record-image-hca',
  RecordImageHcaParameters
>('record-image-hca')

const getRecordImageHca = (
  { owner, address, chainId }: RecordImageHcaParameters,
  publicClient: PublicClient | undefined,
) => {
  if (publicClient?.chain?.id !== chainId) {
    return errAsync(
      new RecordImageHcaError({
        cause: new Error('ENS network client is unavailable.'),
      }),
    )
  }

  return fromPromise(
    verifyStandaloneHca({
      publicClient,
      hca: owner,
      expectedOwner: address,
      chainId,
    }),
    (cause) => new RecordImageHcaError({ cause }),
  ).map(() => ({ owner, signer: address }))
}

export const getRecordImageHcaQueryOptions = (
  params: RecordImageHcaParameters,
  publicClient: PublicClient | undefined,
) =>
  resultQueryOptions({
    queryKey: recordImageHcaQueryKey(params),
    queryFn: ({ queryKey: [, params] }) =>
      getRecordImageHca(params, publicClient),
    enabled:
      publicClient?.chain?.id === params.chainId && !isRecordImageOwner(params),
    retry: false,
  })
