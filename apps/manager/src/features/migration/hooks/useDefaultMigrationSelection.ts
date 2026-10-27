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
  const eligibleNames = new Set(eligible.map(({ domain }) => domain.name))
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
    // Eligible parents already passed subname-preservation checks. Keep only
    // affected grace names opt-in until renewal eligibility is checked.
    // A failed impact check still cannot select any group automatically.
    excludedNames:
      impact.status === 'ready'
        ? (impact.impact?.parents
            .filter(({ name }) => !eligibleNames.has(name))
            .map(({ name }) => name) ?? [])
        : candidates,
  }
}
