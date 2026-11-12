import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useConnection } from 'wagmi'
import { InvalidNameMessage } from '@/components/InvalidNameMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { ChangeManager } from '@/features/ownership/components/ChangeManager'
import { ConnectWalletAlert } from '@/features/wallet/ConnectWalletAlert'
import { isCanonicalName } from '@/utils/token/isNormalized'

export const Route = createFileRoute('/$name/ownership/change-manager')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

function RouteComponent() {
  const { name } = Route.useParams()
  const { address } = useConnection()

  // Same refusal as Transfer: the write keys off the normalised label, so
  // `ALICE.eth` would authorise here and change `alice.eth`.
  if (!isCanonicalName(name))
    return (
      <InvalidNameMessage
        title="This name’s manager can’t be changed"
        description="This name isn’t written in its normalized form, so it isn’t the name it appears to be. Changing its manager would change a different name."
      />
    )

  return (
    <div className="flex flex-col items-center px-8 py-6 w-full">
      <div className="flex flex-col gap-6 max-w-2xl w-full">
        <Link
          to="/$name/ownership"
          params={{ name }}
          className="flex items-center gap-1 text-muted-foreground hover:text-muted-foreground text-base font-medium"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>

        <PageHeading parent={{ type: 'name', name }}>
          Change manager
        </PageHeading>

        {address ? (
          <ChangeManager name={name} account={address} />
        ) : (
          <ConnectWalletAlert />
        )}
      </div>
    </div>
  )
}
