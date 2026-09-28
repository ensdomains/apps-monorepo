import type { BulkRenewName } from '@/features/bulk-renew'
import type { MergedItem } from '@/features/dashboard/mergedNames'
import type { PreparedAiAction } from './prepareAiHandoff'

export const getNameSelectionIssue = (
  action: PreparedAiAction | null,
  ready: boolean,
  matches: readonly MergedItem[],
  renewable: readonly BulkRenewName[],
  walletNames: readonly (string | null | undefined)[],
): string | null => {
  if (
    !ready ||
    (action?.intent !== 'find_names' && action?.intent !== 'bulk_renew') ||
    !action.names
  )
    return null
  const known = new Set(
    walletNames.flatMap((name) => (name ? [name.toLowerCase()] : [])),
  )
  const missing = action.names.filter((name) => !known.has(name))
  if (missing.length)
    return `These requested names are not in your wallet data: ${missing.join(', ')}.`
  if (action.intent === 'bulk_renew' && renewable.length !== matches.length)
    return 'Some matching names cannot be renewed in the V2 bulk flow. Renew V1 names individually.'
  return null
}
