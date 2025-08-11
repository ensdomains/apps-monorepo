import { createFileRoute } from '@tanstack/react-router'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { ownerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    await Promise.all([
      queryClient.prefetchQuery(profileRecordsQuery(name)),
      queryClient.prefetchQuery(ownerQuery(name)),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <ProfileView name={name} />
}
