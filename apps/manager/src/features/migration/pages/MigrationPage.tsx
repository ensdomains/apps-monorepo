import { Trans, useLingui } from '@lingui/react/macro'
import { AlertTriangle } from 'lucide-react'
import { motion } from 'motion/react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { SuccessModal } from '@/features/migration/components/SuccessModal'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import type { SkippedName } from '@/features/migration/service/migrationService'
import {
  buildSyntheticDomain,
  type CustomNameSeed,
} from '@/features/migration/service/syntheticDomain'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
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

// TEMP: dev-only persistence for the custom-name migration input.
const CUSTOM_SEEDS_STORAGE_KEY = 'ens-migration-dev-custom-names'

const loadCustomSeeds = (): CustomNameSeed[] => {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(CUSTOM_SEEDS_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is CustomNameSeed =>
        s &&
        typeof s.name === 'string' &&
        (s.tokenType === 'unwrapped' ||
          s.tokenType === 'unlocked' ||
          s.tokenType === 'locked-2ld'),
    )
  } catch {
    return []
  }
}

const saveCustomSeeds = (seeds: readonly CustomNameSeed[]) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CUSTOM_SEEDS_STORAGE_KEY, JSON.stringify(seeds))
}

const SkipReasonLabel = ({ reason }: { reason: SkippedName['reason'] }) => {
  const labels: Record<SkippedName['reason'], ReactNode> = {
    'not-premigrated': <Trans>Not yet premigrated in ENS v2</Trans>,
    'frozen-approval': (
      <Trans>Has a frozen approval that prevents migration</Trans>
    ),
    'transfer-failed': <Trans>Transfer reverted on-chain</Trans>,
    'invalid-data': <Trans>Invalid migration data encoding</Trans>,
    'name-data-mismatch': (
      <Trans>Name data does not match the migration receiver</Trans>
    ),
    'name-is-locked': (
      <Trans>Name is locked and was sent to the wrong controller</Trans>
    ),
    'name-not-locked': (
      <Trans>
        Name is not locked/emancipated and cannot use this controller
      </Trans>
    ),
    'frozen-token-approval': (
      <Trans>Has an irrevocable approval that blocks migration</Trans>
    ),
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
  // TEMP: dev-only custom-name seeds (persisted) → rebuilt into V1Domain[]
  const [customSeeds, setCustomSeeds] = useState<readonly CustomNameSeed[]>(
    () => loadCustomSeeds(),
  )

  const customDomains = useMemo<readonly V1Domain[]>(() => {
    if (!ownerAddress) return []
    return customSeeds.map((seed) =>
      buildSyntheticDomain(seed.name, ownerAddress as Address, seed.tokenType),
    )
  }, [customSeeds, ownerAddress])

  const handleAddCustomName = useCallback((seed: CustomNameSeed) => {
    setCustomSeeds((prev) => {
      if (prev.some((s) => s.name === seed.name)) return prev
      const next = [...prev, seed]
      saveCustomSeeds(next)
      return next
    })
  }, [])

  const handleRemoveCustomName = useCallback((name: string) => {
    setCustomSeeds((prev) => {
      const next = prev.filter((s) => s.name !== name)
      if (next.length === prev.length) return prev
      saveCustomSeeds(next)
      return next
    })
  }, [])

  const allDomains = useMemo(
    () => [...v1Names, ...customDomains],
    [v1Names, customDomains],
  )

  const handleNamesChange = useCallback(
    (names: string[]) => uiActor.send({ type: 'selection.set', names }),
    [uiActor],
  )

  const handleBeginUpgrade = useCallback(() => {
    if (!ownerAddress) return
    const selectedSet = new Set(selectedNames)
    const domains = allDomains.filter((d) => selectedSet.has(d.name))
    if (domains.length === 0) return
    uiActor.send({
      type: 'migration.start',
      domains,
      ownerAddress: ownerAddress as Address,
    })
  }, [allDomains, ownerAddress, selectedNames, uiActor])

  // Drop custom seeds for names that have just been migrated.
  const seenMigratedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const newlyMigrated = migratedNames.filter(
      (n) => !seenMigratedRef.current.has(n),
    )
    seenMigratedRef.current = new Set(migratedNames)
    if (newlyMigrated.length === 0) return
    const newlySet = new Set(newlyMigrated)
    setCustomSeeds((prev) => {
      const next = prev.filter((s) => !newlySet.has(s.name))
      if (next.length === prev.length) return prev
      saveCustomSeeds(next)
      return next
    })
  }, [migratedNames])

  return (
    <div className="relative h-[calc(100dvh-80px)] overflow-hidden bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200">
      <GrainOverlay />

      {match(step)
        .with('select', () => (
          <SelectNamesStep
            customDomains={customDomains}
            onAddCustomName={handleAddCustomName}
            onNamesChange={handleNamesChange}
            onNext={handleBeginUpgrade}
            onRemoveCustomName={handleRemoveCustomName}
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
                className="rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
                onClick={() => uiActor.send({ type: 'done' })}
                type="button"
              >
                <Trans>Done</Trans>
              </button>
            </motion.div>
          </ResultLayout>
        ))
        .with('success', () => (
          <SuccessModal
            migratedNames={migratedNames}
            onClose={() => uiActor.send({ type: 'done' })}
            open
          />
        ))
        .exhaustive()}
    </div>
  )
}
