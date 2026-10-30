import { Plural, Trans } from '@lingui/react/macro'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useRef } from 'react'
import { match } from 'ts-pattern'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SubnameMigrationImpactState } from '../hooks/useSubnameMigrationImpact'

const linkClassName =
  'rounded-sm font-medium text-ens-garnet-900 underline decoration-ens-garnet-900/30 underline-offset-4 hover:decoration-ens-garnet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ens-quartz-100'

const ImpactSummary = ({
  state,
  isLoading,
}: {
  readonly state: SubnameMigrationImpactState
  readonly isLoading: boolean
}) => {
  const isError = state.status === 'error'
  const affectedCount = state.impact?.affectedCount ?? 0
  const hasImpact = affectedCount > 0
  const unrecoverable = state.impact?.unrecoverable ?? []
  const hasUnrecoverable = unrecoverable.length > 0
  return (
    <div aria-live="polite" className="mt-5 shrink-0">
      {match({ isLoading, isError, hasImpact, hasUnrecoverable })
        .with({ isLoading: true }, () => (
          <div
            className="flex items-center gap-2 py-3 text-ens-garnet-900/65 text-sm"
            role="status"
          >
            <LoaderCircle
              aria-hidden="true"
              className="size-4 motion-safe:animate-spin"
            />
            <Trans>Checking subname impact...</Trans>
          </div>
        ))
        .with({ isError: true }, () => (
          <button
            className={`${linkClassName} min-h-11 px-1 text-sm`}
            onClick={state.retry}
            type="button"
          >
            <Trans>Check again</Trans>
          </button>
        ))
        .with({ hasImpact: true }, () => (
          <div className="rounded-xl border border-ens-garnet-900/10 bg-white/60 p-4">
            <p className="mb-3 font-medium text-ens-garnet-900/65 text-xs uppercase tracking-wider">
              <Plural
                one="# affected subname"
                other="# affected subnames"
                value={affectedCount}
              />
            </p>
            <ul className="space-y-3">
              {state.impact?.parents.map(({ name, affectedCount: count }) => (
                <li
                  className="flex items-baseline justify-between gap-4 text-sm"
                  key={name}
                >
                  <span className="min-w-0 break-all font-medium">{name}</span>
                  <span className="shrink-0 text-ens-garnet-900/65 tabular-nums">
                    <Plural one="# subname" other="# subnames" value={count} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
        .with({ hasUnrecoverable: true }, () => (
          <div className="rounded-xl border border-ens-garnet-900/10 bg-white/60 p-4">
            <p className="mb-3 font-medium text-ens-garnet-900/65 text-xs uppercase tracking-wider">
              <Plural
                one="# subname left on ENSv1"
                other="# subnames left on ENSv1"
                value={unrecoverable.length}
              />
            </p>
            <ul className="space-y-3">
              {unrecoverable.map((name) => (
                <li className="break-all font-medium text-sm" key={name}>
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ))
        .otherwise(() => null)}
    </div>
  )
}

export const SubnameMigrationDialog = ({
  isOpen,
  state,
  isChecking,
  hasAcknowledgedImpact,
  onAcknowledgeImpact,
  onCancel,
  onContinue,
  onRestoreFocus,
}: {
  readonly isOpen: boolean
  readonly selectedNameCount: number
  readonly state: SubnameMigrationImpactState
  readonly isChecking: boolean
  readonly hasAcknowledgedImpact: boolean
  readonly onAcknowledgeImpact: (isAcknowledged: boolean) => void
  readonly onCancel: () => void
  readonly onContinue: () => void
  readonly onRestoreFocus: () => void
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const isLoading = state.status === 'loading' || isChecking
  const isError = state.status === 'error'
  const affectedCount = state.impact?.affectedCount ?? 0
  const hasImpact = affectedCount > 0
  const hasUnrecoverable = (state.impact?.unrecoverable.length ?? 0) > 0

  return (
    <Dialog
      onOpenChange={(isNextOpen) => !isNextOpen && onCancel()}
      open={isOpen}
    >
      <DialogContent
        className="gap-0 overflow-y-auto rounded-3xl border-ens-garnet-900/10 bg-ens-quartz-100 p-6 text-ens-garnet-900 shadow-xl motion-reduce:animate-none sm:max-w-lg sm:p-8"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        overlayClassName="bg-ens-garnet-950/35 backdrop-blur-sm motion-reduce:animate-none"
        showCloseButton={false}
      >
        <div className="mb-5 flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <CircleAlert aria-hidden="true" className="size-5" />
        </div>
        <DialogTitle className="text-balance font-normal text-2xl leading-tight tracking-tight sm:text-3xl">
          {match({ isError, isLoading, hasImpact, hasUnrecoverable })
            .with({ isError: true }, () => (
              <Trans>We couldn&apos;t check your subnames</Trans>
            ))
            .with({ isLoading: true }, () => (
              <Trans>Checking your subnames</Trans>
            ))
            .with({ hasImpact: true }, () => (
              <Trans>These subnames can&apos;t be preserved yet</Trans>
            ))
            .with({ hasUnrecoverable: true }, () => (
              <Trans>Some subnames will be left behind</Trans>
            ))
            .otherwise(() => (
              <Trans>Your subnames are unaffected</Trans>
            ))}
        </DialogTitle>
        <DialogDescription className="mt-3 shrink-0 text-pretty text-base text-ens-garnet-900/75 leading-relaxed">
          {match({ isError, isLoading, hasImpact, hasUnrecoverable })
            .with({ isError: true }, () => (
              <Trans>
                The impact is unknown. Try again or contact{' '}
                <a
                  className={linkClassName}
                  href="https://support.ens.domains"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  support
                </a>{' '}
                before upgrading.
              </Trans>
            ))
            .with({ isLoading: true }, () => (
              <Trans>Checking the latest name state before you continue.</Trans>
            ))
            .with({ hasImpact: true }, () => (
              <Trans>
                This upgrade cannot preserve every subname below the selected
                parents. Keep those parents on ENSv1 for now, where their
                subnames keep working. Return to your selection and remove the
                affected parents before continuing.
              </Trans>
            ))
            .with({ hasUnrecoverable: true }, () => (
              <Trans>
                These subnames were created without publishing their names
                onchain, so they can&apos;t be recreated on ENSv2. They stop
                working once their parent is upgraded. Every other subname is
                upgraded with it.
              </Trans>
            ))
            .otherwise(() => (
              <Trans>
                The latest check found no affected subnames. You can continue
                with the upgrade.
              </Trans>
            ))}
        </DialogDescription>
        <ImpactSummary isLoading={isLoading} state={state} />
        {hasUnrecoverable && !hasImpact && !isLoading && !isError && (
          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              checked={hasAcknowledgedImpact}
              className="size-4 shrink-0 accent-ens-garnet-900"
              onChange={(event) => onAcknowledgeImpact(event.target.checked)}
              type="checkbox"
            />
            <span>
              <Trans>
                I understand these subnames will stop working after the upgrade.
              </Trans>
            </span>
          </label>
        )}
        {hasImpact && !isLoading && (
          <a
            className={`${linkClassName} mt-3 inline-flex min-h-11 items-center text-sm`}
            href="/dashboard#subname-upgrades"
          >
            <Trans>Learn how subnames affect upgrades</Trans>
          </a>
        )}
        <div className="mt-7 flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
          <button
            className="min-h-12 flex-1 rounded-xl border border-ens-garnet-900/15 bg-transparent px-5 font-medium text-sm transition-colors hover:bg-ens-garnet-900/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ens-quartz-100 motion-reduce:transition-none"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            <Trans>Back to selection</Trans>
          </button>
          <button
            className="min-h-12 flex-1 rounded-xl bg-ens-garnet-900 px-5 font-medium text-ens-quartz-100 text-sm transition-colors hover:bg-ens-garnet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ens-quartz-100 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            disabled={
              isLoading ||
              state.status !== 'ready' ||
              !state.canReview ||
              hasImpact ||
              (hasUnrecoverable && !hasAcknowledgedImpact)
            }
            onClick={onContinue}
            type="button"
          >
            <Trans>Continue migration</Trans>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
