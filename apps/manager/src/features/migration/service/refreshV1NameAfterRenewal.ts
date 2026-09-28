import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getExpiry } from '@ensdomains/ensjs/public/v1'
import type { QueryClient } from '@tanstack/react-query'
import { err, fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  type ConfirmedRenewal,
  recordConfirmedV1Renewal,
} from './reconcileRenewedV1Names'
import type { V1Domain } from './v1SubgraphClient'

class RefreshV1NameAfterRenewalError extends TaggedError(
  'RefreshV1NameAfterRenewalError',
)<{ readonly cause: unknown }> {}

export const refreshV1NameAfterRenewal = ResultFn(async function* ({
  queryClient,
  domain,
  minimumExpiry,
}: {
  readonly queryClient: QueryClient
  readonly domain: V1Domain
  readonly minimumExpiry?: bigint
}) {
  const client = yield* safeGetClient()
  const [registration, wrapper] = yield* fromPromise(
    Promise.all([
      getExpiry(client, { name: domain.name, contract: 'registrar' }),
      getExpiry(client, { name: domain.name, contract: 'nameWrapper' }),
    ]),
    (cause) => new RefreshV1NameAfterRenewalError({ cause }),
  )
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  if (
    !registration ||
    registration.expiry <= nowSeconds ||
    (minimumExpiry !== undefined && registration.expiry < minimumExpiry)
  ) {
    return err(
      new RefreshV1NameAfterRenewalError({
        cause: new Error('The renewed expiry is not available yet.'),
      }),
    )
  }

  const renewal: ConfirmedRenewal = {
    domain,
    expiry: registration.expiry,
    wrapperExpiry: wrapper?.expiry ?? null,
  }
  // Cancel an invalidation-triggered fetch before replacing its stale expiry.
  yield* fromPromise(
    queryClient.cancelQueries({ queryKey: qk('migration', 'v1_names') }),
    (cause) => new RefreshV1NameAfterRenewalError({ cause }),
  )
  recordConfirmedV1Renewal(queryClient, renewal)
  yield* fromPromise(
    queryClient.invalidateQueries({
      queryKey: qk('migration', 'eligibility'),
    }),
    (cause) => new RefreshV1NameAfterRenewalError({ cause }),
  )
  return ok(registration.expiry)
})
