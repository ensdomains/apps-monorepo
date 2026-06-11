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
    <div className="max-w-360 w-full mx-auto flex flex-col gap-12 m-6 px-4 md:px-10">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Roles
      </h1>
      <NameResolverRolesOverviewTable name={name} />
      <NameRolesOverviewTable name={name} />
    </div>
  )
}
