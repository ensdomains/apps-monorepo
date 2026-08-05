import type { Signer } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCanGoBack, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address, WalletClient } from 'viem'
import { useWalletClient } from 'wagmi'
import { MSymbol } from '@/components/ui/material-symbol'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { MigrationSuccessDialog } from '@/features/migration/components/MigrationSuccessDialog'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { CommemorativeNftClaimDialog } from '@/features/migration/components/success/CommemorativeNftClaimDialog'
import { useMigrationGasEstimate } from '@/features/migration/hooks/useMigrationGasEstimate'
import { useMigrationGasFunding } from '@/features/migration/hooks/useMigrationGasFunding'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import {
  decodeMigrationError,
  type MigrationError,
} from '@/features/migration/service/decodeMigrationError'
import { loadMigrationApprovalLedger } from '@/features/migration/service/migrationApprovalLedger'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import {
  useMigrationCompleted,
  useMigrationLastError,
  useMigrationMigratedNames,
  useMigrationSelectedNames,
  useMigrationStep,
} from '@/features/migration/state/migrationUi.selectors'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { useSmartAccountContext } from '@/lib/smart-account'
import { customSepolia } from '@/lib/wagmi'
import { isMigrationQueryKey } from './MigrationPage.helpers'

const ResultLayout = ({ children }: { children: ReactNode }) => (
  <motion.div
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-5"
    initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
    transition={{ duration: 0.5, ease: 'easeOut' }}
  >
    {children}
  </motion.div>
)

const disabledNftSuccessState = {
  status: 'error',
  stage: 'configuration',
  message: '',
} as const

const noop = () => undefined

