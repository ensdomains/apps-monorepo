import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetResourceErrorType } from '@ensdomains/ensjs/public/v2'
import { getResource as ensjs_getResource } from '@ensdomains/ensjs/public/v2'
import { type NormalizeErrorType, normalize } from '@ensdomains/ensjs/utils'
import { fromPromise } from 'neverthrow'
import type { Address } from 'viem'
import {
  getNameResourceId,
  needsRegistryLookupForId,
} from '@/features/registry/hooks/useNameResourceId'
import {
  type ResourceIdError,
  resourceIdFromChainValue,
} from '@/lib/resource/resourceId'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetVersionedResourceError extends TaggedError(
  'GetVersionedResourceError',
)<{
  cause: NormalizeErrorType | GetResourceErrorType | ResourceIdError
}> {}

type GetVersionedResourceParameters = {
  readonly name: string
  readonly registryAddress: Address
}

/**
 * The name's EAC resource as the registry reports it, so it carries the current
 * `eacVersionId`. `EACRolesChanged` is emitted under exactly this value, and
 * the role-log read pins it unchanged — an id hashed from the label alone has
 * the label's own low bits where the version goes and matches no log.
 */
export const getVersionedResource = ResultFn(async function* ({
  name,
  registryAddress,
}: GetVersionedResourceParameters) {
  // A first label written `[<64 hex>]` does not say which name it is, and the
  // registry settles that by handing back the resource of the entry it holds —
  // already versioned (WEB-1458).
  if (needsRegistryLookupForId(name))
    return getNameResourceId({ name, registryAddress })

  // Normalized before hashing: a raw route parameter would address a resource
  // the registry never wrote to.
  const normalized = yield* fromSync(
    () => normalize(name),
    (e) => new GetVersionedResourceError({ cause: e as NormalizeErrorType }),
  )
  const [label] = normalized.split('.')

  const client = yield* safeGetClient()

  const resource = yield* fromPromise(
    ensjs_getResource(client, { label, registryAddress }),
    (e) => new GetVersionedResourceError({ cause: e as GetResourceErrorType }),
  )

  return resourceIdFromChainValue(resource).mapErr(
    (cause) => new GetVersionedResourceError({ cause }),
  )
})

const getVersionedResourceQueryKey = createQueryKey<
  'get-versioned-resource',
  GetVersionedResourceParameters
>('get-versioned-resource')

export const getVersionedResourceQueryOptions = (
  params: GetVersionedResourceParameters,
) =>
  resultQueryOptions({
    queryKey: getVersionedResourceQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getVersionedResource(params),
  })
