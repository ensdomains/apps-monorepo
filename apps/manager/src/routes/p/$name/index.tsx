import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Suspense } from 'react'
import { type Address, isAddress } from 'viem'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { AddressProfileView } from '@/features/profile/components/view/AddressProfileView'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileOwnedNamesQuery } from '@/features/profile/service/profileOwnedNames'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { isRootEthName } from '@/features/register-v2/utils/name-parser'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { seo } from '@/utils/seo'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const isAddressParam = isAddress(name, { strict: false })
    const reverseName = isAddressParam
      ? await queryClient.ensureQueryData(
          profileReverseNameQuery(name as Address),
        )
      : undefined

    const resolvedName =
      reverseName ?? (isAddressParam ? undefined : (name as string))

    if (!resolvedName) {
      if (isAddressParam) {
        await queryClient.prefetchQuery(profileOwnedNamesQuery(name as Address))
      }

      return {
        description: undefined,
        resolvedName,
        address: isAddressParam ? (name as Address) : undefined,
        reverseName,
      }
    }

    const [profileRecords, ownerData, expiryData] = await Promise.all([
      queryClient.ensureQueryData(profileRecordsQuery(resolvedName)),
      queryClient.ensureQueryData(profileOwnerQuery(resolvedName)),
      queryClient.ensureQueryData(profileExpiryQuery(resolvedName)),
      queryClient.prefetchQuery(profileRegistrationQuery(resolvedName)),
    ])

    const isExpired =
      !expiryData?.expiry || Number(expiryData.expiry) * 1000 < Date.now()

    if (isExpired && isRootEthName(resolvedName)) {
      throw redirect(
        isFeatureEnabled('REGISTRATION_V2')
          ? {
              params: { name: resolvedName },
              to: '/register/$name',
              replace: true,
            }
          : {
              search: {
                name: resolvedName,
                duration: 1,
              },
              to: '/register',
              replace: true,
            },
      )
    }

    if (ownerData?.owner) {
      await queryClient.prefetchQuery(
        profileReverseNameQuery(ownerData.owner as Address),
      )
    }

    const description = profileRecords.texts.find(
      (r) => r.key === 'description',
    )?.value

    return {
      description,
      resolvedName,
      address: isAddressParam ? (name as Address) : undefined,
      reverseName,
    }
  },
  ssr: false,
  pendingComponent: () => <ProfileLoading />,
  head: ({ params: { name }, loaderData }) => {
    const { description, resolvedName } = loaderData || {}
    const effectiveName = resolvedName ?? name
    const metaDescription =
      description ||
      (resolvedName
        ? `View the ENS profile for ${effectiveName}`
        : `View ENS names for ${effectiveName}`)

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
    address?: Address
  }

  const effectiveName = resolvedName ?? name

  if (isAddress(name, { strict: false }) || !resolvedName) {
    return (
      <AddressProfileView
        address={name as Address}
        primaryName={resolvedName}
      />
    )
  }

  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileView name={effectiveName} />
    </Suspense>
  )
}
