import { createFileRoute } from '@tanstack/react-router'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    queryClient.prefetchQuery(profileRecordsQuery(name))
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <ProfileView name={name} />
}
