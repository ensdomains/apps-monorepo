import { Plural, Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type {
  MigrationRoleGrantDescriptor,
  MigrationStepDescriptor,
} from '@/features/migration/service/buildStepDescriptors'
import { truncateAddress } from '@/lib/utils'

type StepCopyProps = {
  readonly step: MigrationStepDescriptor
}

/**
 * Every account the step hands authority to, named before anything is signed.
 * A restored manager is not the owner and appears nowhere else in this flow, so
 * without this the only address that could later need revoking is the one the
 * owner never sees.
 */
const RoleGrantList = ({
  roleGrants,
}: {
  readonly roleGrants: readonly MigrationRoleGrantDescriptor[]
}) => {
  if (roleGrants.length === 0) return null

  return (
    <ul className="mt-1 flex flex-col gap-1">
      {roleGrants.map(({ account, name }) => (
        <li
          className="text-pretty text-ens-garnet-800/75 text-xs leading-normal"
          key={`${name}:${account}`}
          title={account}
        >
          <Trans>
            <span className="font-semi-mono text-ens-garnet-900">
              {truncateAddress(account)}
            </span>{' '}
            will be able to change the resolver for{' '}
            <span className="font-semi-mono">{name}</span>
          </Trans>
        </li>
      ))}
    </ul>
  )
}

const StepCopy = ({ step }: StepCopyProps) =>
  match(step)
    .with({ type: 'deploy-hca' }, () => (
      <>
        <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
          <Trans>Set up temporary access</Trans>
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
          <Trans>
            Creates a temporary account to carry out the upgrade for you.
          </Trans>
        </p>
      </>
    ))
    .with(
      { type: 'approval', approvalId: 'base-registrar:hca-token' },
      ({ name }) => (
        <>
          <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
            {name ? (
              <Trans>Approve {name}</Trans>
            ) : (
              <Trans>Approve this name</Trans>
            )}
          </h3>
          <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
            <Trans>Allow this temporary account to move this name.</Trans>
          </p>
        </>
      ),
    )
    .with(
      { type: 'approval', approvalId: 'base-registrar:hca' },
      ({ count }) => (
        <>
          <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
            {count ? (
              <Plural
                one="Approve # name"
                other="Approve # names"
                value={count}
              />
            ) : (
              <Trans>Approve your names</Trans>
            )}
          </h3>
          <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
            <Trans>One approval covers all the .eth names you selected.</Trans>
          </p>
        </>
      ),
    )
    .with({ type: 'approval', approvalId: 'name-wrapper:hca' }, () => (
      <>
        <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
          <Trans>Approve your wrapped names</Trans>
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
          <Trans>Let this temporary account move your wrapped names.</Trans>
        </p>
      </>
    ))
    .with(
      { type: 'approval', approvalId: 'eth-registry:hca' },
      ({ roleGrants }) =>
        // The addresses are listed once, under the batch step that performs
        // the grants, so this step names the restoration without repeating
        // them — and says nothing about managers when it carries none.
        roleGrants && roleGrants.length > 0 ? (
          <>
            <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
              <Trans>Restore the managers you chose</Trans>
            </h3>
            <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
              <Plural
                one="Lets the upgrade give # manager the access you picked, listed with the upgrade below."
                other="Lets the upgrade give # managers the access you picked, listed with the upgrade below."
                value={roleGrants.length}
              />
            </p>
          </>
        ) : (
          <>
            <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
              <Trans>Allow manager changes</Trans>
            </h3>
            <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
              <Trans>
                A temporary permission on the ENS registry. No managers are
                being added in this upgrade.
              </Trans>
            </p>
          </>
        ),
    )
    .with({ type: 'atomic-batch' }, ({ count, index, roleGrants, total }) => (
      <>
        <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
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
        <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
          <Trans>Upgrade your names and bring their records across.</Trans>
        </p>
        <RoleGrantList roleGrants={roleGrants} />
      </>
    ))
    .with({ type: 'cleanup' }, () => (
      <>
        <h3 className="text-pretty font-medium text-base text-ens-garnet-900 leading-tight">
          <Trans>Remove temporary access</Trans>
        </h3>
        <p className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="cursor-pointer rounded-xs font-semibold underline decoration-ens-garnet-900/35 decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-ens-garnet-900 hover:decoration-ens-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ens-garnet-200 motion-reduce:duration-0"
          type="button"
        >
          <Plural one="# request" other="# requests" value={steps.length} />
        </button>
      </DialogTrigger>

      <DialogContent
        className="gap-0 overflow-hidden border-0 bg-ens-garnet-50 p-0 shadow-lg motion-reduce:duration-0 sm:max-w-[440px]"
        overlayClassName="bg-ens-garnet-900/50"
      >
        <DialogHeader className="gap-1.5 px-5 pt-5 pr-12 pb-3 text-left sm:px-6 sm:pt-6 sm:pr-12">
          <DialogTitle className="text-balance font-normal text-ens-garnet-900 text-xl leading-tight tracking-tight">
            <Trans>What you&apos;ll approve</Trans>
          </DialogTitle>
          <DialogDescription className="text-pretty text-ens-garnet-800/75 text-sm leading-normal">
            <Plural
              one="Your wallet will show one request."
              other="Your wallet will show # requests in this order."
              value={steps.length}
            />
          </DialogDescription>
        </DialogHeader>

        <ol className="max-h-96 overflow-y-auto px-5 py-1 sm:px-6">
          {steps.map((step, index) => (
            <li
              className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-3"
              key={stepKey(step)}
            >
              <span className="pt-0.5 font-semi-mono text-ens-garnet-800/60 text-sm tabular-nums">
                {index + 1}.
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <StepCopy step={step} />
              </div>
            </li>
          ))}
        </ol>

        <p className="text-pretty px-5 pt-2 pb-5 text-ens-garnet-800/70 text-xs leading-normal sm:px-6 sm:pb-6">
          <Trans>
            Each batch of your names is upgraded in a single transaction. If any
            part of a batch fails, no changes from that batch are applied.
            Earlier completed batches and permissions stay in place. Nothing is
            signed automatically, so review every request in your wallet.
          </Trans>
        </p>
      </DialogContent>
    </Dialog>
  )
}
