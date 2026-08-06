import { Plural, Trans } from '@lingui/react/macro'
import { Layers3, ShieldCheck, WalletCards, X } from 'lucide-react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'

type StepCopyProps = {
  readonly step: MigrationStepDescriptor
}

const StepCopy = ({ step }: StepCopyProps) =>
  match(step)
    .with({ type: 'deploy-hca' }, () => (
      <>
        <span className="font-semi-mono text-ens-garnet-800/70 text-xs uppercase tracking-widest">
          <Trans>Setup</Trans>
        </span>
        <h3 className="text-pretty font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Create migration account</Trans>
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-xs leading-normal">
          <Trans>
            Create the secure account that performs the name upgrade.
          </Trans>
        </p>
      </>
    ))
    .with(
      { type: 'approval', approvalId: 'base-registrar:hca-token' },
      ({ name }) => (
        <>
          <span className="font-semi-mono text-ens-garnet-800/70 text-xs uppercase tracking-widest">
            <Trans>Permission</Trans>
          </span>
          <h3 className="text-pretty font-medium text-ens-garnet-900 text-sm leading-tight">
            {name ? (
              <Trans>Approve {name}</Trans>
            ) : (
              <Trans>Approve registration</Trans>
            )}
          </h3>
          <p className="text-pretty text-ens-garnet-800/75 text-xs leading-normal">
            <Trans>
              Allow the migration account to move this registration.
            </Trans>
          </p>
        </>
      ),
    )
    .with(
      { type: 'approval', approvalId: 'base-registrar:hca' },
      ({ count }) => (
        <>
          <span className="font-semi-mono text-ens-garnet-800/70 text-xs uppercase tracking-widest">
            <Trans>Permission</Trans>
          </span>
          <h3 className="text-pretty font-medium text-ens-garnet-900 text-sm leading-tight">
            {count ? (
              <Plural
                one="Approve # registration"
                other="Approve # registrations"
                value={count}
              />
            ) : (
              <Trans>Approve registrations</Trans>
            )}
          </h3>
          <p className="text-pretty text-ens-garnet-800/75 text-xs leading-normal">
            <Trans>One approval covers the selected .eth registrations.</Trans>
          </p>
        </>
      ),
    )
    .with({ type: 'approval', approvalId: 'name-wrapper:hca' }, () => (
      <>
        <span className="font-semi-mono text-ens-garnet-800/70 text-xs uppercase tracking-widest">
          <Trans>Permission</Trans>
        </span>
        <h3 className="text-pretty font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Approve wrapped names</Trans>
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-xs leading-normal">
          <Trans>Allow the migration account to move your wrapped names.</Trans>
        </p>
      </>
    ))
    .with({ type: 'approval', approvalId: 'eth-registry:hca' }, () => (
      <>
        <span className="font-semi-mono text-ens-garnet-800/70 text-xs uppercase tracking-widest">
          <Trans>Permission</Trans>
        </span>
        <h3 className="text-pretty font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Approve manager restoration</Trans>
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-xs leading-normal">
          <Trans>Restore the existing managers for your names.</Trans>
        </p>
      </>
    ))
    .with({ type: 'atomic-batch' }, ({ count, index, total }) => (
      <>
        <span className="font-semi-mono text-ens-garnet-800/70 text-xs uppercase tracking-widest">
          <Trans>Upgrade</Trans>
        </span>
        <h3 className="text-pretty font-medium text-ens-garnet-900 text-sm leading-tight">
          {total > 1 ? (
            <Trans>
              Upgrade batch {index + 1} of {total}
            </Trans>
          ) : (
            <Plural
              one="Upgrade # name"
              other="Upgrade # names"
              value={count}
            />
          )}
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-xs leading-normal">
          <Trans>Migrate the selected names and restore their records.</Trans>
        </p>
      </>
    ))
    .with({ type: 'cleanup' }, () => (
      <>
        <span className="font-semi-mono text-ens-garnet-800/70 text-xs uppercase tracking-widest">
          <Trans>Cleanup</Trans>
        </span>
        <h3 className="text-pretty font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Revoke temporary HCA access</Trans>
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-xs leading-normal">
          <Trans>Remove the temporary permission after the upgrade.</Trans>
        </p>
      </>
    ))
    .exhaustive()

