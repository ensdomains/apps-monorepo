import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { type ReactNode, useCallback } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { SuccessModal } from '@/features/migration/components/SuccessModal'
import { useMigrationPreflight } from '@/features/migration/hooks/useMigrationPreflight'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import type { MigrationError } from '@/features/migration/state/migrationUi.machine'
import {
  useMigrationLastError,
  useMigrationMigratedNames,
  useMigrationSelectedNames,
  useMigrationStep,
} from '@/features/migration/state/migrationUi.selectors'
import { useSmartAccountContext } from '@/lib/smart-account'

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

const formatMigrationError = (error: MigrationError): ReactNode => {
  switch (error.type) {
    case 'generic':
      return error.message
    case 'resolver-deploy-failed':
      return (
        <>
          <div>Couldn't set up your v2 resolver.</div>
          <div>{error.message}</div>
          <div>You can retry below.</div>
        </>
      )
    case 'profile-fetch-failed':
      return (
        <>
          <div>Couldn't read your current ENS records ({error.phase}).</div>
          <div>{error.message}</div>
          <div>You can retry below.</div>
        </>
      )
  }
}

export const MigrationPage = () => {
  const navigate = useNavigate()
  const { uiActor } = useMigrationUiContext()
  const step = useMigrationStep(uiActor)
  const selectedNames = useMigrationSelectedNames(uiActor)
  const migratedNames = useMigrationMigratedNames(uiActor)
  const lastError = useMigrationLastError(uiActor)
  const { data: v1Names = [] } = useV1Names()
  const smartAccount = useSmartAccountContext()
  const { ownerAddress, accountAddress } = smartAccount
  const selectedSet = new Set(selectedNames)
  const selectedDomains = v1Names.filter((d) => selectedSet.has(d.name))
  const { ensure: ensurePreflight } = useMigrationPreflight({
    eoa: ownerAddress as Address | undefined,
    scaAddress: accountAddress as Address | undefined,
    domains: selectedDomains,
  })

  const handleSuccessClose = useCallback(() => {
    uiActor.send({ type: 'done' })
    navigate({ to: '/dashboard' })
  }, [uiActor, navigate])

  const handleNamesChange = useCallback(
    (names: string[]) => uiActor.send({ type: 'selection.set', names }),
    [uiActor],
  )

  const handleBeginUpgrade = useCallback(async () => {
    if (!ownerAddress || !smartAccount.signer || !smartAccount.accountAddress)
      return
    const { signer, accountAddress: sca } = smartAccount
    const domains = v1Names.filter((d) => selectedSet.has(d.name))
    if (domains.length === 0) return
    const preflight = await ensurePreflight()
    uiActor.send({
      type: 'migration.start',
      domains,
      ownerAddress: ownerAddress as Address,
      signer,
      accountAddress: sca as Address,
      preflight,
    })
  }, [
    v1Names,
    ownerAddress,
    smartAccount,
    selectedSet,
    uiActor,
    ensurePreflight,
  ])

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
                {lastError && formatMigrationError(lastError)}
              </p>
            </motion.div>

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
        .with('success', () => (
          <SuccessModal
            migratedNames={migratedNames}
            onClose={handleSuccessClose}
            open
          />
        ))
        .exhaustive()}
    </div>
  )
}
