import {
  createFileRoute,
  type ErrorComponentProps,
  redirect,
} from '@tanstack/react-router'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { seo } from '@/utils/seo'

export const Route = createFileRoute('/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const [profileRecords, ownerData, expiryData] = await Promise.all([
      queryClient.ensureQueryData(profileRecordsQuery(name)),
      queryClient.ensureQueryData(profileOwnerQuery(name)),
      queryClient.ensureQueryData(profileExpiryQuery(name)),
      queryClient.prefetchQuery(profileRegistrationQuery(name)),
    ])

    const isExpired =
      expiryData?.expiry != null &&
      Number(expiryData.expiry) * 1000 < Date.now()

    if (isExpired) {
      throw redirect(
        isFeatureEnabled('REGISTRATION_V2')
          ? {
              params: { name },
              to: '/register/$name',
              replace: true,
            }
          : {
              search: {
                name,
                duration: 1,
              },
              to: '/register',
              replace: true,
            },
      )
    }

    if (ownerData?.owner) {
      await queryClient.prefetchQuery(profileReverseNameQuery(ownerData.owner))
    }

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
      }),
    }
  },
  ssr: false,
  component: RouteComponent,
  errorComponent: ProfileRouteError,
  pendingComponent: ProfileLoading,
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
  const name = Route.useParams({ select: (params) => params.name })

  return <ProfileView name={name} />
}
