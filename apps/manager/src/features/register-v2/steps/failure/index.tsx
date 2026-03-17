import { XCircle } from 'lucide-react'
import { DomainCard } from '@/components/atoms/DomainCard/DomainCard'
import { Button } from '@/components/ui/button'
import { RegisterV2Context } from '../../machines/RegistrationV2UiContext'

export const FailureStep = () => {
  const { uiActor, label } = RegisterV2Context.use()
  const message = RegisterV2Context.useSelector(
    (state) => state.context.lastErrorMessage,
  )

  return (
    <>
      <div className="flex items-start gap-3 rounded-lg border border-ens-garnet-dust bg-ens-garnet-dust/15 p-4">
        <XCircle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-ens-garnet-dense"
        />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-ens-garnet-dense text-sm leading-5">
            Registration Failed
          </p>
          <p className="text-ens-garnet-dense/70 text-sm leading-5">
            {message ??
              `The registration for ${label}.eth could not be completed. You can retry or go back to adjust your settings.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-16">
        <div className="w-full lg:w-1/2">
          <DomainCard domainName={`${label}.eth`} variant="garnet" />
        </div>

        <div className="flex w-full flex-col gap-6 lg:w-1/2">
          <div className="flex flex-col gap-1.5">
            <h3 className="font-medium text-ens-blue-dark text-xl tracking-tight">
              What would you like to do?
            </h3>
            <p className="text-ens-gray text-sm">
              Retrying will attempt the registration again from where it left
              off.
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
              Try Again
            </Button>
            <Button
              className="flex-1"
              onClick={() => uiActor.send({ type: 'cancel' })}
              size="xl"
              type="button"
              variant="lightBlue"
            >
              Back to Quote
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
