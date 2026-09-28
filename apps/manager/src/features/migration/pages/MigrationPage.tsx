import type { Signer } from '@ens-apps/transaction-manager'
import { assessGasAffordability } from '@ens-apps/utils/gasAffordability'
import { Plural, Trans } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useCanGoBack, useNavigate } from '@tanstack/react-router'
import { useSelector } from '@xstate/react'
import { motion } from 'motion/react'
import { type ReactNode, useCallback, useEffect } from 'react'
import { match } from 'ts-pattern'
import type { Address, WalletClient } from 'viem'
import { useBalance, useWalletClient } from 'wagmi'
import { MSymbol } from '@/components/ui/material-symbol'
import { recordVerifiedNftMigration } from '@/features/migration/commemorative-nft/verifiedMigration'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { MigrationPrimaryButton } from '@/features/migration/components/MigrationPrimaryButton'
import { MigrationSuccessDialog } from '@/features/migration/components/MigrationSuccessDialog'
import type { MigrationAiPreset } from '@/features/migration/components/migrationAiPreset'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { CommemorativeNftClaimDialog } from '@/features/migration/components/success/CommemorativeNftClaimDialog'
import { useMigrationGasEstimate } from '@/features/migration/hooks/useMigrationGasEstimate'
import { useMigrationGasFunding } from '@/features/migration/hooks/useMigrationGasFunding'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import {
  decodeMigrationError,
  type MigrationError,
} from '@/features/migration/service/decodeMigrationError'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import {
  useMigrationCompletedOperations,
  useMigrationLastError,
  useMigrationSelectedNames,
  useMigrationStep,
} from '@/features/migration/state/migrationUi.selectors'
import { useMigrationNftEnabled } from '@/lib/posthog/useMigrationNftEnabled'
import { useSmartAccountContext } from '@/lib/smart-account'
import { publicClient as migrationExecutionClient } from '@/lib/wagmi'
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
  migratedNameCount,
  onContinue,
}: {
  readonly migratedNameCount: number
  readonly onContinue: () => void
}) => (
  <MigrationSuccessDialog
    canMint={false}
    context="migration"
    migratedNameCount={migratedNameCount}
    onClose={onContinue}
    onMint={noop}
    onOpenDashboard={onContinue}
    onRetry={noop}
    open
    state={disabledNftSuccessState}
  />
)

