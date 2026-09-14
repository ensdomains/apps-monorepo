import type { Signer } from '@ens-apps/transaction-manager'
import { Trans } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useCanGoBack, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address, WalletClient } from 'viem'
import { useWalletClient } from 'wagmi'
import { MSymbol } from '@/components/ui/material-symbol'
import { useVisibleCommemorativeNftEligibility } from '@/features/migration/commemorative-nft/useVisibleCommemorativeNftEligibility'
import { GameStep } from '@/features/migration/components/GameStep'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { MigrationFailureResult } from '@/features/migration/components/MigrationFailureResult'
import { MigrationNftMintDialog } from '@/features/migration/components/MigrationNftMintDialog'
import { MigrationSuccessDialog } from '@/features/migration/components/MigrationSuccessDialog'
import { SelectNamesStep } from '@/features/migration/components/SelectNamesStep'
import { CommemorativeNftClaimDialog } from '@/features/migration/components/success/CommemorativeNftClaimDialog'
import { useMigrationGasEstimate } from '@/features/migration/hooks/useMigrationGasEstimate'
import { useMigrationGasFunding } from '@/features/migration/hooks/useMigrationGasFunding'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { decodeMigrationError } from '@/features/migration/service/decodeMigrationError'
import { useMigrationUiContext } from '@/features/migration/state/migrationUi.context'
import {
  useMigrationCompletedOperations,
  useMigrationLastError,
  useMigrationSelectedNames,
  useMigrationStep,
} from '@/features/migration/state/migrationUi.selectors'
import { useMigrationNftEnabled } from '@/lib/posthog/useMigrationNftEnabled'
import { useSmartAccountContext } from '@/lib/smart-account'
import { isMigrationQueryKey } from './MigrationPage.helpers'

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
    onRetry={noop}
    onViewProfile={onContinue}
    open
    state={disabledNftSuccessState}
  />
)

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
  const [isNftMintOpen, setIsNftMintOpen] = useState(false)
  const visibleNft = useVisibleCommemorativeNftEligibility({
    enabled: migrationNftEnabled && import.meta.env.DEV && step === 'select',
  })
  useEffect(() => {
    if (!migrationNftEnabled) setIsNftMintOpen(false)
  }, [migrationNftEnabled])
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

  const handleSuccessClose = useCallback(() => {
    if (isMigrationSuccess) {
      uiActor.send({ type: 'done' })
      navigate({ to: '/dashboard', replace: true })
      return
    }

    setIsNftMintOpen(false)
  }, [isMigrationSuccess, uiActor, navigate])

  const handleViewProfile = useCallback(
    (profileName?: string) => {
      const name = profileName ?? dialogNames[0]

      if (isMigrationSuccess) {
        uiActor.send({ type: 'done' })
      } else {
        setIsNftMintOpen(false)
      }

      if (name) {
        navigate({ to: '/$name', params: { name } })
        return
      }

      navigate({ to: '/dashboard' })
    },
    [dialogNames, isMigrationSuccess, uiActor, navigate],
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
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-clip">
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
          {migrationNftEnabled && import.meta.env.DEV && visibleNft ? (
            <button
              className="absolute top-6 right-5 z-20 px-2 py-2 text-ens-garnet-900 text-xs underline underline-offset-2 md:right-8"
              onClick={() => setIsNftMintOpen(true)}
              type="button"
            >
              <Trans>Mint commemorative NFT</Trans>
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
        .with('failure', () => (
          <MigrationFailureResult
            error={lastError}
            onBack={() => uiActor.send({ type: 'cancel' })}
            onRetry={() => uiActor.send({ type: 'retry' })}
          />
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
          onViewProfile={handleViewProfile}
          open={dialogOpen}
          ownerAddress={ownerAddress as Address | undefined}
        />
      ) : null}
      {migrationNftEnabled && import.meta.env.DEV && isNftMintOpen ? (
        <MigrationNftMintDialog
          onClose={() => setIsNftMintOpen(false)}
          onViewProfile={handleViewProfile}
        />
      ) : null}
    </div>
  )
}
