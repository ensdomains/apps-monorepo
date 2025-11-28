import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { type GetNameErrorType, getName } from '@ensdomains/ensjs/public'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { REVERSE_RESOLUTION_NETWORKS } from '../utils/network'

class GetNameError extends TaggedError('GetNameError')<{
  cause: GetNameErrorType
}> {}

class MissingReverseNameError extends TaggedError(
  'MissingReverseNameError',
)<{}> {}

export const getReverseName = ResultFn(async function* (address: Address) {
  const client = yield* safeGetClient()
  const networks = REVERSE_RESOLUTION_NETWORKS
  // const isDefault = network.reverseRegistrarChainId === 60
  const isDefault = true

  const result = yield* await fromPromise(
    getName(client, {
      address,
      ...(isDefault ? { reverseRegistrarChainId: 60 } : { chainId: 60 }),
    }),
    (e) => new GetNameError({ cause: e as GetNameErrorType }),
  )

  console.log('result', result)

  if (!result) {
    return yield* new MissingReverseNameError()
  }

  return ok(result)
})

export const profileReverseNameQuery = (address: Address | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'reverse_name', { address }),
    queryFn: address
      ? ({ queryKey: [{ address }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          getReverseName(address!)
      : skipToken,
  })
