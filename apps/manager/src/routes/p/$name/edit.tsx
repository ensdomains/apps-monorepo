import type { ErrorComponentProps } from '@tanstack/react-router'
import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { ProfileEdit } from '@/features/profile/components/ProfileEdit'

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

  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileEdit name={name} />
    </Suspense>
  )
}
