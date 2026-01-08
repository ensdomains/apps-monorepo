import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { type Address, isAddress } from 'viem'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { AddressProfileView } from '@/features/profile/components/view/AddressProfileView'
import { ProfileView } from '@/features/profile/components/view/ProfileView'
import { useProfileExpiryQuery } from '@/features/profile/service/useProfileExpiry'
import { useProfileOwnedNamesQuery } from '@/features/profile/service/useProfileOwnedNames'
import { useProfileOwnerQuery } from '@/features/profile/service/useProfileOwner'
import { useProfileRecordsQuery } from '@/features/profile/service/useProfileRecords'
import { useProfileReverseNameQuery } from '@/features/profile/service/useProfileReverseName'
import { seo } from '@/utils/seo'

export const Route = createFileRoute('/p/$name/')({
  loader: async ({ params: { name }, context: { queryClient } }) => {
    const isAddressParam = isAddress(name, { strict: false })
    const reverseName = isAddressParam
      ? await queryClient.ensureQueryData(
          useProfileReverseNameQuery(name as Address),
        )
      : undefined

    const resolvedName =
      reverseName ?? (isAddressParam ? undefined : (name as string))

    if (!resolvedName) {
      if (isAddressParam) {
        await queryClient.prefetchQuery(useProfileOwnedNamesQuery(name as Address))
      }

      return {
        description: undefined,
        resolvedName,
        address: isAddressParam ? (name as Address) : undefined,
        reverseName,
      }
    }

    const [useProfileRecords] = await Promise.all([
      queryClient.ensureQueryData(useProfileRecordsQuery(resolvedName)),
      queryClient.prefetchQuery(useProfileOwnerQuery(resolvedName)),
      queryClient.prefetchQuery(useProfileExpiryQuery(resolvedName)),
    ])

    const description = useProfileRecords.texts.find(
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

  if (!resolvedName && isAddress(name, { strict: false })) {
    return <AddressProfileView address={name as Address} />
  }

  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileView name={effectiveName} />
    </Suspense>
  )
}
