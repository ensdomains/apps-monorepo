import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetOwnerErrorType,
  type GetOwnerParameters,
  getOwner,
} from '@ensdomains/ensjs/public'
import {
  type GetRegistryOwnerByLabelErrorType,
  getRegistryOwnerByLabel,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import {
  safeGetClient,
  safeGetNamechainSepoliaClient,
} from '@/lib/wagmi/helpers'

export class GetEnsOwnerError extends TaggedError('GetEnsOwnerError')<{
  cause: GetOwnerErrorType | GetRegistryOwnerByLabelErrorType
}> {}

export const getEnsOwner = ResultFn(async function* (
  params: GetOwnerParameters,
) {
  const client = yield* safeGetClient()

  const l1v1Owner = yield* await fromPromise(
    getOwner(client, params),
    (e) =>
      new GetEnsOwnerError({
        cause: e as GetOwnerErrorType,
      }),
  )

  const label = params.name.split('.').slice(0, -1).join('')

  const namechainClient = yield* safeGetNamechainSepoliaClient()

  let l2v2Owner = (yield* await fromPromise(
    getRegistryOwnerByLabel(namechainClient, {
      label,
      registryAddress: '0x5fb63bbd34de21688c8aa8131be1c3b4a477109c',
    }),
    (e) =>
      new GetEnsOwnerError({ cause: e as GetRegistryOwnerByLabelErrorType }),
  )) as Address | undefined

  if (l2v2Owner === zeroAddress) l2v2Owner = undefined

  return ok(l1v1Owner?.owner || l2v2Owner)
})

export const getEnsOwnerQueryKey = createQueryKey<
  'get-ens-owner',
  GetOwnerParameters
>('get-ens-owner')

export const getEnsOwnerQueryOptions = (params: GetOwnerParameters) =>
  resultQueryOptions({
    queryKey: getEnsOwnerQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getEnsOwner(params),
  })
