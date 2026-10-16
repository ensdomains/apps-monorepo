import type { EventRow, Power } from '@ens-apps/indexer/bigname'

type PermissionData = NonNullable<
  Extract<EventRow, { type: 'permission' }>['data']
>

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
