import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { seo } from '@/utils/seo'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const [profileRecords, _] = await Promise.all([
      queryClient.ensureQueryData(profileRecordsQuery(name)),
      queryClient.prefetchQuery(profileOwnerQuery(name)),
    ])

    const description = profileRecords.texts.find(
      (r) => r.key === 'description',
    )?.value

    return { description }
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

  return (
    <Suspense
      fallback={
        // TODO: Add a proper loading state
        <div className="mx-auto max-w-md space-y-4">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-600">Loading profile...</div>
          </div>
        </div>
      }
    >
      <ProfileView name={name} />
    </Suspense>
  )
}
