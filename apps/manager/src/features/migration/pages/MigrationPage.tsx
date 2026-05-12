import type { Signer } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { type ReactNode, useCallback, useEffect } from 'react'
import { match } from 'ts-pattern'
import type { Address, PublicClient, WalletClient } from 'viem'
import { useConfig, usePublicClient, useWalletClient } from 'wagmi'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { SuccessModal } from '@/features/migration/components/SuccessModal'
import { useMigrationPreflight } from '@/features/migration/hooks/useMigrationPreflight'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { buildMigrationPlan } from '@/features/migration/service/buildMigrationPlan'
import {
  decodeMigrationError,
  type MigrationError,
} from '@/features/migration/service/decodeMigrationError'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import {
  useMigrateSubstep,
  useMigrationLastError,
  useMigrationMigratedNames,
  useMigrationSelectedNames,
  useMigrationStep,
} from '@/features/migration/state/migrationUi.selectors'
import { useSmartAccountContext } from '@/lib/smart-account'
import {
  isMigrationQueryKey,
  selectDomainsFromNames,
} from './MigrationPage.helpers'

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
      return <div>Couldn&apos;t finish setting up your account.</div>
    case 'profile-fetch-failed':
      return <div>Couldn&apos;t read your current records.</div>
    case 'user-rejected':
      return <div>Request cancelled.</div>
    case 'preflight-timeout':
      return <div>This is taking longer than expected.</div>
    case 'parent-not-migrated':
      return (
        <div>
          <Trans>Upgrade {error.parentName} first.</Trans>
        </div>
      )
    case 'not-approved-operator':
      return (
        <div>
          <Trans>Permission missing. Please try again.</Trans>
        </div>
      )
    case 'wrapped-owner-mismatch':
    case 'name-data-mismatch':
    case 'invalid-data':
      return (
        <div>
          <Trans>Something went wrong. Please refresh and try again.</Trans>
        </div>
      )
    case 'name-not-locked':
    case 'name-requires-migration':
      return (
        <div>
          <Trans>
            Couldn&apos;t upgrade one of your names. Please try again.
          </Trans>
        </div>
      )
    case 'name-is-locked':
    case 'frozen-token-approval':
      return (
        <div>
          <Trans>One of your names can&apos;t be upgraded right now.</Trans>
        </div>
      )
  }
}

const invalidateMigrationQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  queryClient.invalidateQueries({
    predicate: (query) => isMigrationQueryKey(query.queryKey),
  })
}

export const MigrationPage = () => {
  const navigate = useNavigate()
  const { uiActor } = useMigrationUiContext()
  const step = useMigrationStep(uiActor)
  const migrateSubstep = useMigrateSubstep(uiActor)
  const selectedNames = useMigrationSelectedNames(uiActor)
  const migratedNames = useMigrationMigratedNames(uiActor)
  const lastError = useMigrationLastError(uiActor)
  const { data: v1Names = [] } = useV1Names()
  const { ownerAddress } = useSmartAccountContext()
  const { data: wagmiWalletClient } = useWalletClient()
  const wagmiConfig = useConfig()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const { ensure: ensurePreflight } = useMigrationPreflight({
    eoa: ownerAddress as Address | undefined,
  })

  useEffect(() => {
    if (migrateSubstep === 'succeeding') {
      invalidateMigrationQueries(queryClient)
    }
  }, [migrateSubstep, queryClient])

  const handleSuccessClose = useCallback(() => {
    uiActor.send({ type: 'done' })
    navigate({ to: '/dashboard' })
  }, [uiActor, navigate])

  const handleNamesChange = useCallback(
    (names: string[]) => uiActor.send({ type: 'selection.set', names }),
    [uiActor],
  )

  const handleBeginUpgrade = useCallback(async () => {
    if (!ownerAddress || !wagmiWalletClient?.account) return
    if (!publicClient) return
    const signer: Signer = {
      type: 'eoa',
      walletClient: wagmiWalletClient as WalletClient,
    }
    const domains = selectDomainsFromNames(v1Names, selectedNames)
    if (domains.length === 0) return

    try {
      const preflight = await ensurePreflight(domains)
      const plan = await buildMigrationPlan({
        domains,
        migrationOwner: ownerAddress as Address,
        wagmiConfig,
        publicClient: publicClient as unknown as PublicClient,
        preflight,
        hasBaseRegistrarApproval: preflight.baseRegistrarApproved,
        hasNameWrapperApproval: preflight.nameWrapperApproved,
      })

      uiActor.send({
        type: 'migration.start',
        plan,
        signer,
        accountAddress: ownerAddress as Address,
      })
    } catch (err) {
      uiActor.send({
        type: 'migration.failed',
        error: decodeMigrationError(err),
      })
    }
  }, [
    v1Names,
    ownerAddress,
    wagmiWalletClient,
    selectedNames,
    uiActor,
    ensurePreflight,
    wagmiConfig,
    publicClient,
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
