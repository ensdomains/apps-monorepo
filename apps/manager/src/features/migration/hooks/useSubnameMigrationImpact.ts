import {
  type ClassifiedName,
  getSubnameMigrationImpact,
} from '@ens-apps/migration'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { match } from 'ts-pattern'
import type { PublicClient } from 'viem'
import { bigname } from '@/lib/bigname'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { publicClient } from '@/lib/wagmi'
import { useMigrationRecoverySnapshot } from './useMigrationRecoverySnapshot'

type Parameters = {
  readonly selectedNames: readonly string[]
  readonly classified: readonly ClassifiedName[]
  readonly renewingNames: readonly string[]
  readonly ownerAddress?: string | null
  readonly managerRestorationNames?: readonly string[]
  readonly isEnabled: boolean
  readonly isPrepared: boolean
  readonly isRefetchEnabled?: boolean
}

const FRESH_FOR_MS = 60_000

export const getSubnameMigrationImpactQueryOptions = ({
  selectionKey,
  migratingNames,
  copiedNames,
  renewingNames,
  isEnabled,
  isPrepared,
  hasSelectedNames,
  isRefetchEnabled = true,
}: {
  readonly selectionKey: string
  readonly migratingNames: readonly string[]
  readonly copiedNames: readonly string[]
  readonly renewingNames: readonly string[]
  readonly isEnabled: boolean
  readonly isPrepared: boolean
  readonly hasSelectedNames: boolean
  readonly isRefetchEnabled?: boolean
}) =>
  resultQueryOptions({
    queryKey: qk('migration', 'subname_impact', { selectionKey }),
    queryFn: ({ signal }) =>
      getSubnameMigrationImpact({
        indexer: bigname,
        publicClient: publicClient as PublicClient,
        migratingNames,
        copiedNames,
        renewingNames,
        signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
      }),
    enabled: isEnabled && isPrepared && hasSelectedNames,
    staleTime: FRESH_FOR_MS,
    refetchInterval: isEnabled && isRefetchEnabled ? FRESH_FOR_MS : false,
    refetchOnWindowFocus: isRefetchEnabled ? 'always' : false,
    retry: false,
  })

export const useSubnameMigrationImpact = ({
  selectedNames,
  classified,
  renewingNames,
  ownerAddress,
  managerRestorationNames = [],
  isEnabled,
  isPrepared,
  isRefetchEnabled = true,
}: Parameters) => {
  const recoverySnapshot = useMigrationRecoverySnapshot()
  const isCleanupRecovery =
    !!recoverySnapshot && recoverySnapshot.remainingOperations.length === 0
  const importsEnabled =
    useFeatureFlagEnabled(
      POSTHOG_FEATURE_FLAGS.MIGRATION_SUBNAME_RECREATION,
      false,
    ) === true
  const selected = new Set(selectedNames.map((name) => name.toLowerCase()))
  const migratingNames = [
    ...new Set([
      ...classified
        .filter(
          (name) =>
            name.action === 'migrate' &&
            selected.has(name.domain.name.toLowerCase()),
        )
        .map(({ domain }) => domain.name),
      ...renewingNames.filter((name) => selected.has(name.toLowerCase())),
    ]),
  ].sort()
  const copiedNames = classified
    .filter(
      (name) =>
        name.action === 'copy' &&
        (!name.recreationRoot || importsEnabled) &&
        (selected.has(name.domain.name.toLowerCase()) ||
          (!!name.recreationRoot &&
            selected.has(name.recreationRoot.toLowerCase()))),
    )
    .map(({ domain }) => domain.name)
    .sort()
  const selectionKey = JSON.stringify({
    selected: [...selected].sort(),
    migratingNames,
    copiedNames,
    importsEnabled,
    recovery: recoverySnapshot
      ? {
          source: recoverySnapshot.subnameRecreation,
          operations: recoverySnapshot.remainingOperations,
        }
      : null,
    renewingNames: [...renewingNames].sort(),
    owner: ownerAddress?.toLowerCase(),
    managers: [...managerRestorationNames].sort(),
    chainId: publicClient.chain.id,
  })
  const isReady = isEnabled && isPrepared
  const currentSelection = useRef({ key: selectionKey, revision: 0, isReady })
  if (
    currentSelection.current.key !== selectionKey ||
    currentSelection.current.isReady !== isReady
  ) {
    currentSelection.current = {
      key: selectionKey,
      revision: currentSelection.current.revision + 1,
      isReady,
    }
  }
  const query = useQuery(
    getSubnameMigrationImpactQueryOptions({
      selectionKey,
      migratingNames,
      copiedNames,
      renewingNames,
      isEnabled: isEnabled && !recoverySnapshot,
      isPrepared,
      hasSelectedNames: selected.size > 0,
      isRefetchEnabled,
    }),
  )
  // Recovery first reconciles recorded transactions and temporary approvals.
  // A fresh indexer outage cannot stop that work. The execution service checks
  // the saved source and feature availability before any further submission.
  const impact = recoverySnapshot
    ? {
        parents: [],
        affectedCount: 0,
        fingerprint: selectionKey,
        checkedAt: 0,
      }
    : query.data
  const status = match({
    hasSelectedNames: selected.size > 0 || isCleanupRecovery,
    isLoading:
      !isPrepared ||
      (!recoverySnapshot && (query.isPending || query.isFetching)),
    isError: !recoverySnapshot && query.isError,
  })
    .with({ hasSelectedNames: false }, () => 'idle' as const)
    .with({ isLoading: true }, () => 'loading' as const)
    .with({ isError: true }, () => 'error' as const)
    .otherwise(() => 'ready' as const)
  const canReview = isReady && (selected.size > 0 || isCleanupRecovery)

  const checkBeforeStart = async (
    _confirmedFingerprint?: string,
  ): Promise<boolean> => {
    if (!canReview || status !== 'ready') return false
    if (recoverySnapshot) return true
    const current = query.data
    const revision = currentSelection.current.revision
    const result = await query.refetch()
    // Re-read immediately before starting, including on a same-plan retry.
    // Changed/failed reads leave the new result visible for another decision.
    return (
      !result.isError &&
      result.data !== undefined &&
      currentSelection.current.key === selectionKey &&
      currentSelection.current.revision === revision &&
      currentSelection.current.isReady &&
      result.data.fingerprint === current?.fingerprint &&
      result.data.affectedCount === 0
    )
  }

  return {
    status,
    impact,
    selectionKey,
    canReview,
    isBlocked: status === 'ready' && (impact?.affectedCount ?? 0) > 0,
    checkBeforeStart,
    retry: () => {
      if (recoverySnapshot) return
      void query.refetch()
    },
  }
}

export type SubnameMigrationImpactState = ReturnType<
  typeof useSubnameMigrationImpact
>
