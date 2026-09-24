import { Trans } from '@lingui/react/macro'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import type { MigrationOperatorApproval } from '@/features/migration/service/migrationApprovals'
import { useMigrationApprovalSettings } from './useMigrationApprovalSettings'

const approvalDescription = (id: MigrationOperatorApproval['id']) => {
  switch (id) {
    case 'eth-registry:hca':
      return {
        title: <Trans>Smart account access</Trans>,
        detail: (
          <Trans>
            Lets your smart account manage every ENSv2 name you own. Used
            temporarily to restore managers during an upgrade.
          </Trans>
        ),
      }
    case 'base-registrar:hca':
      return {
        title: <Trans>Unwrapped .eth name access</Trans>,
        detail: (
          <Trans>
            Lets the migration contract move any unwrapped .eth name you own.
          </Trans>
        ),
      }
    case 'name-wrapper:hca':
      return {
        title: <Trans>Wrapped name access</Trans>,
        detail: (
          <Trans>
            Lets the migration contract move any wrapped name you own.
          </Trans>
        ),
      }
  }
}

export const MigrationApprovalSettings = () => {
  const { owner, hca, approvalsQuery, displayedApprovals, revoke } =
    useMigrationApprovalSettings()
  const activeApprovals = approvalsQuery.data ?? []

  return (
    <section
      aria-labelledby="migration-permissions-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1 pb-1">
        <h2
          className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal"
          id="migration-permissions-heading"
        >
          <Trans>Active access</Trans>
        </h2>
        <p className="text-slate-600 text-sm leading-ens-normal">
          <Trans>
            Remove access you no longer need. Your wallet will ask you to
            confirm each change.
          </Trans>
        </p>
      </div>

      {approvalsQuery.isPending && owner && hca && (
        <div className="flex items-center gap-3 rounded-lg bg-ens-quartz-50 p-4 text-slate-600 text-sm">
          <Loader2Icon aria-hidden className="size-5 animate-spin" />
          <Trans>Checking migration access...</Trans>
        </div>
      )}
      {approvalsQuery.isError && (
        <div
          className="flex flex-col gap-3 rounded-lg bg-ens-garnet-50 p-4 text-ens-garnet-900 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <p className="text-sm">
            <Trans>We couldn't check your migration access.</Trans>
          </p>
          <Button
            className="w-fit uppercase"
            onClick={() => void approvalsQuery.refetch()}
            size="lg"
            type="button"
            variant="lightBlue"
          >
            <Trans>Try again</Trans>
          </Button>
        </div>
      )}
      {approvalsQuery.isSuccess && activeApprovals.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-ens-quartz-50 p-4">
          <MSymbol
            aria-hidden
            className="ms-opsz-20 mt-0.5 text-ens-blue-dark"
            symbol="check"
          />
          <div className="flex flex-col gap-1">
            <p className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
              <Trans>No migration access to remove</Trans>
            </p>
            <p className="text-slate-600 text-sm leading-ens-normal">
              <Trans>You're all set.</Trans>
            </p>
          </div>
        </div>
      )}
      {displayedApprovals.map((approval) => {
        const description = approvalDescription(approval.id)
        const isTemporary = approval.id === 'eth-registry:hca'
        const isRevoking =
          revoke.isPending && revoke.variables?.id === approval.id
        return (
          <div
            className="flex flex-col gap-3 rounded-lg bg-ens-quartz-50 p-4 md:flex-row md:items-start md:justify-between md:gap-4"
            key={approval.id}
          >
            <div className="flex flex-1 items-start gap-2">
              <MSymbol
                aria-hidden
                className="ms-opsz-20 mt-0.5 shrink-0 text-ens-quartz-500"
                symbol="key_vertical"
              />
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
                    {description.title}
                  </p>
                  {isTemporary && (
                    <span className="rounded bg-ens-garnet-50 px-2 py-0.5 text-ens-garnet-900 text-xs">
                      <Trans>Temporary</Trans>
                    </span>
                  )}
                </div>
                <p className="text-slate-600 text-sm leading-ens-normal">
                  {description.detail}
                </p>
              </div>
            </div>
            <Button
              className="w-full uppercase md:w-auto"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(approval)}
              size="lg"
              type="button"
              variant="lightBlue"
            >
              {isRevoking ? (
                <>
                  <Loader2Icon aria-hidden className="size-4 animate-spin" />
                  <Trans>Removing...</Trans>
                </>
              ) : (
                <Trans>Remove access</Trans>
              )}
            </Button>
          </div>
        )
      })}
      {revoke.isError && (
        <p
          className="rounded-lg bg-ens-garnet-50 p-4 text-ens-garnet-900 text-sm"
          role="alert"
        >
          <Trans>
            We couldn't remove access. Check your wallet and try again.
          </Trans>
        </p>
      )}
    </section>
  )
}
