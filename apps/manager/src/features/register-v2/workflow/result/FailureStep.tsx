import { Trans, useLingui } from '@lingui/react/macro'
import { Clock, XCircle } from 'lucide-react'
import { match } from 'ts-pattern'
import { DomainCard } from '@/components/atoms/DomainCard/DomainCard'
import { Button } from '@/components/ui/button'
import { RegisterV2Context } from '../../state/registrationUi.context'

export const FailureStep = () => {
  const { uiActor, label, resume } = RegisterV2Context.use()
  const message = RegisterV2Context.useSelector(
    (state) => state.context.lastErrorMessage,
  )
  // Someone else registered the name first. Retrying can only fail the same
  // way, so the only way out is back to the quote with a different name.
  const nameUnavailable = RegisterV2Context.useSelector(
    (state) => state.context.nameUnavailable,
  )
  // Another tab is registering with this wallet. Nothing started here, so the
  // screen waits on that run rather than offering to retry this one.
  const isWalletBusy = RegisterV2Context.useSelector(
    (state) => state.context.isWalletBusy,
  )
  // A run that failed before this page loaded. Its machine never resumed, so
  // Try Again resumes it rather than retrying it.
  const isRestoredFailure = RegisterV2Context.useSelector(
    (state) => state.context.restoredFailure,
  )

  const onRetry = () => {
    if (!isRestoredFailure) {
      uiActor.send({ type: 'retry' })
      return
    }
    if (resume.status === 'failed') resume.retry()
  }

  return (
    <FailureStepView
      isWalletBusy={isWalletBusy}
      label={label}
      message={message}
      nameUnavailable={nameUnavailable}
      onCancel={() => uiActor.send({ type: 'cancel' })}
      onRetry={onRetry}
    />
  )
}

interface FailureStepViewProps {
  readonly label: string
  readonly message?: string
  readonly nameUnavailable?: boolean
  /** This run was refused because the wallet is busy, rather than failing. */
  readonly isWalletBusy?: boolean
  readonly onRetry: () => void
  readonly onCancel: () => void
}

export const FailureStepView = ({
  label,
  message,
  nameUnavailable,
  isWalletBusy = false,
  onRetry,
  onCancel,
}: FailureStepViewProps) => {
  const { t } = useLingui()

  return (
    <div className="mx-auto mt-12 mb-4 w-full-[32px] max-w-6xl space-y-6.5">
      <div className="flex items-start gap-3 rounded-lg border border-ens-lapis-dust bg-ens-lapis-tint p-4">
        {isWalletBusy ? (
          <Clock
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-ens-lapis-dense"
          />
        ) : (
          <XCircle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-ens-lapis-dense"
          />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-ens-lapis-dense text-sm leading-5">
            {match({ nameUnavailable, isWalletBusy })
              .with({ nameUnavailable: true }, () => (
                <Trans>Name No Longer Available</Trans>
              ))
              .with({ isWalletBusy: true }, () => (
                <Trans>Another Registration Is Running</Trans>
              ))
              .otherwise(() => (
                <Trans>Registration Failed</Trans>
              ))}
          </p>
          <p className="wrap-anywhere max-h-32 overflow-y-auto text-ens-lapis-dense/70 text-sm leading-5">
            {message ??
              t`The registration for ${label}.eth could not be completed. You can retry or go back to adjust your settings.`}
          </p>
        </div>
      </div>

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
              {match({ nameUnavailable, isWalletBusy })
                .with({ nameUnavailable: true }, () => (
                  <Trans>
                    Another address registered this name first, so it can no
                    longer be registered here. Go back to pick a different name.
                  </Trans>
                ))
                .with({ isWalletBusy: true }, () => (
                  <Trans>
                    Finish or cancel the other registration in its tab, then Try
                    Again once this wallet is free.
                  </Trans>
                ))
                .otherwise(() => (
                  <Trans>
                    Retrying will attempt the registration again from where it
                    left off.
                  </Trans>
                ))}
            </p>
          </div>

          <div className="flex gap-3">
            {!nameUnavailable && (
              <Button
                className="flex-1"
                onClick={onRetry}
                size="xl"
                type="button"
                variant={isWalletBusy ? 'lightBlue' : 'blue'}
              >
                <Trans>Try Again</Trans>
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={onCancel}
              size="xl"
              type="button"
              variant={nameUnavailable || isWalletBusy ? 'blue' : 'lightBlue'}
            >
              <Trans>Back to Quote</Trans>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
