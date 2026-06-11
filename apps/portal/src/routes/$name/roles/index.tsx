import { createFileRoute } from '@tanstack/react-router'
import { ErrorMessage } from '@/components/ErrorMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { NameRolesOverviewTable } from '@/features/roles/components/NameRolesOverviewTable'

export const Route = createFileRoute('/$name/roles/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const labels = name.split('.')

  if (!name.endsWith('.eth') || (labels.length !== 2 && labels.length !== 3))
    return <ErrorMessage title="Only 2LD and 3LD .eth names are supported" />

  return (
    <div className="max-w-360 w-full mx-auto flex flex-col gap-12 m-6 px-4 md:px-10">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Roles
      </h1>
      <NameRolesOverviewTable name={name} />
    </div>
  )
}