const stepKey = (step: MigrationStepDescriptor): string =>
  match(step)
    .with({ type: 'deploy-hca' }, () => 'deploy-hca')
    .with(
      { type: 'approval', approvalId: 'base-registrar:hca-token' },
      ({ name, tokenId }) => `approval-${tokenId ?? name ?? 'registration'}`,
    )
    .with({ type: 'approval' }, ({ approvalId }) => `approval-${approvalId}`)
    .with({ type: 'atomic-batch' }, ({ index }) => `atomic-batch-${index}`)
    .with({ type: 'cleanup' }, ({ approvalId }) => `cleanup-${approvalId}`)
    .exhaustive()

type WalletConfirmationStepsDialogProps = {
  readonly steps: readonly MigrationStepDescriptor[]
}

export const WalletConfirmationStepsDialog = ({
  steps,
}: WalletConfirmationStepsDialogProps) => {
  const bulkRegistrationApproval = steps.find(
    (step) =>
      step.type === 'approval' &&
      step.approvalId === 'base-registrar:hca' &&
      (step.count ?? 0) >= 2,
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="cursor-pointer rounded-xs font-semibold underline decoration-ens-garnet-900/35 decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-ens-garnet-900 hover:decoration-ens-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ens-garnet-200 motion-reduce:duration-0"
          type="button"
        >
          <Plural
            one="# wallet confirmation"
            other="# wallet confirmations"
            value={steps.length}
          />
        </button>
      </DialogTrigger>

      <DialogContent
        className="gap-0 overflow-hidden border-0 bg-ens-garnet-50 p-0 shadow-lg motion-reduce:duration-0 sm:max-w-md"
        overlayClassName="bg-ens-garnet-900/50"
        showCloseButton={false}
      >
        <header className="relative px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3.5 pr-10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-ens-garnet-900 text-ens-garnet-50">
              <WalletCards
                aria-hidden="true"
                className="size-4.5"
                strokeWidth={1.8}
              />
            </span>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="text-balance font-normal text-ens-garnet-900 text-xl leading-tight tracking-tight">
                <Trans>Wallet confirmations</Trans>
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-pretty text-ens-garnet-800/75 text-sm leading-normal">
                <Plural
                  one="Your wallet will show one request."
                  other="Your wallet will show # requests in this order."
                  value={steps.length}
                />
              </DialogDescription>
            </div>
          </div>

          <DialogClose asChild>
            <button
              className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-sm text-ens-garnet-800/70 transition-colors duration-150 hover:bg-ens-garnet-100 hover:text-ens-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900/40 motion-reduce:duration-0"
              type="button"
            >
              <X aria-hidden="true" className="size-4.5" />
              <span className="sr-only">
                <Trans>Close</Trans>
              </span>
            </button>
          </DialogClose>
        </header>

        {bulkRegistrationApproval ? (
          <div className="mx-5 mb-1 flex gap-2.5 rounded-sm bg-ens-garnet-100 px-3 py-2.5 text-ens-garnet-900 sm:mx-6">
            <Layers3
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={1.8}
            />
            <p className="text-pretty text-xs leading-normal">
              <Trans>
                When two or more .eth registrations need access, one approval
                covers them and reduces the number of wallet requests.
              </Trans>
            </p>
          </div>
        ) : null}

        <ol className="max-h-96 overflow-y-auto px-5 py-2 sm:px-6">
          {steps.map((step, index) => (
            <li
              className="flex gap-3 border-ens-garnet-900/10 border-b py-3.5 last:border-b-0"
              key={stepKey(step)}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-ens-garnet-100 font-semi-mono text-ens-garnet-900 text-xs tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                <StepCopy step={step} />
              </div>
            </li>
          ))}
        </ol>

        <footer className="flex items-start gap-2.5 border-ens-garnet-900/10 border-t px-5 py-3.5 text-ens-garnet-800/75 sm:px-6">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
            strokeWidth={1.8}
          />
          <p className="text-pretty text-xs leading-normal">
            <Trans>
              Nothing is signed automatically. Review every request in your
              wallet.
            </Trans>
          </p>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
