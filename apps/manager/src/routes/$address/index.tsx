import { createFileRoute } from '@tanstack/react-router'
import { AddressProfileView } from '@/features/profile/components/view/AddressProfileView'
import { profileAddressNamesQuery } from '@/features/profile/service/profileAddressNames'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'

export const Route = createFileRoute('/$address/')({
  loader: ({ params: { address }, context: { queryClient } }) => {
    void queryClient.prefetchQuery(profileReverseNameQuery(address))
    void queryClient.prefetchQuery(profileAddressNamesQuery(address))
  },
  component: RouteComponent,
})

function RouteComponent() {
  const address = Route.useParams({ select: (params) => params.address })

  return <AddressProfileView address={address} />
}
