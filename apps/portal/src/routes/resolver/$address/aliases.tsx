import { createFileRoute } from '@tanstack/react-router'
import { NotFoundMessage } from '@/components/NotFoundMessage'

export const Route = createFileRoute('/resolver/$address/aliases')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { address } = Route.useParams()

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <h1 className="text-2xl md:text-heading font-medium leading-none">
        Aliases
      </h1>
      <p className="text-muted-foreground font-mono text-sm break-all">
        {address}
      </p>
      <p className="text-muted-foreground">Coming soon.</p>
    </div>
  )
}
