import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  collectAllSelectable,
  countVisibleRows,
  filterGroupsBySearch,
  filterOrphansBySearch,
  toggleGroup as toggleGroupPure,
  toggleName as toggleNamePure,
} from '../components/selectNames.helpers'
import type { ClassifiedName } from '../service/classifyNames'
import { groupByParent } from '../service/groupByParent'

type Params = {
  readonly eligible: readonly ClassifiedName[]
  readonly isPending: boolean
  readonly onNamesChange: (names: string[]) => void
}

export const useNameSelection = ({
  eligible,
  isPending,
  onNamesChange,
}: Params) => {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { groups, orphans } = useMemo(() => groupByParent(eligible), [eligible])

  const didSeed = useRef(false)
  useEffect(() => {
    if (didSeed.current || isPending || eligible.length === 0) return
    didSeed.current = true
    const ready = collectAllSelectable(groups, orphans)
    setSelected(ready)
    onNamesChange([...ready])
  }, [isPending, eligible, groups, orphans, onNamesChange])

  const searchLower = search.toLowerCase()
  const filteredGroups = useMemo(
    () => filterGroupsBySearch(groups, searchLower),
    [groups, searchLower],
  )
  const filteredOrphans = useMemo(
    () => filterOrphansBySearch(orphans, searchLower),
    [orphans, searchLower],
  )

  const toggleName = useCallback(
    (name: string) => {
      setSelected((prev) => {
        const next = toggleNamePure(prev, name)
        onNamesChange([...next])
        return next
      })
    },
    [onNamesChange],
  )

  const toggleGroup = useCallback(
    (parentName: string, subnameNames: readonly string[]) => {
      setSelected((prev) => {
        const next = toggleGroupPure(prev, parentName, subnameNames)
        onNamesChange([...next])
        return next
      })
    },
    [onNamesChange],
  )

  const deselectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      onNamesChange([])
      return new Set()
    })
  }, [onNamesChange])

  const selectAll = useCallback(() => {
    const ready = collectAllSelectable(groups, orphans)
    setSelected(ready)
    onNamesChange([...ready])
  }, [groups, orphans, onNamesChange])

  return {
    search,
    setSearch,
    selected,
    totalSelected: selected.size,
    visibleCount: countVisibleRows(groups, orphans),
    filteredGroups,
    filteredOrphans,
    toggleName,
    toggleGroup,
    deselectAll,
    selectAll,
  }
}
