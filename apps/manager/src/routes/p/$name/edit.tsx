import { createFileRoute } from '@tanstack/react-router'
import { ProfileEdit } from '@/features/profile/components/ProfileEdit'

export const Route = createFileRoute('/p/$name/edit')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <ProfileEdit name={name} />
}
