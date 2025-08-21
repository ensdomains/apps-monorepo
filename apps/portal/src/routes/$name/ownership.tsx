import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$name/ownership')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/$name/ownership"!</div>
}
