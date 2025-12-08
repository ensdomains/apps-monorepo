import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { type Address, isAddress } from 'viem'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileResolverQuery } from '@/features/profile/service/profileResolver'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { seo } from '@/utils/seo'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    let resolvedName = name

    if (isAddress(name, { strict: false })) {
      const reverseName = await queryClient.ensureQueryData(
        profileReverseNameQuery(name as Address),
      )

      resolvedName = reverseName
    }

    const [profileRecords] = await Promise.all([
      queryClient.ensureQueryData(profileRecordsQuery(resolvedName)),
      queryClient.prefetchQuery(profileOwnerQuery(resolvedName)),
      queryClient.prefetchQuery(profileExpiryQuery(resolvedName)),
      queryClient.prefetchQuery(profileResolverQuery(resolvedName)),
    ])

    const description = profileRecords.texts.find(
      (r) => r.key === 'description',
    )?.value

    return { description, resolvedName }
  },
  ssr: true,
  pendingComponent: () => <ProfileLoading />,
  head: ({ params: { name }, loaderData }) => {
    const { description, resolvedName } = loaderData || {}
    const effectiveName = resolvedName ?? name
    const metaDescription =
      description || `View the ENS profile for ${effectiveName}`

    return {
      meta: seo({
        title: `${effectiveName} - ENS Profile`,
        description: metaDescription,
        image: `https://app-api-worker.ens-cf.workers.dev/p/${effectiveName}/og-image.png`,
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
  const { resolvedName } = Route.useLoaderData() as {
    resolvedName?: string
  }

  const effectiveName = resolvedName ?? name

  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileView name={effectiveName} />
    </Suspense>
  )
}
