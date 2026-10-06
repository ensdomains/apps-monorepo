import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetAddressRecordErrorType,
  getAddressRecord,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetEthAddressError extends TaggedError('GetEthAddressError')<{
  cause: GetAddressRecordErrorType
}> {}

type GetEthAddressParameters = {
  readonly name: string
}

/**
 * The name's ETH address record (`addr(60)`), or null if unset. A failed read
 * is an error, not null: the transfer form hides the "repoint ETH address"
 * option when there is no record, and a swallowed failure would hide it for a
 * name that still resolves to the sender.
 */
const getEthAddress = ResultFn(async function* ({
  name,
}: GetEthAddressParameters) {
  const client = yield* safeGetClient()

  const record = yield* fromPromise(
    getAddressRecord(client, { name, coin: MAINNET_COIN_TYPE }),
    (e) => new GetEthAddressError({ cause: e as GetAddressRecordErrorType }),
  )

  return ok(record?.value ?? null)
})

const getEthAddressQueryKey = createQueryKey<
  'transfer-eth-address',
  GetEthAddressParameters
>('transfer-eth-address')

export const getEthAddressQueryOptions = (params: GetEthAddressParameters) =>
  resultQueryOptions({
    queryKey: getEthAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getEthAddress(params),
  })
