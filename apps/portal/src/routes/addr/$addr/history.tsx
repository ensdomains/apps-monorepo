import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { AddressHistoryDataTable } from '@/features/address/components/AddressHistoryDataTable'
import { getAddressHistoryQueryOptions } from '@/features/address/hooks/useAddressHistory'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { queryClient } from '@/utils/queryClient'

export const Route = createFileRoute('/addr/$addr/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    queryClient.prefetchQuery(
      getAddressHistoryQueryOptions({ address: params.addr as Address }),
    ),
})

function RouteComponent() {
  const { addr } = Route.useParams() as { addr: Address }

  // One bigname stream over both eras; nothing to merge beside it.
  const { data, isLoading, error } = useQuery(
    getAddressHistoryQueryOptions({ address: addr }),
  )

  if (isLoading) return <LoadingMessage />

  if (error) {
    return (
      <ErrorMessage
        title="Error loading history"
        description={extractErrorMessage(error, '')}
      />
    )
  }

  return <AddressHistoryDataTable address={addr} history={data ?? []} />
}
