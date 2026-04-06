import { Trans } from '@lingui/react/macro'
import { useMachine } from '@xstate/react'
import { AlertTriangle } from 'lucide-react'
import { motion } from 'motion/react'
import { type ReactNode, useCallback, useMemo } from 'react'
import { match } from 'ts-pattern'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { SuccessModal } from '@/features/migration/components/SuccessModal'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { migrationMachine } from '@/features/migration/machines/migrationMachine'
import type {
  MigrationResult,
  SkippedName,
} from '@/features/migration/service/migrationService'

const SkipReasonLabel = ({ reason }: { reason: SkippedName['reason'] }) => {
  const labels: Record<SkippedName['reason'], ReactNode> = {
    'not-premigrated': <Trans>Not yet premigrated in ENS v2</Trans>,
    'frozen-approval': (
      <Trans>Has a frozen approval that prevents migration</Trans>
    ),
    'transfer-failed': <Trans>Transfer reverted on-chain</Trans>,
  }
  return <>{labels[reason]}</>
}

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

export const MigrationPage = () => {
  const [state, send] = useMachine(migrationMachine)
  const { data: v1Names = [] } = useV1Names()

  const selectedDomains = useMemo(() => {
    const selectedSet = new Set(state.context.selectedNames)
    return v1Names.filter(
      (n): n is typeof n & { name: string } =>
        n.name != null && selectedSet.has(n.name),
    )
  }, [v1Names, state.context.selectedNames])

  const handleNamesChange = useCallback(
    (names: string[]) => send({ type: 'SELECT_NAMES', names }),
    [send],
  )

  const handleMigrationComplete = useCallback(
    (result: MigrationResult) => {
      send({
        type: 'MIGRATION_COMPLETE',
        txHashes: result.txHashes,
        skipped: result.skipped,
        migratedNames: selectedDomains
          .filter((d) => !result.skipped.some((s) => s.name === d.name))
          .map((d) => d.name),
      })
    },
    [send, selectedDomains],
  )

  const handleMigrationError = useCallback(
    (error: string) => {
      send({ type: 'MIGRATION_ERROR', error })
    },
    [send],
  )

  const { skippedNames } = state.context

  return (
    <div className="relative h-[calc(100dvh-80px)] overflow-hidden bg-linear-to-b from-[#feeaf0] to-[#ffc5df]">
      <GrainOverlay />

      {match(state.value)
        .with('selectNames', () => (
          <SelectNamesStep
            onNamesChange={handleNamesChange}
            onNext={() => send({ type: 'BEGIN_UPGRADE' })}
          />
        ))
        .with('migrating', () => (
          <GameStep
            domains={selectedDomains}
            onComplete={handleMigrationComplete}
            onError={handleMigrationError}
          />
        ))
        .with('error', () => (
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
                {state.context.error}
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
                onClick={() => send({ type: 'RESET' })}
                type="button"
              >
                <Trans>Back</Trans>
              </button>
              <button
                className="rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
                onClick={() => send({ type: 'RETRY' })}
                type="button"
              >
                <Trans>Retry</Trans>
              </button>
            </motion.div>
          </ResultLayout>
        ))
        .with('partialSuccess', () => (
          <ResultLayout>
            <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Trans>Some names could not be migrated</Trans>
            </p>

            <SkippedNamesList skippedNames={skippedNames} />

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4, delay: 0.35 }}
            >
              <button
                className="rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
                onClick={() => send({ type: 'DONE' })}
                type="button"
              >
                <Trans>Done</Trans>
              </button>
            </motion.div>
          </ResultLayout>
        ))
        .with('success', () => (
          <SuccessModal onClose={() => send({ type: 'DONE' })} open />
        ))
        .exhaustive()}
    </div>
  )
}
