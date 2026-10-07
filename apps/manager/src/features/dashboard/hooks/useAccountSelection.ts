import { useMemo, useState } from 'react'
import { selectionKey } from '../bulkRenewSelection'
import type { DashboardName } from '../dashboardNames'

type SelectedNames = ReadonlyMap<string, DashboardName>

const NO_SELECTION: SelectedNames = new Map()

/** Names picked for bulk renewal; switching accounts starts a fresh selection. */
export const useAccountSelection = (accountsKey: string) => {
  const [selection, setSelection] = useState<{
    readonly accountsKey: string
    readonly names: SelectedNames
  }>({ accountsKey, names: NO_SELECTION })
  const selected =
    selection.accountsKey === accountsKey ? selection.names : NO_SELECTION

  const update = (change: (prev: SelectedNames) => SelectedNames) =>
    setSelection((prev) => ({
      accountsKey,
      names: change(
        prev.accountsKey === accountsKey ? prev.names : NO_SELECTION,
      ),
    }))

  const toggle = (name: DashboardName) =>
    update((prev) => {
      const key = selectionKey(name)
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, name)
      return next
    })

  /** Selects every name, or deselects them all when every one is already in. */
  const toggleAll = (names: readonly DashboardName[]) =>
    update((prev) => {
      const isAllIn =
        names.length > 0 && names.every((name) => prev.has(selectionKey(name)))
      const next = new Map(prev)
      for (const name of names) {
        if (isAllIn) next.delete(selectionKey(name))
        else next.set(selectionKey(name), name)
      }
      return next
    })

  const clear = () => update(() => NO_SELECTION)

  const labels = useMemo(() => new Set(selected.keys()), [selected])

  return { selected, labels, toggle, toggleAll, clear }
}
