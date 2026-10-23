import { Trans, useLingui } from '@lingui/react/macro'
import { useSelector } from '@xstate/react'
import { DomainCard } from '@/components/atoms/DomainCard/DomainCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useRenewalUiContext } from '../../state/renewalUi.context'
import { RenewPageLayout } from '../components/RenewPageLayout'

export const RenewFailureStep = () => {
  const { t } = useLingui()
  const { uiActor, label } = useRenewalUiContext()
  const message = useSelector(
    uiActor,
    (state) => state.context.lastErrorMessage,
  )

  return (
    <RenewPageLayout>
      <Alert variant="error">
        <AlertTitle>
          <Trans>Renewal Failed</Trans>
        </AlertTitle>
        <AlertDescription className="max-h-32 overflow-y-auto">
          {message ??
            t`The renewal for ${label}.eth could not be completed. You can retry or go back to adjust your settings.`}
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-16">
        <div className="w-full lg:w-1/2">
          <DomainCard domainName={`${label}.eth`} variant="lapis" />
        </div>

        <div className="flex w-full flex-col gap-6 lg:w-1/2">
          <div className="flex flex-col gap-1.5">
            <h3 className="font-medium text-ens-blue-dark text-xl tracking-tight">
              <Trans>What would you like to do?</Trans>
            </h3>
            <p className="text-ens-gray text-sm">
              <Trans>
                Retrying will attempt the renewal again from where it left off.
              </Trans>
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={() => uiActor.send({ type: 'retry' })}
              size="xl"
              type="button"
              variant="blue"
            >
              <Trans>Try Again</Trans>
            </Button>
            <Button
              className="flex-1"
              onClick={() => uiActor.send({ type: 'cancel' })}
              size="xl"
              type="button"
              variant="lightBlue"
            >
              <Trans>Back to Quote</Trans>
            </Button>
          </div>
        </div>
      </div>
    </RenewPageLayout>
  )
}
