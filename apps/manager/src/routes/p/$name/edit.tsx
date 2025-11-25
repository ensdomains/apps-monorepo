import { useWallet } from '@getpara/react-sdk-lite'
import { useQuery } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { LinkButton } from '@/components/ui/button'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { ProfileEdit } from '@/features/profile/components/ProfileEdit'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'

export const Route = createFileRoute('/p/$name/edit')({
  component: RouteComponent,
  errorComponent: ProfileEditRouteError,
})

function ProfileEditRouteError({ error }: ErrorComponentProps) {
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
  const { data: wallet, isLoading: isWalletLoading } = useWallet()
  const { data: ownerData, isLoading: isOwnerLoading } = useQuery({
    ...profileOwnerQuery(name),
  })

  const address = wallet?.address

  const isOwner = Boolean(
    address &&
      ownerData?.owner &&
      ownerData.owner.toLowerCase() === address.toLowerCase(),
  )

  if (isWalletLoading || isOwnerLoading) {
    return <ProfileLoading />
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <div className="text-gray-700">
            You don&apos;t have permission to edit this profile.
          </div>
          <LinkButton to="/p/$name" params={{ name }}>
            View profile
          </LinkButton>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileEdit name={name} />
    </Suspense>
  )
}
