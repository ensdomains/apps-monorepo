import { useEffect, useState } from 'react'
import type { ClassifiedName, IneligibleName } from '../service/classifyNames'
import { useSubnameMigrationImpact } from './useSubnameMigrationImpact'

export const useDefaultMigrationSelection = ({
  eligible,
  gracePeriodNames,
  ownerAddress,
  isPending,
  shouldSkip,
}: {
  readonly eligible: readonly ClassifiedName[]
  readonly gracePeriodNames: readonly IneligibleName[]
  readonly ownerAddress?: string | null
  readonly isPending: boolean
  readonly shouldSkip: boolean
}) => {
  const [checkedSelectionKey, setCheckedSelectionKey] = useState<string | null>(
    null,
  )
  const candidates = [
    ...eligible.map(({ domain }) => domain.name),
    ...gracePeriodNames.map(({ domain }) => domain.name),
  ]
  const impact = useSubnameMigrationImpact({
    selectedNames: candidates,
    classified: eligible,
    renewingNames: gracePeriodNames.map(({ domain }) => domain.name),
    ownerAddress,
    isEnabled: !shouldSkip,
    isPrepared: !isPending,
    isRefetchEnabled: false,
  })

  useEffect(() => {
    if (impact.status === 'ready' || impact.status === 'error') {
      setCheckedSelectionKey(impact.selectionKey)
    }
  }, [impact.selectionKey, impact.status])

  return {
    isPending:
      isPending ||
      (!shouldSkip &&
        impact.status === 'loading' &&
        checkedSelectionKey !== impact.selectionKey),
    // A failed check can never opt a group in. The owner can still select it
    // explicitly and use the existing impact review and final reread.
    excludedNames:
      impact.status === 'ready'
        ? (impact.impact?.parents.map(({ name }) => name) ?? [])
        : candidates,
  }
}
