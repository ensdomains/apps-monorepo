import { createFileRoute } from '@tanstack/react-router'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { NameResolverRolesOverviewTable } from '@/features/resolver/components/NameResolverRoles'
import { NameRolesOverviewTable } from '@/features/roles/components/NameRoles'

export const Route = createFileRoute('/$name/roles/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()

  return (
    <div className="max-w-360 w-full mx-auto flex flex-col gap-6 m-6 px-4">
      <NameResolverRolesOverviewTable name={name} />
      <NameRolesOverviewTable name={name} />
    </div>
  )
}