const PlainMigrationSuccessDialog = ({
  onContinue,
}: {
  readonly onContinue: () => void
}) => (
  <MigrationSuccessDialog
    canMint={false}
    context="migration"
    onClose={onContinue}
    onMint={noop}
    onRetry={noop}
    onRevealComplete={noop}
    onViewProfile={onContinue}
    open
    state={disabledNftSuccessState}
  />
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
  const canGoBack = useCanGoBack()
  const { uiActor } = useMigrationUiContext()
  const step = useMigrationStep(uiActor)
  const selectedNames = useMigrationSelectedNames(uiActor)
  const migratedNames = useMigrationMigratedNames(uiActor)
  const lastError = useMigrationLastError(uiActor)
  const migrationCompleted = useMigrationCompleted(uiActor)
  const { data: v1Names = [] } = useV1Names()
  const {
    ownerAddress,
    accountAddress: hcaAddress,
    client: hcaClient,
    refreshAccount,
  } = useSmartAccountContext()
  const { data: wagmiWalletClient } = useWalletClient()
  const queryClient = useQueryClient()
  const migrationNftEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.MIGRATION_NFT,
    false,
  )
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const isMigrationSuccess = step === 'success'
  const dialogOpen =
    migrationNftEnabled && (isMigrationSuccess || isPreviewOpen)
  const dialogNames = isMigrationSuccess ? migratedNames : selectedNames
  const gasEstimate = useMigrationGasEstimate({
    ownerAddress: ownerAddress as Address | undefined,
    hcaAddress: hcaAddress as Address | undefined,
    selectedNames,
    v1Names,
  })

  // Top up the owner's sepETH on page entry — migration txs are all EOA-paid.
  // The worker only drips when the address owns v1 names and is low on ETH,
  // so this is idempotent and a no-op for everyone else. The request doesn't
  // resolve until any drip is confirmed on-chain, so we gate the upgrade
  // button on `gasFundingStatus` to stop owners starting before the ETH lands.
  const gasFundingStatus = useMigrationGasFunding(ownerAddress)

  useEffect(() => {
    if (step === 'success') {
      invalidateMigrationQueries(queryClient)
    }
  }, [step, queryClient])

  useEffect(() => {
    if (
      step !== 'select' ||
      !ownerAddress ||
      !hcaAddress ||
      !wagmiWalletClient?.account
    ) {
      return
    }
    const approvals = loadMigrationApprovalLedger({
      chainId: customSepolia.id,
      owner: ownerAddress,
      hca: hcaAddress,
    })
    if (approvals.length === 0) return

    uiActor.send({
      type: 'cleanup.restore',
      approvals,
      signer: {
        type: 'eoa',
        walletClient: wagmiWalletClient as WalletClient,
      },
      walletAddress: ownerAddress,
      hcaAddress,
    })
  }, [step, ownerAddress, hcaAddress, wagmiWalletClient, uiActor])

  const handleSuccessClose = useCallback(
    (profileName?: string) => {
      if (isMigrationSuccess) {
        uiActor.send({ type: 'done' })
        const destinationName = profileName ?? dialogNames[0]
        if (destinationName) {
          navigate({ to: '/$name', params: { name: destinationName } })
          return
        }
        navigate({ to: '/dashboard' })
        return
      }

      setIsPreviewOpen(false)
    },
    [dialogNames, isMigrationSuccess, uiActor, navigate],
  )

  const handleViewProfile = useCallback(
    (profileName?: string) => {
      const name = profileName ?? dialogNames[0]

      if (isMigrationSuccess) {
        uiActor.send({ type: 'done' })
      } else {
        setIsPreviewOpen(false)
      }

      if (name) {
        navigate({ to: '/$name', params: { name } })
        return
      }

      navigate({ to: '/dashboard' })
    },
    [dialogNames, isMigrationSuccess, uiActor, navigate],
  )

  const handlePlainSuccess = useCallback(
    () => handleViewProfile(),
    [handleViewProfile],
  )

  const handleNamesChange = useCallback(
    (names: string[]) => uiActor.send({ type: 'selection.set', names }),
    [uiActor],
  )

  const handleBack = useCallback(() => {
    if (canGoBack) {
      window.history.back()
      return
    }

    navigate({ to: '/dashboard' })
  }, [canGoBack, navigate])

  const handleBeginUpgrade = useCallback(async () => {
    if (
      !ownerAddress ||
      !hcaAddress ||
      !hcaClient ||
      !wagmiWalletClient?.account
    )
      return false
    if (gasEstimate.status !== 'ready') return false
    // Don't let the owner start before their gas drip is confirmed on-chain.
    if (gasFundingStatus === 'funding') return false
    const signer: Signer = {
      type: 'eoa',
      walletClient: wagmiWalletClient as WalletClient,
    }

    try {
      uiActor.send({
        type: 'migration.start',
        plan: gasEstimate.plan,
        signer,
        hcaClient,
        refreshAccount,
      })
      return true
    } catch (err) {
      uiActor.send({
        type: 'migration.failed',
        error: decodeMigrationError(err),
      })
      return true
    }
  }, [
    ownerAddress,
    hcaAddress,
    hcaClient,
    refreshAccount,
    wagmiWalletClient,
    gasEstimate,
    gasFundingStatus,
    uiActor,
  ])

  return (
    <div
      className="relative flex h-[calc(100dvh-80px)] min-h-0 w-full flex-1 flex-col overflow-hidden" // 80px is the md+ Manager header height.
    >
      <GrainOverlay className="opacity-70" />

      {step === 'select' && (
        <>
          <button
            aria-label="Back"
            className="absolute top-6 left-5 z-20 inline-flex items-center gap-2 py-2 font-medium text-ens-garnet-900 text-sm uppercase leading-ens-none transition-colors hover:text-ens-garnet-900/70 md:left-8"
            onClick={handleBack}
            type="button"
          >
            <MSymbol className="ms-opsz-24 ms-wght-500" symbol="arrow_back" />
            <span className="max-xl:hidden">
              <Trans>Back</Trans>
            </span>
          </button>
          {import.meta.env.DEV && migrationNftEnabled ? (
            <button
              className="absolute top-6 right-5 z-20 px-2 py-2 text-ens-garnet-900 text-xs underline underline-offset-2 md:right-8"
              onClick={() => setIsPreviewOpen(true)}
              type="button"
            >
              <Trans>Preview success dialog</Trans>
            </button>
          ) : null}
        </>
      )}

      {match(step)
        .with('select', () => (
          <SelectNamesStep
            gasEstimate={gasEstimate}
            gasFundingStatus={gasFundingStatus}
            onNamesChange={handleNamesChange}
            onNext={handleBeginUpgrade}
          />
        ))
        .with('migrate', () => <GameStep />)
        .with('cleanupRunning', () => <GameStep />)
        .with('cleanupRequired', () => (
          <ResultLayout>
            <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              {migrationCompleted ? (
                <Trans>Your names are on ENS v2</Trans>
              ) : (
                <Trans>Remove temporary permissions</Trans>
              )}
            </p>
            <p className="max-w-md text-center text-ens-garnet-900/70 text-sm leading-relaxed">
              {migrationCompleted ? (
                <Trans>
                  Temporary migration permissions still need to be removed. Your
                  names are safe and the cleanup can be retried separately.
                </Trans>
              ) : (
                <Trans>
                  A previous migration attempt left temporary permissions.
                  Remove them before starting again.
                </Trans>
              )}
            </p>
            {lastError ? (
              <div className="max-h-50 w-full max-w-md overflow-y-auto rounded-sm bg-ens-garnet-900/5 p-3">
                <p className="whitespace-pre-wrap break-all font-mono text-ens-garnet-900/70 text-xs leading-normal">
                  {formatMigrationError(lastError)}
                </p>
              </div>
            ) : null}
            <div className="flex gap-3">
              {migrationCompleted ? (
                <button
                  className="rounded-sm bg-ens-garnet-900/10 px-4 py-3 font-semi-mono text-ens-garnet-900 text-sm uppercase tracking-[1.68px]"
                  onClick={() => uiActor.send({ type: 'cleanup.continue' })}
                  type="button"
                >
                  <Trans>Continue</Trans>
                </button>
              ) : null}
              <button
                className="rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
                onClick={() => uiActor.send({ type: 'cleanup.retry' })}
                type="button"
              >
                <Trans>Remove permissions</Trans>
              </button>
            </div>
          </ResultLayout>
        ))
        .with('failure', () => (
          <ResultLayout>
            <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Trans>Migration failed</Trans>
            </p>
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="max-h-50 w-full max-w-md overflow-y-auto rounded-sm bg-ens-garnet-900/5 p-3"
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
        .with('success', () =>
          migrationNftEnabled ? null : (
            <PlainMigrationSuccessDialog onContinue={handlePlainSuccess} />
          ),
        )
        .exhaustive()}

      {migrationNftEnabled ? (
        <CommemorativeNftClaimDialog
          context="migration"
          migratedNameCount={dialogNames.length}
          onClose={handleSuccessClose}
          onViewProfile={handleViewProfile}
          open={dialogOpen}
          ownerAddress={ownerAddress as Address | undefined}
          preview={isPreviewOpen && !isMigrationSuccess}
          previewProfileName={dialogNames[0]}
        />
      ) : null}
    </div>
  )
}
