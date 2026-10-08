import { createFileRoute } from '@tanstack/react-router'
import type { Address } from 'viem'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { ContractHistoryTimeline } from '@/features/history/components/ContractHistoryTimeline'

export const Route = createFileRoute('/resolver/$address/history')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { address } = Route.useParams() as { address: Address }

  return (
    <div className="flex flex-col gap-8">
      <ContractHistoryTimeline
        address={address}
        heading={
          <PageHeading parent={{ type: 'resolver', address }}>
            History
          </PageHeading>
        }
        errorTitle="Error loading resolver history"
        emptyDescription="Events for this resolver will appear here."
      />
    </div>
  )
}
