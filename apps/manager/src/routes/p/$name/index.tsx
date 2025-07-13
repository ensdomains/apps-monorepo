import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/p/$name/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return <div>Hello {name}</div>
}
