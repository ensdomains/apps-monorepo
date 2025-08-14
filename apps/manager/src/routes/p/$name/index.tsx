import { createFileRoute } from '@tanstack/react-router'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { ownerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { seo } from '@/utils/seo'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const [profileRecords, _] = await Promise.all([
      queryClient.ensureQueryData(profileRecordsQuery(name)),
      queryClient.prefetchQuery(ownerQuery(name)),
    ])

    const description = profileRecords.texts.find(
      (r) => r.key === 'description',
    )?.value

    return {
      description,
    }
  },
  head: ({ params: { name }, loaderData }) => {
    const { description } = loaderData || {}

    const metaDescription = description || `View the ENS profile for ${name}`

    return {
      meta: seo({
        title: `${name} - ENS Profile`,
        description: metaDescription,
        image: `https://app-api-worker.ens-cf.workers.dev/p/${name}/og-image.png`,
      }),
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <ProfileView name={name} />
}
