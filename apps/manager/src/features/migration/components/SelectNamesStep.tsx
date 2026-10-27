import type { GasAffordability } from '@ens-apps/utils/gasAffordability'
import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { match } from 'ts-pattern'
import { useDefaultMigrationSelection } from '@/features/migration/hooks/useDefaultMigrationSelection'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationGasFundingStatus } from '@/features/migration/hooks/useMigrationGasFunding'
import { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { useWrapperSync } from '@/features/migration/hooks/useWrapperSync'
import { cn } from '@/lib/utils'
import type { GraceRenewalGasEstimateState } from '../hooks/useGraceRenewalGasEstimate'
import type { GraceRenewalQuoteState } from '../hooks/useGraceRenewalQuote'
import type { BlockedSubnameMigration } from '../hooks/useMigrationEligibility'
import { NameRow } from './NameRow'
import { startUpgrade } from './SelectNamesStep.handlers'
import { SelectNamesStepFooter } from './SelectNamesStepFooter'
import { SelectNamesStepSelectionOptions } from './SelectNamesStepSelectionOptions'
import {
  shouldShowBulkSelection,
  shouldShowNameSearch,
  shouldUseCompactSelectionLayout,
  shouldUseSmallSelectionCard,
} from './selectNames.helpers'
import { UnavailableMigrationNames } from './UnavailableMigrationNames'
import { WrapperSyncNotice } from './WrapperSyncNotice'

const SubnameBlockReason = ({
  block,
}: {
  readonly block: BlockedSubnameMigration
}) => {
  switch (block.reason) {
    case 'parent-not-upgraded': {
      const parentName = block.parentName
      return (
        <Trans>
          The parent name {parentName} must be upgraded before this subname.
        </Trans>
      )
    }
    case 'imports-disabled':
      return (
        <Trans>
          Subname copying is not available in this session. Keep this parent on
          ENSv1 so its subnames keep working.
        </Trans>
      )
    case 'unsupported-parent':
      return (
        <Trans>
          This parent has subnames whose protections cannot be preserved by this
          upgrade yet.
        </Trans>
      )
    case 'deeper-subnames':
      return (
        <Trans>
          This name has subnames with further subnames below them. Upgrading the
          whole tree is not supported yet.
        </Trans>
      )
    case 'wrapped-protections':
      return (
        <Trans>
          This name has wrapped subnames whose permissions and protections
          cannot be preserved yet.
        </Trans>
      )
    case 'too-large':
      return (
        <Trans>
          This name has too many subnames to include in one safe upgrade.
        </Trans>
      )
    case 'unknown-label':
      return (
        <Trans>
          A subname's complete name could not be verified. Keep this parent on
          ENSv1 until it can be recovered.
        </Trans>
      )
    case 'incomplete-inventory':
      return (
        <Trans>
          We could not verify a complete, current list of this name's subnames.
          Refresh and try again.
        </Trans>
      )
    case 'requires-parent':
      return (
        <Trans>
          This subname must be included through its parent name. It cannot be
          copied on its own.
        </Trans>
      )
    case 'unverified-source':
      return (
        <Trans>
          A subname's owner or resolver could not be verified. Refresh and try
          again before upgrading.
        </Trans>
      )
  }
}

type SelectNamesStepProps = {
  readonly ownerAddress?: string | null
  readonly gasEstimate: MigrationGasEstimateState
  readonly gasAffordability: GasAffordability
  readonly gasFundingStatus: MigrationGasFundingStatus
  readonly onNamesChange: (names: string[]) => void
  readonly onManagerRestorationChange: (names: string[]) => void
  readonly onNext: () => boolean | Promise<boolean>
  readonly renewal?: GraceRenewalQuoteState
  readonly renewalGasEstimate?: GraceRenewalGasEstimateState
}

const SelectionTitle = ({
  eligibleCount,
  graceCount,
  unavailableCount,
  wrapperSyncCount,
  isRecoveryStale,
  isEligibilityError,
  isFinishingRecovery,
}: {
  readonly eligibleCount: number
  readonly graceCount: number
  readonly unavailableCount: number
  readonly wrapperSyncCount: number
  readonly isRecoveryStale: boolean
  readonly isEligibilityError: boolean
  readonly isFinishingRecovery: boolean
}) => {
  if (isRecoveryStale) return <Trans>Your saved upgrade needs attention</Trans>
  if (isFinishingRecovery) return <Trans>Finish your upgrade</Trans>
  if (isEligibilityError) return <Trans>We couldn't check your names</Trans>
  if (eligibleCount === 0 && graceCount > 0) {
    return <Trans>Renew your names before upgrading</Trans>
  }
  if (eligibleCount === 0 && wrapperSyncCount > 0) {
    return <Trans>Sync your names before upgrading</Trans>
  }
  if (eligibleCount === 0 && unavailableCount > 0) {
    return <Trans>Your names can&apos;t be upgraded</Trans>
  }
  return <Trans>Your names are ready to upgrade</Trans>
}

export const SelectNamesStep = ({
  ownerAddress,
  gasEstimate,
  gasAffordability,
  gasFundingStatus,
  onNamesChange,
  onManagerRestorationChange,
  onNext,
  renewal = { status: 'idle' },
  renewalGasEstimate = { status: 'idle' },
}: SelectNamesStepProps) => {
  const {
    eligible,
    gracePeriodNames,
    unavailableNames,
    blockedSubnames = [],
    verifiedSubnames,
    isEligibilityError = false,
    retryEligibility,
    wrapperSyncNames,
    isPending: isEligibilityPending,
    recoveryState,
  } = useEligibleV1Names()
  const wrapperSync = useWrapperSync(wrapperSyncNames)
  const [isStarting, setIsStarting] = useState(false)
  const isRecoveryStale = recoveryState.status === 'stale'
  const isRecovery = recoveryState.status === 'recovering'
  const { isPending, excludedNames } = useDefaultMigrationSelection({
    eligible,
    gracePeriodNames,
    ownerAddress,
    isPending: isEligibilityPending,
    shouldSkip: recoveryState.status !== 'none',
  })
  const needsRenewal = renewal.status !== 'idle'
  const preparedPlan = gasEstimate.status === 'ready' ? gasEstimate.plan : null
  const preparedNames = match({ needsRenewal, renewalGasEstimate })
    .with(
      { needsRenewal: true, renewalGasEstimate: { status: 'ready' } },
      ({ renewalGasEstimate }) => renewalGasEstimate.classified,
    )
    .with({ needsRenewal: true }, () => undefined)
    .otherwise(() => preparedPlan?.classified)

  const {
    search,
    setSearch,
    selected,
    totalSelected,
    visibleCount,
    displayedCount,
    allSelected,
    filteredGroups,
    filteredOrphans,
    filteredGracePeriodNames,
    includedSubnames,
    isManagerRestorationLocked,
    managerCandidates,
    restoredManagers,
    toggleManagerRestoration,
    toggleName,
    toggleAll,
  } = useNameSelection({
    eligible,
    gracePeriodNames,
    includedNames: preparedNames ?? verifiedSubnames,
    defaultExcludedNames: excludedNames,
    isPending,
    isRecovery,
    // A resumed run rebuilds its batch from the durable snapshot, which already
    // records what was opted in, so the choice cannot be changed mid-run.
    isManagerRestorationLocked: recoveryState.status === 'recovering',
    onNamesChange,
    onManagerRestorationChange,
  })
  // The temporary approval is needed only for names the owner opted in.
  const hasNamesNeedingManagerRestoration = restoredManagers.size > 0

  const isEstimatingGas = needsRenewal
    ? renewalGasEstimate.status === 'loading'
    : gasEstimate.status === 'loading'
  const isWaitingForGasEstimate =
    totalSelected > 0 &&
    (needsRenewal
      ? renewal.status !== 'ready' ||
        renewalGasEstimate.status !== 'ready' ||
        renewal.quote.balance < renewal.quote.totalAmount
      : gasEstimate.status !== 'ready')
  // The gas drip request only resolves once any sepETH top-up is confirmed
  // on-chain, so block "Upgrade" until then — otherwise the owner can start a
  // migration that fails for lack of gas before the ETH has landed.
  const isWaitingForGasFunding =
    totalSelected > 0 && gasFundingStatus === 'funding'
  const isFinishingRecovery =
    isRecovery && preparedPlan !== null && preparedPlan.classified.length === 0
  const recreation = preparedPlan?.subnameRecreation
  const hasSubnameCopies =
    preparedPlan?.classified.some(
      (name) => name.action === 'copy' && !!name.recreationRoot,
    ) ?? false
  const isWaitingForSubnameSnapshot =
    hasSubnameCopies && recreation?.version !== 5
  const hasBlockedSelection = blockedSubnames.some(({ name }) =>
    selected.has(name.domain.name),
  )
  const isUpgradeDisabled =
    (totalSelected === 0 && !isFinishingRecovery) ||
    isPending ||
    isRecoveryStale ||
    isStarting ||
    isEligibilityError ||
    hasBlockedSelection ||
    isWaitingForSubnameSnapshot ||
    wrapperSync.isPending ||
    isWaitingForGasEstimate ||
    isWaitingForGasFunding
  const showBulkSelection = shouldShowBulkSelection(visibleCount)
  const showNameSearch = shouldShowNameSearch(displayedCount)
  const isCompactLayout = shouldUseCompactSelectionLayout(displayedCount)
  const isSmallSelectionCard =
    !isPending && shouldUseSmallSelectionCard(displayedCount)
  const hasAdditionalDetails =
    blockedSubnames.length > 0 ||
    unavailableNames.length > 0 ||
    isEligibilityError
  const showSelectionOptions =
    !isFinishingRecovery &&
    (blockedSubnames.length === 0 ||
      eligible.length > 0 ||
      gracePeriodNames.length > 0 ||
      isPending)
  const isContentHeightCard =
    !hasAdditionalDetails && (isPending || isSmallSelectionCard)
  const isCompactOuterSpacing =
    isCompactLayout || isPending || displayedCount === 0

  useEffect(() => {
    if (!showNameSearch && search !== '') setSearch('')
  }, [search, setSearch, showNameSearch])

  const handleUpgrade = useCallback(
    () => startUpgrade({ isUpgradeDisabled, onNext, setIsStarting }),
    [isUpgradeDisabled, onNext],
  )

  return (
    <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col self-stretch">
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-5 pt-6 pb-6 md:pb-5',
          isContentHeightCard
            ? 'md:justify-center md:pt-0 md:pb-0'
            : isCompactOuterSpacing
              ? 'md:pt-6'
              : 'md:pt-16',
        )}
      >
        <div
          className={cn(
            'flex min-h-0 w-full max-w-215 flex-1 flex-col items-center gap-6 md:gap-7',
            isContentHeightCard && 'md:flex-none',
            hasAdditionalDetails && 'flex-none',
          )}
        >
          <h1 className="w-full shrink-0 text-left text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px] md:text-center md:text-[36px] md:tracking-[-0.72px]">
            <SelectionTitle
              eligibleCount={eligible.length}
              graceCount={gracePeriodNames.length}
              isEligibilityError={isEligibilityError}
              isFinishingRecovery={isFinishingRecovery}
              isRecoveryStale={isRecoveryStale}
              unavailableCount={
                unavailableNames.length + blockedSubnames.length
              }
              wrapperSyncCount={wrapperSyncNames.length}
            />
          </h1>

          {isFinishingRecovery && (
            <p className="max-w-160 text-ens-garnet-900/75 text-sm leading-5 md:text-center">
              <Trans>
                Your names have been upgraded. Confirm the completed
                transactions and finish any remaining permission cleanup.
              </Trans>
            </p>
          )}

          {hasNamesNeedingManagerRestoration && !isRecoveryStale && (
            <p className="max-w-160 text-ens-garnet-900/75 text-sm leading-5 md:text-center">
              <Trans>
                Upgrading names with a different manager requires temporary
                permission for your smart account to manage your names. We
                remove that permission after the upgrade.
              </Trans>
            </p>
          )}

          {isEligibilityError && (
            <div
              className="w-full max-w-189 rounded-xl border border-ens-garnet-900/10 bg-white/60 p-4 text-ens-garnet-900 text-sm leading-5"
              role="alert"
            >
              <p>
                <Trans>
                  We could not check whether your names and subnames can be
                  safely upgraded. Try again before continuing.
                </Trans>
              </p>
              <button
                className="mt-2 min-h-11 rounded-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900"
                onClick={retryEligibility}
                type="button"
              >
                <Trans>Check again</Trans>
              </button>
            </div>
          )}

          {isRecoveryStale ? (
            <div
              className="flex w-full max-w-160 items-start gap-3 rounded-lg bg-ens-garnet-50/70 px-4 py-4 text-ens-garnet-900"
              role="alert"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              <div className="flex flex-col gap-1 text-sm leading-5">
                <p>
                  <Trans>
                    Something about your names changed since you last tried, so
                    we can&apos;t safely pick up where you left off.
                  </Trans>
                </p>
                <p className="text-ens-garnet-500">
                  <Trans>
                    Nothing has been lost. Contact ENS support before trying
                    again.
                  </Trans>
                </p>
              </div>
            </div>
          ) : showSelectionOptions ? (
            <SelectNamesStepSelectionOptions
              allSelected={allSelected}
              filteredGracePeriodNames={filteredGracePeriodNames}
              filteredGroups={filteredGroups}
              filteredOrphans={filteredOrphans}
              includedSubnames={includedSubnames}
              isCompactLayout={isCompactLayout}
              isContentHeightCard={isContentHeightCard}
              isManagerRestorationLocked={isManagerRestorationLocked}
              isPending={isPending}
              managerCandidates={managerCandidates}
              restoredManagers={restoredManagers}
              search={search}
              selected={selected}
              setSearch={setSearch}
              showBulkSelection={showBulkSelection}
              showNameSearch={showNameSearch}
              toggleAll={toggleAll}
              toggleManagerRestoration={toggleManagerRestoration}
              toggleName={toggleName}
              totalSelected={totalSelected}
              visibleCount={visibleCount}
            />
          ) : null}

          <WrapperSyncNotice
            error={wrapperSync.error}
            isPending={wrapperSync.isPending}
            names={wrapperSyncNames}
            onSync={() => wrapperSync.mutate()}
          />
          <UnavailableMigrationNames names={unavailableNames} />
          {blockedSubnames.length > 0 && (
            <section className="w-full max-w-189 text-ens-garnet-900 text-sm leading-5">
              <h2 className="font-medium">
                <Trans>These names need to stay on ENSv1 for now</Trans>
              </h2>
              <ul className="mt-3 space-y-4">
                {blockedSubnames.map((block) => (
                  <li key={block.name.domain.id}>
                    <NameRow
                      depth={0}
                      disabledReason={<SubnameBlockReason block={block} />}
                      isSelected={false}
                      item={block.name}
                    />
                  </li>
                ))}
              </ul>
              <a
                className="mt-2 inline-flex min-h-11 items-center rounded-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900"
                href="/dashboard#subname-upgrades"
              >
                <Trans>Learn how subnames affect upgrades</Trans>
              </a>
            </section>
          )}
        </div>
      </div>

      <SelectNamesStepFooter
        gasAffordability={gasAffordability}
        gasEstimate={gasEstimate}
        isEstimatingGas={isEstimatingGas}
        isFinishingRecovery={isFinishingRecovery}
        isStarting={isStarting}
        isUpgradeDisabled={isUpgradeDisabled}
        isWaitingForGasFunding={isWaitingForGasFunding}
        onUpgrade={handleUpgrade}
        renewal={renewal}
        renewalGasEstimate={renewalGasEstimate}
        totalSelected={totalSelected}
        visibleCount={visibleCount}
      />
    </div>
  )
}
