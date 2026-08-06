import { Plural, Trans } from '@lingui/react/macro'
import { Check } from 'lucide-react'
import { match } from 'ts-pattern'
import {
  Dialog,
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
        <h3 className="font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Set up your migration account</Trans>
        </h3>
        <p className="text-ens-garnet-500 text-xs leading-normal">
          <Trans>Create the secure account that will upgrade your names.</Trans>
        </p>
      </>
    ))
    .with({ type: 'approval', approvalId: 'base-registrar:hca-token' }, () => (
      <>
        <h3 className="font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Allow access to a registration</Trans>
        </h3>
        <p className="text-ens-garnet-500 text-xs leading-normal">
          <Trans>
            Let your migration account transfer the selected .eth registration.
          </Trans>
        </p>
      </>
    ))
    .with({ type: 'approval', approvalId: 'base-registrar:hca' }, () => (
      <>
        <h3 className="font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Allow access to registrations</Trans>
        </h3>
        <p className="text-ens-garnet-500 text-xs leading-normal">
          <Trans>
            Let your migration account transfer the selected .eth registrations.
          </Trans>
        </p>
      </>
    ))
    .with({ type: 'approval', approvalId: 'name-wrapper:hca' }, () => (
      <>
        <h3 className="font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Allow access to wrapped names</Trans>
        </h3>
        <p className="text-ens-garnet-500 text-xs leading-normal">
          <Trans>
            Let your migration account transfer the selected wrapped names.
          </Trans>
        </p>
      </>
    ))
    .with({ type: 'approval', approvalId: 'eth-registry:hca' }, () => (
      <>
        <h3 className="font-medium text-ens-garnet-900 text-sm leading-tight">
          <Trans>Allow manager restoration</Trans>
        </h3>
        <p className="text-ens-garnet-500 text-xs leading-normal">
          <Trans>
            Let your migration account restore existing manager permissions.
          </Trans>
        </p>
      </>
    ))
    .with({ type: 'atomic-batch' }, ({ count, index, total }) => (
      <>
        <h3 className="font-medium text-ens-garnet-900 text-sm leading-tight">
          {total > 1 ? (
            <Trans>
              Upgrade names — batch {index + 1} of {total}
            </Trans>
          ) : (
            <Trans>Upgrade your names</Trans>
          )}
        </h3>
        <p className="text-ens-garnet-500 text-xs leading-normal">
          <Plural
            one="Upgrade # selected name and restore its records."
            other="Upgrade # selected names and restore their records."
            value={count}
          />
        </p>
      </>
    ))
    .exhaustive()

type WalletConfirmationStepsDialogProps = {
  readonly steps: readonly MigrationStepDescriptor[]
}

export const WalletConfirmationStepsDialog = ({
  steps,
}: WalletConfirmationStepsDialogProps) => (
  <Dialog>
    <DialogTrigger asChild>
      <button
        className="cursor-pointer rounded-xs font-semibold underline decoration-ens-garnet-900/35 decoration-dotted underline-offset-2 transition-[color,text-decoration-color] duration-150 hover:text-ens-garnet-900 hover:decoration-ens-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ens-garnet-200"
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
      className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-ens-garnet-900/10 bg-ens-garnet-100 p-0 shadow-2xl sm:max-w-[460px]"
      overlayClassName="bg-ens-garnet-900/35 backdrop-blur-[2px]"
    >
      <div className="border-ens-garnet-900/10 border-b px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
        <DialogTitle className="pr-8 font-normal text-[26px] text-ens-garnet-900 leading-tight tracking-[-0.52px]">
          <Trans>Wallet confirmations</Trans>
        </DialogTitle>
        <DialogDescription className="mt-1.5 text-ens-garnet-500 text-sm leading-normal">
          <Plural
            one="Your wallet will ask you to confirm this step before the upgrade begins."
            other="Your wallet will ask you to confirm these # steps in order."
            value={steps.length}
          />
        </DialogDescription>
      </div>

      <ol className="max-h-[min(60dvh,420px)] overflow-y-auto px-5 py-2 sm:px-6">
        {steps.map((step, index) => (
          <li
            className="relative grid grid-cols-[28px_1fr] gap-3 py-3.5"
            // Migration descriptors intentionally omit token IDs, so repeated
            // per-token approvals have no stable identifier beyond their
            // immutable position in this preview list.
            // biome-ignore lint/suspicious/noArrayIndexKey: static ordered confirmation preview
            key={`${step.type}-${index}`}
          >
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-9 bottom-[-0.875rem] left-[13px] w-px bg-ens-garnet-900/15"
              />
            ) : null}
            <span className="relative z-10 flex size-7 items-center justify-center rounded-full border border-ens-garnet-900/15 bg-ens-garnet-50 font-semi-mono text-[11px] text-ens-garnet-900">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1 pt-0.5">
              <StepCopy step={step} />
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-2 border-ens-garnet-900/10 border-t bg-ens-garnet-200/60 px-5 py-3.5 text-ens-garnet-500 text-xs leading-normal sm:px-6">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ens-garnet-900 text-ens-garnet-50">
          <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
        </span>
        <Trans>
          You can review each transaction in your wallet before signing.
        </Trans>
      </div>
    </DialogContent>
  </Dialog>
)
