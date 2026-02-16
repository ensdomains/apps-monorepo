import { useWallet } from '@getpara/react-sdk-lite'
import { useQuery } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense } from 'react'
import { LinkButton } from '@/components/ui/button'
import { ProfileEdit } from '@/features/profile/components/ProfileEdit'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { useSmartAccountContext } from '@/lib/smart-account'

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

function ProfileEditLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-center gap-2 py-8 text-gray-600">
        <Loader2 className="size-4 animate-spin" />
        Loading profile editor...
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

  const {
    accountAddress: smartAccountAddress,
    isLoading: isSmartAccountLoading,
    isAccountReady,
  } = useSmartAccountContext()

  const normalizedOwner = ownerData?.owner?.toLowerCase()
  const connectedAddresses = [wallet?.address, smartAccountAddress]
    .filter((addr): addr is string => Boolean(addr))
    .map((addr) => addr.toLowerCase())

  const isOwner = Boolean(
    normalizedOwner && connectedAddresses.includes(normalizedOwner),
  )

  const isCheckingOwnership =
    isWalletLoading ||
    isOwnerLoading ||
    (!isOwner && (isSmartAccountLoading || !isAccountReady))

  if (isCheckingOwnership) {
    return <ProfileEditLoading />
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <div className="text-gray-700">
            You don&apos;t have permission to edit this profile.
          </div>
          <LinkButton params={{ name }} to="/p/$name">
            View profile
          </LinkButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<ProfileEditLoading />}>
        <ProfileEdit name={name} />
      </Suspense>
    </div>
  )
}
