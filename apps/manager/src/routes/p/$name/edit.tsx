import { createFileRoute } from '@tanstack/react-router'
import { Main } from '@/features/profile/components'

export const Route = createFileRoute('/p/$name/edit')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <Main name={name} />
}
