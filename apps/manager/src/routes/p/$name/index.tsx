import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import { ProfileLoading } from '@/features/profile/components/common/ProfileLoading'
import { ProfileView } from '@/features/profile/components/view/ProfileView'

export const Route = createFileRoute('/p/$name/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileView name={name} />
    </Suspense>
  )
}
