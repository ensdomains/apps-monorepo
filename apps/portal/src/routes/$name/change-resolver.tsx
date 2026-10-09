import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, ArrowLeftIcon } from 'lucide-react'
import { useConnection } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { PageHeading } from '@/components/PageHeading'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ChangeResolverForm } from '@/features/resolver/components/ChangeResolverForm'
import { useCanSetResolver } from '@/features/resolver/hooks/useCanSetResolver'

export const Route = createFileRoute('/$name/change-resolver')({
  component: RouteComponent,
})

const PageLayout = ({
  name,
  children,
}: {
  name: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-4 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
    <Link to="/$name/resolver" params={{ name }}>
      <Button variant="ghost" className="flex items-center gap-2 -ml-2">
        <ArrowLeftIcon className="size-4" />
        Back
      </Button>
    </Link>
    <PageHeading parent={{ type: 'name', name }}>Change resolver</PageHeading>
    {children}
  </div>
)

const PermissionDenied = ({
  name,
  protocol,
}: {
  name: string
  protocol: 'ENSv1' | 'ENSv2'
}) => (
  <ErrorMessage
    title="Permission Denied"
    description={
      protocol === 'ENSv2' ? (
        <>
          You don't have the required{' '}
          <code className="text-entity-base bg-muted px-1 py-0.5 rounded">
            ROLE_SET_RESOLVER
          </code>{' '}
          permission to change the resolver for <strong>{name}</strong>. Please
          contact the registry administrator to request access.
        </>
      ) : (
        <>
          Only the account holding <strong>{name}</strong>'s registry entry can
          change its resolver — for an unwrapped <code>.eth</code> name that is
          the controller, not the registrant. A wrapped name also refuses once
          its CANNOT_SET_RESOLVER fuse is burned.
        </>
      )
    }
  />
)

function RouteComponent() {
  const { name } = Route.useParams()
  const { address: connectedAddress } = useConnection()
  const { canSet, isLoading, isUnsupported, target } = useCanSetResolver({
    name,
  })

  if (isLoading) {
    return <LoadingSpinner title="Checking permissions..." />
  }

  if (!connectedAddress) {
    return (
      <PageLayout name={name}>
        <ErrorMessage
          title="Wallet Not Connected"
          description="Please connect your wallet to change the resolver."
        />
      </PageLayout>
    )
  }

  // Said before any permission check, because it is not one: with no id there
  // is no resource to ask about, and the role query answers a flat `false`.
  if (isUnsupported) {
    return (
      <PageLayout name={name}>
        <ErrorMessage
          title="Unsupported name"
          description={
            <>
              The on-chain identity of <strong>{name}</strong> could not be
              established, so nothing can be written for it here. This is not a
              permissions problem.
            </>
          }
        />
      </PageLayout>
    )
  }

  // No registry holds the name at either version — a gasless DNS name, say,
  // which exists only in its own DNS zone.
  if (!target) {
    return (
      <PageLayout name={name}>
        <Alert variant="destructive" className="max-w-full">
          <AlertCircle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Could not find registry for this name.
          </AlertDescription>
        </Alert>
      </PageLayout>
    )
  }

  if (!canSet) {
    return (
      <PageLayout name={name}>
        <PermissionDenied name={name} protocol={target.protocol} />
      </PageLayout>
    )
  }

  return <ChangeResolverForm name={name} target={target} />
}
