import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetOwnerErrorType as ensjsv1_GetOwnerErrorType } from '@ensdomains/ensjs/public/v1'
import type {
  GetOwnerErrorType as ensjsv2_GetOwnerErrorType,
  GetNameRegistryAddressErrorType,
} from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  type ResolvedEnsOwner,
  resolveEnsOwner,
} from '@/utils/ens/resolveEnsOwner'

class NameRequiredError extends TaggedError('NameRequiredError')<{
  message: 'Name is required'
}> {}

export class GetEnsOwnerError extends TaggedError('GetEnsOwnerError')<{
  cause:
    | ensjsv1_GetOwnerErrorType
    | ensjsv2_GetOwnerErrorType
    | GetNameRegistryAddressErrorType
    | NameRequiredError
}> {}

export type GetEnsOwnerReturnType = ResolvedEnsOwner

type GetEnsOwnerParameters = {
  name: string | undefined
}

export const getEnsOwner = ResultFn(async function* ({
  name,
}: GetEnsOwnerParameters) {
  const client = yield* safeGetClient()

  if (!name) {
    return err(
      new GetEnsOwnerError({
        cause: new NameRequiredError({ message: 'Name is required' }),
      }),
    )
  }

  // Shared traversal: V2 (.eth only, walking down to the leaf's subregistry)
  // then V1 fallback. See resolveEnsOwner for details.
  const result = yield* fromPromise(
    resolveEnsOwner(client, name),
    (e) =>
      new GetEnsOwnerError({
        cause: e as
          | ensjsv1_GetOwnerErrorType
          | ensjsv2_GetOwnerErrorType
          | GetNameRegistryAddressErrorType,
      }),
  )

  return ok<GetEnsOwnerReturnType>(result)
})

const getEnsOwnerQueryKey = createQueryKey<
  'get-ens-owner',
  GetEnsOwnerParameters
>('get-ens-owner')

export const getEnsOwnerQueryOptions = (params: GetEnsOwnerParameters) =>
  resultQueryOptions({
    queryKey: getEnsOwnerQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getEnsOwner(params),
  })
