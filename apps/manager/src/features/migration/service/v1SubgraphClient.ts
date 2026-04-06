import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import type {
  GetNamesForAddressErrorType,
  GetNamesForAddressParameters,
} from '@ensdomains/ensjs/subgraph'
import { getNamesForAddress } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export type { NameWithRelation as V1Name } from '@ensdomains/ensjs/subgraph'

class GetV1NamesError extends TaggedError('GetV1NamesError')<{
  cause: GetNamesForAddressErrorType
}> {}

export const getV1NamesForAddress = ResultFn(async function* (address: string) {
  const client = safeGetClient()
  if (client.isErr()) {
    return ok([])
  }

  const result = yield* fromPromise(
    getNamesForAddress(client.value, {
      address: address as `0x${string}`,
      filter: {
        registrant: true,
        owner: true,
        wrappedOwner: true,
        resolvedAddress: false,
        allowExpired: false,
        allowReverseRecord: false,
        allowDeleted: false,
      },
      orderBy: 'expiryDate',
      orderDirection: 'asc',
      pageSize: 1000,
    } satisfies GetNamesForAddressParameters),
    (e) => new GetV1NamesError({ cause: e as GetNamesForAddressErrorType }),
  )

  return ok(result)
})
