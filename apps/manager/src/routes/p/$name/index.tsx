import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileResolverQuery } from '@/features/profile/service/profileResolver'
import { seo } from '@/utils/seo'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const [profileRecords] = await Promise.all([
      queryClient.ensureQueryData(profileRecordsQuery(name)),
      queryClient.prefetchQuery(profileOwnerQuery(name)),
      queryClient.prefetchQuery(profileExpiryQuery(name)),
      queryClient.prefetchQuery(profileResolverQuery(name)),
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
  errorComponent: ProfileRouteError,
})

function ProfileRouteError({ error }: ErrorComponentProps) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center py-8">
        <div className="text-red-600">
          Error loading profile: {error.message}
        </div>
      </div>
    </div>
  )
}

function RouteComponent() {
  const { name } = Route.useParams()

  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileView name={name} />
    </Suspense>
  )
}
