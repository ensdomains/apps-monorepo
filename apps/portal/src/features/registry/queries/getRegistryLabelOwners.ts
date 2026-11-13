import { type BignameError, readAllEnvelopes } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { err, ok } from 'neverthrow'
import type { Address } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'

const PAGE_SIZE = 100

class GetRegistryLabelOwnersError extends TaggedError(
  'GetRegistryLabelOwnersError',
)<{
  cause: BignameError | 'partial'
}> {}

type GetRegistryLabelOwnersParameters = {
  readonly registryAddress: Address
}

/** The token holder of every live label in a registry; an error when bigname's list is partial, so ownership is never guessed. */
const getRegistryLabelOwners = (
  { registryAddress }: GetRegistryLabelOwnersParameters,
  signal?: AbortSignal,
) =>
  readAllEnvelopes(
    (cursor, pageSignal) =>
      bigname.registryLabels(
        envConfig.chain.id,
        registryAddress.toLowerCase(),
        { page_size: PAGE_SIZE, ...(cursor && { cursor }) },
        { signal: pageSignal },
      ),
    { signal },
  )
    .mapErr((cause) => new GetRegistryLabelOwnersError({ cause }))
    .andThen((pages) =>
      pages.some((page) => page.meta?.completeness === 'partial')
        ? err(new GetRegistryLabelOwnersError({ cause: 'partial' }))
        : ok(
            pages.flatMap((page) =>
              page.data.flatMap((row) => (row.owner ? [row.owner] : [])),
            ),
          ),
    )

const getRegistryLabelOwnersQueryKey = createQueryKey<
  'registry-label-owners',
  GetRegistryLabelOwnersParameters
>('registry-label-owners')

export const getRegistryLabelOwnersQueryOptions = (
  params: GetRegistryLabelOwnersParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryLabelOwnersQueryKey(params),
    queryFn: ({ queryKey: [, queryParams], signal }) =>
      getRegistryLabelOwners(queryParams, signal),
  })
