import { useQuery } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Suspense } from 'react'
import { useConnection, useConnectionEffect } from 'wagmi'
import { LinkButton } from '@/components/ui/button'
import { ProfileEdit } from '@/features/profile/components/ProfileEdit'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { isWalletConnectedCookie } from '@/lib/connection-cookie'
import { useSmartAccountContext } from '@/lib/smart-account'

export const Route = createFileRoute('/p/$name/edit')({
  component: RouteComponent,
  errorComponent: ProfileEditRouteError,
  beforeLoad: ({ params: { name } }) => {
    if (!isWalletConnectedCookie()) {
      throw redirect({ to: '/$name', params: { name } })
    }
  },
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
  const navigate = useNavigate()
  const { address, isConnecting, isReconnecting } = useConnection()
  const { data: ownerData, isLoading: isOwnerLoading } = useQuery({
    ...profileOwnerQuery(name),
  })

  const {
    accountAddress: smartAccountAddress,
    isLoading: isSmartAccountLoading,
    hasInitialized,
  } = useSmartAccountContext()

  const normalizedOwner = ownerData?.owner?.toLowerCase()
  const connectedAddresses = [address, smartAccountAddress]
    .filter((addr): addr is `0x${string}` => Boolean(addr))
    .map((addr) => addr.toLowerCase())

  const isOwner = Boolean(
    normalizedOwner && connectedAddresses.includes(normalizedOwner),
  )

  useConnectionEffect({
    onDisconnect() {
      navigate({ to: '/$name', params: { name }, replace: true })
    },
  })

  const isCheckingOwnership =
    isConnecting ||
    isReconnecting ||
    isOwnerLoading ||
    !hasInitialized ||
    isSmartAccountLoading

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
          <LinkButton params={{ name }} to="/$name">
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
