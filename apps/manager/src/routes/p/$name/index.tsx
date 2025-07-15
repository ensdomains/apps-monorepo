import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    queryClient.prefetchQuery(profileRecordsQuery(name))
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { data } = useQuery(profileRecordsQuery(name))

  return (
    <div>
      <h1>Hello {name}</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
