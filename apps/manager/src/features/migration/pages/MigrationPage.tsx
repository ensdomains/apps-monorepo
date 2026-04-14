import { Trans, useLingui } from '@lingui/react/macro'
import { AlertTriangle } from 'lucide-react'
import { motion } from 'motion/react'
import { type ReactNode, useCallback } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { SkipReasonLabel } from '@/features/migration/components/SkipReasonLabel'
import { SuccessModal } from '@/features/migration/components/SuccessModal'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import type { SkippedName } from '@/features/migration/service/migrationService'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import type { MigrationError } from '@/features/migration/state/migrationUi.machine'
import {
  useMigrationLastError,
  useMigrationMigratedNames,
  useMigrationSelectedNames,
  useMigrationSkippedNames,
  useMigrationStep,
} from '@/features/migration/state/migrationUi.selectors'
import { useSmartAccountContext } from '@/lib/smart-account'

const SkippedNamesList = ({
  skippedNames,
}: {
  skippedNames: readonly SkippedName[]
}) => {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md rounded-sm bg-ens-garnet-900/5 p-4"
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.4, delay: 0.25 }}
    >
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-ens-garnet-900/60" />
        <p className="font-semi-mono text-ens-garnet-900/80 text-xs uppercase tracking-[0.12px]">
          <Trans>{skippedNames.length} name(s) could not be migrated</Trans>
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {skippedNames.map((skipped) => (
          <li
            className="flex flex-wrap items-start gap-1 text-xs leading-[1.4]"
            key={skipped.name}
          >
            <span className="shrink-0 font-medium text-ens-garnet-900/80">
              {skipped.name}
            </span>
            <span className="text-ens-garnet-900/50">
              &mdash; <SkipReasonLabel reason={skipped.reason} />
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

const ResultLayout = ({ children }: { children: ReactNode }) => (
  <motion.div
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-5"
    initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
    transition={{ duration: 0.5, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
)

const formatMigrationError = (
  error: MigrationError,
  t: ReturnType<typeof useLingui>['t'],
) => {
  switch (error.type) {
    case 'preflight-failure':
      return t`${error.count} name(s) could not be migrated due to pre-flight check failures.`
    case 'generic':
      return error.message
  }
}

export const MigrationPage = () => {
  const { t } = useLingui()
  const { uiActor } = useMigrationUiContext()
  const step = useMigrationStep(uiActor)
  const selectedNames = useMigrationSelectedNames(uiActor)
  const skippedNames = useMigrationSkippedNames(uiActor)
  const migratedNames = useMigrationMigratedNames(uiActor)
  const lastError = useMigrationLastError(uiActor)
  const { data: v1Names = [] } = useV1Names()
  const { ownerAddress } = useSmartAccountContext()

  const handleNamesChange = useCallback(
    (names: string[]) => uiActor.send({ type: 'selection.set', names }),
    [uiActor],
  )

  const handleBeginUpgrade = useCallback(() => {
    if (!ownerAddress) return
    const selectedSet = new Set(selectedNames)
    const domains = v1Names.filter((d) => selectedSet.has(d.name))
    if (domains.length === 0) return
    uiActor.send({
      type: 'migration.start',
      domains,
      ownerAddress: ownerAddress as Address,
    })
  }, [v1Names, ownerAddress, selectedNames, uiActor])

  return (
    <div className="relative h-[calc(100dvh-80px)] overflow-hidden bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200">
      <GrainOverlay />

      {match(step)
        .with('select', () => (
          <SelectNamesStep
            onNamesChange={handleNamesChange}
            onNext={handleBeginUpgrade}
          />
        ))
        .with('migrate', () => <GameStep />)
        .with('failure', () => (
          <ResultLayout>
            <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Trans>Migration failed</Trans>
            </p>
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="max-h-[200px] w-full max-w-md overflow-y-auto rounded-sm bg-ens-garnet-900/5 p-3"
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <p className="whitespace-pre-wrap break-all font-mono text-ens-garnet-900/70 text-xs leading-normal">
                {lastError && formatMigrationError(lastError, t)}
              </p>
            </motion.div>

            {skippedNames.length > 0 && (
              <SkippedNamesList skippedNames={skippedNames} />
            )}

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              <button
                className="rounded-sm bg-ens-garnet-900/10 px-4 py-3 font-semi-mono text-ens-garnet-900 text-sm uppercase tracking-[1.68px]"
                onClick={() => uiActor.send({ type: 'cancel' })}
                type="button"
              >
                <Trans>Back</Trans>
              </button>
              <button
                className="rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
                onClick={() => uiActor.send({ type: 'retry' })}
                type="button"
              >
                <Trans>Retry</Trans>
              </button>
            </motion.div>
          </ResultLayout>
        ))
        .with('partialSuccess', () => (
          <SuccessModal
            migratedNames={migratedNames}
            onClose={() => uiActor.send({ type: 'done' })}
            open
            skippedNames={skippedNames}
          />
        ))
        .with('success', () => (
          <SuccessModal
            migratedNames={migratedNames}
            onClose={() => uiActor.send({ type: 'done' })}
            open
            skippedNames={skippedNames}
          />
        ))
        .exhaustive()}
    </div>
  )
}