const formatMigrationError = (error: MigrationError): ReactNode => {
  switch (error.type) {
    case 'generic':
      return <Trans>Upgrade details: {error.message}</Trans>
    case 'parent-not-upgraded':
      return <Trans>Upgrade the parent name first, then its subnames.</Trans>
    case 'plan-changed':
      return (
        <div>
          <Trans>
            Your permissions changed. Go back to check the updated estimate.
          </Trans>
        </div>
      )
    case 'retry-blocked':
      return (
        <div>
          <Trans>
            We couldn&apos;t safely retry. Nothing was submitted and nothing
            changed.
          </Trans>
        </div>
      )
    case 'subregistry-conflict':
      return (
        <div>
          <Trans>
            One of your names now has its own subname registry. Upgrading it
            would detach that registry and its subnames, so nothing was
            submitted. Refresh and select your names again.
          </Trans>
        </div>
      )
    case 'cleanup-failed':
      return (
        <div>
          <Trans>
            Temporary migration access is still active. Retry to remove it and
            continue any unfinished upgrade.
          </Trans>
        </div>
      )
    case 'profile-fetch-failed':
      return (
        <div>
          <Trans>We couldn&apos;t read your current records.</Trans>
        </div>
      )
    case 'user-rejected':
      return (
        <div>
          <Trans>You cancelled the request.</Trans>
        </div>
      )
    case 'preflight-timeout':
      return (
        <div>
          <Trans>This is taking longer than expected.</Trans>
        </div>
      )
    case 'permission-missing':
      return (
        <div>
          <Trans>A permission is missing. Try again.</Trans>
        </div>
      )
    case 'token-owner-changed':
      return (
        <div>
          <Trans>
            One of your names changed owners. Refresh and select it again.
          </Trans>
        </div>
      )
    case 'hca-owner-mismatch':
      return (
        <div>
          <Trans>
            This wasn&apos;t set up with the wallet you&apos;re using now.
            Connect the original wallet.
          </Trans>
        </div>
      )
    case 'direct-transfer-unauthorized':
    case 'name-data-mismatch':
    case 'invalid-data':
      return (
        <div>
          <Trans>Something went wrong. Refresh and try again.</Trans>
        </div>
      )
    case 'name-not-locked':
    case 'name-requires-migration':
      return (
        <div>
          <Trans>We couldn&apos;t upgrade one of your names. Try again.</Trans>
        </div>
      )
    case 'name-is-locked':
    case 'frozen-token-approval':
      return (
        <div>
          <Trans>
            One of your names can&apos;t be upgraded right now. Contact support
            if this keeps happening.
          </Trans>
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

export const MigrationPage = ({
  preset,
  names,
}: {
  readonly preset?: MigrationAiPreset
  readonly names?: readonly string[]
}) => {
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  const { uiActor } = useMigrationUiContext()
  const migrationPlan = useSelector(uiActor, (state) => state.context.plan)
  const step = useMigrationStep(uiActor)
  const selectedNames = useMigrationSelectedNames(uiActor)
  const completedOperations = useMigrationCompletedOperations(uiActor)
  const lastError = useMigrationLastError(uiActor)
  const { data: v1Names = [] } = useV1Names()
  const {
    ownerAddress,
    accountAddress: hcaAddress,
    client: hcaClient,
    error: hcaError,
    refreshAccount,
  } = useSmartAccountContext()
  const { data: wagmiWalletClient } = useWalletClient()
  const queryClient = useQueryClient()
  const migrationNftEnabled = useMigrationNftEnabled()
  const isMigrationSuccess = step === 'success'
  const dialogOpen = migrationNftEnabled && isMigrationSuccess
  const completedNames = completedOperations.map(({ name }) => name)
  const dialogNames = isMigrationSuccess ? completedNames : selectedNames
  const gasEstimate = useMigrationGasEstimate({
    ownerAddress: ownerAddress as Address | undefined,
    hcaAddress: hcaAddress as Address | undefined,
    accountError: hcaError,
    selectedNames,
    v1Names,
    enabled: step === 'select',
  })

  // Migration is entirely EOA-paid, so a wallet short of sepETH stalls the run
  // partway. Checked against the same estimate the footer quotes.
  const { data: ownerBalance } = useBalance({
    address: ownerAddress as Address | undefined,
    query: { refetchInterval: 30_000 },
  })
  const gasAffordability = assessGasAffordability({
    balanceWei: ownerBalance?.value ?? null,
    estimatedFeeWei: gasEstimate.status === 'ready' ? gasEstimate.feeWei : null,
  })

  // Top up the owner's sepETH on page entry — migration txs are all EOA-paid.
  // The worker only drips when the address owns v1 names and is low on ETH,
  // so this is idempotent and a no-op for everyone else. The request doesn't
  // resolve until any drip is confirmed on-chain, so we gate the upgrade
  // button on `gasFundingStatus` to stop owners starting before the ETH lands.
  const gasFundingStatus = useMigrationGasFunding(ownerAddress)

  useEffect(() => {
    if (step === 'success') {
      if (migrationPlan && completedOperations.length > 0) {
        recordVerifiedNftMigration({
          queryClient,
          evidence: {
            ownerAddress: migrationPlan.migrationOwner,
            hcaAddress: migrationPlan.hcaAddress,
            chainId: migrationExecutionClient.chain.id,
            completedOperations,
          },
        })
      }
      invalidateMigrationQueries(queryClient)
    }
  }, [step, queryClient, migrationPlan, completedOperations])

  const handleSuccessClose = useCallback(() => {
    if (isMigrationSuccess) {
      uiActor.send({ type: 'done' })
      navigate({ to: '/dashboard', replace: true })
    }
  }, [isMigrationSuccess, uiActor, navigate])

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
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-clip">
      <GrainOverlay className="opacity-70" />

      {step === 'select' && (
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
      )}

      {match(step)
        .with('select', () => (
          <SelectNamesStep
            gasAffordability={gasAffordability}
            gasEstimate={gasEstimate}
            gasFundingStatus={gasFundingStatus}
            names={names}
            onNamesChange={handleNamesChange}
            onNext={handleBeginUpgrade}
            preset={preset}
          />
        ))
        .with('migrate', () => <GameStep />)
        .with('failure', () => (
          <ResultLayout>
            <p className="text-center text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
              <Trans>Upgrade didn&apos;t finish</Trans>
            </p>
            {lastError &&
              lastError.type !== 'cleanup-failed' &&
              lastError.type !== 'retry-blocked' && (
                <p className="text-center text-ens-garnet-900/75 text-sm">
                  <Plural
                    one="Your name is safe."
                    other="Your names are safe."
                    value={selectedNames.length}
                  />
                </p>
              )}
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="max-h-50 w-full max-w-md overflow-y-auto rounded-sm bg-ens-garnet-900/5 p-3"
              initial={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <div className="whitespace-pre-wrap break-words text-ens-garnet-900/70 text-sm leading-normal">
                {lastError && formatMigrationError(lastError)}
              </div>
            </motion.div>

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="flex max-w-full flex-wrap justify-center gap-3"
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
              <MigrationPrimaryButton
                onClick={() => uiActor.send({ type: 'retry' })}
                type="button"
              >
                {lastError?.type === 'cleanup-failed' ? (
                  <Trans>Retry upgrade and cleanup</Trans>
                ) : (
                  <Trans>Try again</Trans>
                )}
              </MigrationPrimaryButton>
            </motion.div>
          </ResultLayout>
        ))
        .with('success', () =>
          migrationNftEnabled ? null : (
            <PlainMigrationSuccessDialog
              migratedNameCount={dialogNames.length}
              onContinue={handleSuccessClose}
            />
          ),
        )
        .exhaustive()}

      {migrationNftEnabled ? (
        <CommemorativeNftClaimDialog
          context="migration"
          migratedNameCount={dialogNames.length}
          onClose={handleSuccessClose}
          onOpenDashboard={handleSuccessClose}
          open={dialogOpen}
          ownerAddress={ownerAddress as Address | undefined}
        />
      ) : null}
    </div>
  )
}
