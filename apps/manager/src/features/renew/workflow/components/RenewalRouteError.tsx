import { Trans } from '@lingui/react/macro'
import { ArrowLeft, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button, LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { RenewPageLayout } from './RenewPageLayout'

export const RenewalRouteError = ({
  message,
  name,
  onRetry,
}: {
  readonly message?: string
  readonly name: string
  readonly onRetry?: () => void
}) => {
  const canRetry = onRetry !== undefined

  return (
    <RenewPageLayout>
      <Card className="mx-auto max-w-xl items-center gap-0 px-5 py-10 text-center sm:px-10 sm:py-12">
        <span className="flex size-12 items-center justify-center rounded-full bg-ens-garnet-100 text-ens-garnet-500">
          <TriangleAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-5 font-medium text-2xl text-ens-lapis-900 tracking-tight">
          <Trans>This name can’t be renewed here</Trans>
        </h1>
        <p className="mt-3 max-w-md text-ens-quartz-500 text-sm leading-5">
          {message || (
            <Trans>We couldn’t confirm that this name is renewable.</Trans>
          )}
        </p>
        <div
          className={cn('mt-8 grid w-full gap-2', canRetry && 'sm:grid-cols-2')}
        >
          <LinkButton
            className="h-14 w-full"
            params={{ name }}
            size="lg"
            to="/$name"
            variant={canRetry ? 'lightBlue' : 'blue'}
          >
            <ArrowLeft aria-hidden="true" />
            <Trans>Back to profile</Trans>
          </LinkButton>
          {canRetry ? (
            <Button
              className="h-14 w-full"
              onClick={onRetry}
              size="lg"
              type="button"
              variant="blue"
            >
              <RefreshCw aria-hidden="true" />
              <Trans>Try again</Trans>
            </Button>
          ) : null}
        </div>
      </Card>
    </RenewPageLayout>
  )
}
