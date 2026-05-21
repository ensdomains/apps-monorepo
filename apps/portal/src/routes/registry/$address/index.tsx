import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NotFoundMessage } from '@/components/NotFoundMessage'

export const Route = createFileRoute('/registry/$address/')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { address } = Route.useParams() as { address: Address }

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6 w-full max-w-360 mx-auto">
      <h1 className="text-2xl md:text-heading font-medium leading-none break-all">
        {address}
      </h1>
      {/* TODO: registry overview content */}
    </div>
  )
}
