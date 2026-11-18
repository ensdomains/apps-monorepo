import type { Power } from '@ens-apps/indexer/bigname'
import type { HistoryEventData } from '@ens-apps/indexer/reads'

type PermissionData = HistoryEventData['permission']

/**
 * The previous power set of a change: `powers` (the set after it) without
 * what it added, plus what it removed. Only an ENSv2 `EACRolesChanged` row
 * states the diff; without one, the account's previous row under the same
 * scope is the set before (an empty set when there is none).
 */
export const previousPowers = (
  data: PermissionData,
  lastSeen: readonly Power[] | undefined,
): readonly Power[] => {
  const { powers = [], added_powers: added, removed_powers: removed } = data
  if (!added || !removed) return lastSeen ?? []
  return [...powers.filter((power) => !added.includes(power)), ...removed]
}
