import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetSupportedInterfacesErrorType,
  getSupportedInterfaces,
} from '@ensdomains/ensjs/public'
import { getUnderlyingAddress } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetUnderlyingAddressError extends TaggedError(
  'GetUnderlyingAddressError',
)<{
  cause: any
}> {}

class GetSupportedInterfacesError extends TaggedError(
  'GetSupportedInterfacesError',
)<{
  cause: GetSupportedInterfacesErrorType
}> {}

export const getResolver = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const resolverResult = yield* await fromPromise(
    getUnderlyingAddress(client, {
      name,
      resolverAddress: ENS_SEPOLIA_CONTRACTS.UniversalResolver,
    }),
    (e) => new GetUnderlyingAddressError({ cause: e }),
  )

  const dedicatedResolverResult = yield* await fromPromise(
    getSupportedInterfaces(client, {
      address: resolverResult[0],
      // TODO: Move to constants
      interfaces: ['0x92349baa'],
    }),
    (e) =>
      new GetSupportedInterfacesError({
        cause: e as GetSupportedInterfacesErrorType,
      }),
  )

  return ok({
    resolverAddress: resolverResult[0],
    isDedicatedResolver: dedicatedResolverResult[0],
  })
})

export const profileResolverQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'resolver', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getResolver(name),
  })
