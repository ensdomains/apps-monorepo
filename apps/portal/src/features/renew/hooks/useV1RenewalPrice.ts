import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getPrice as ensjs_getPrice,
  type GetPriceErrorType,
} from '@ensdomains/ensjs/public/v1'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

/**
 * ETH-native renewal price for a legacy (ENSv1) .eth name, read from
 * `ETHRegistrarController.rentPrice(label, duration)` via ensjs. Unlike the
 * ENSv2 renewal path (ERC-20, premium-exempt), v1 pricing returns `base` plus a
 * post-expiry `premium` and is paid in ETH.
 */
export type V1RenewalPrice = {
  readonly base: bigint
  readonly premium: bigint
  readonly total: bigint
}

type GetV1RenewalPriceParameters = {
  name: string
  durationSeconds: number
}

class GetV1RenewalPriceError extends TaggedError('GetV1RenewalPriceError')<{
  cause: GetPriceErrorType
}> {}

const getV1RenewalPrice = ResultFn(async function* ({
  name,
  durationSeconds,
}: GetV1RenewalPriceParameters) {
  const client = yield* safeGetClient()

  const { base, premium } = yield* fromPromise(
    ensjs_getPrice(client, {
      nameOrNames: name,
      duration: BigInt(durationSeconds),
    }),
    (e) => new GetV1RenewalPriceError({ cause: e as GetPriceErrorType }),
  )

  return ok<V1RenewalPrice>({ base, premium, total: base + premium })
})

const getV1RenewalPriceQueryKey = createQueryKey<
  'get-v1-renewal-price',
  GetV1RenewalPriceParameters
>('get-v1-renewal-price')

export const getV1RenewalPriceQueryOptions = (
  params: GetV1RenewalPriceParameters,
) =>
  resultQueryOptions({
    queryKey: getV1RenewalPriceQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV1RenewalPrice(params),
    enabled: !!params.name && params.durationSeconds > 0,
  })
