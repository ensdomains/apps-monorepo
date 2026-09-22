/**
 * The on-chain id of the name a route is showing.
 *
 * Almost every name yields its id from the name itself, with no network call:
 * the registry hashed the first label, and {@link resourceIdForName} hashes the
 * same characters. The exception is a first label rendered as `[<64 hex>]`,
 * which does not say which name it is — it is both how ENS renders a label
 * whose preimage nothing has seen and what a label literally registered as
 * those 66 characters looks like. For those, the id comes from the indexer,
 * which recorded the labelhash from the registration event rather than from the
 * rendered string.
 */

import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { gql } from '@urql/core'
import { err, fromPromise } from 'neverthrow'
import { useMemo } from 'react'
import { graphqlIndexerClient } from '@/lib/indexer'
import {
  type ResourceId,
  ResourceIdError,
  resourceIdForName,
  resourceIdFromChainValue,
} from '@/lib/resource/resourceId'

class GetNameResourceIdError extends TaggedError('GetNameResourceIdError')<{
  cause: GraphqlRequestError | ResourceIdError
}> {}

type GetNameResourceIdParameters = { readonly name: string }

/**
 * The indexer's own labelhash for a name whose first label is encoded.
 *
 * Refuses unless exactly one domain carries that display name: two names can
 * render identically here (one whose preimage is unknown, one registered as the
 * literal characters), and picking either would be the guess this whole module
 * exists to avoid.
 */
export const getNameResourceId = ResultFn(async function* ({
  name,
}: GetNameResourceIdParameters) {
  const response = yield* fromPromise(
    graphqlIndexerClient.request<
      { domains: { labelhash: string | null }[] },
      { name: string }
    >(
      gql`
        query getDomainLabelhash($name: String!) {
          domains(where: { name: $name }) {
            labelhash
          }
        }
      `,
      { name },
    ),
    (e) => new GetNameResourceIdError({ cause: e as GraphqlRequestError }),
  )

  const domains = response.domains ?? []

  if (domains.length !== 1)
    return err(
      new GetNameResourceIdError({
        cause: new ResourceIdError({
          reason: 'encoded-label',
          message:
            domains.length === 0
              ? `The indexer holds no name matching "${name}", so its id could not be established.`
              : `More than one name is displayed as "${name}", so which one this is cannot be told apart.`,
        }),
      }),
    )

  return resourceIdFromChainValue(domains[0]?.labelhash).mapErr(
    (cause) => new GetNameResourceIdError({ cause }),
  )
})

const getNameResourceIdQueryKey = createQueryKey<
  'get-name-resource-id',
  GetNameResourceIdParameters
>('get-name-resource-id')

export const getNameResourceIdQueryOptions = (
  params: GetNameResourceIdParameters,
) =>
  resultQueryOptions({
    queryKey: getNameResourceIdQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameResourceId(params),
  })

export type UseNameResourceIdResult = {
  /** The id every write and role check for this name is addressed with. */
  readonly resourceId: ResourceId | null
  readonly isLoading: boolean
  /** True once it is settled that this name has no id we can establish. */
  readonly isUnsupported: boolean
}

/**
 * `resourceId` is `null` while loading *and* when the name has no id we can
 * establish, so callers must read `isLoading` before treating it as a refusal.
 * It is never a stand-in value.
 */
export const useNameResourceId = (
  name: string,
  { enabled = true }: { enabled?: boolean } = {},
): UseNameResourceIdResult => {
  // No query for the overwhelming majority: the name itself is the authority.
  const fromName = useMemo(() => resourceIdForName(name).unwrapOr(null), [name])

  const query = useQuery({
    ...getNameResourceIdQueryOptions({ name }),
    enabled: enabled && fromName === null,
  })

  if (fromName !== null)
    return { resourceId: fromName, isLoading: false, isUnsupported: false }

  if (!enabled)
    return { resourceId: null, isLoading: false, isUnsupported: false }

  return {
    resourceId: query.data ?? null,
    isLoading: query.isPending,
    isUnsupported: !query.isPending && !query.data,
  }
}
