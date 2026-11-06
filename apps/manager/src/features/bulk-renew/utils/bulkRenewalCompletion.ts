import type { RenewItem } from '../types'

export const getBulkRenewalCompletionCount = (
  items: readonly Pick<RenewItem, 'label'>[],
  completed: ReadonlySet<string>,
): number | undefined =>
  items.length > 0 && items.every(({ label }) => completed.has(label))
    ? new Set(items.map(({ label }) => label)).size
    : undefined
