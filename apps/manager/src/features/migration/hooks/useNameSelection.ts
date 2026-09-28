import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildRootSubtreeIndex,
  collectAllSelectable,
  filterGroupsBySearch,
  filterOrphansBySearch,
  toggleRootSubtree,
} from '../components/selectNames.helpers'
import type { ClassifiedName, IneligibleName } from '../service/classifyNames'
import { groupByParent } from '../service/groupByParent'

type Params = {
  readonly eligible: readonly ClassifiedName[]
  readonly gracePeriodNames?: readonly IneligibleName[]
  readonly isPending: boolean
  readonly isRecovery?: boolean
  readonly onNamesChange: (names: string[]) => void
}

const EMPTY_GRACE_PERIOD_NAMES: readonly IneligibleName[] = []

export const useNameSelection = ({
  eligible,
  gracePeriodNames = EMPTY_GRACE_PERIOD_NAMES,
  isPending,
  isRecovery = false,
  onNamesChange,
}: Params) => {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { groups, orphans } = useMemo(() => groupByParent(eligible), [eligible])
  const rootSubtrees = useMemo(
    () => buildRootSubtreeIndex(groups, orphans),
    [groups, orphans],
  )
  const allSelectable = useMemo(
    () => collectAllSelectable(groups, orphans),
    [groups, orphans],
  )
  const initiallySelected = useMemo(() => {
    if (isRecovery) return allSelectable
    const namesNeedingManagerRestoration = new Set(
      eligible
        .filter(({ managerAddress }) => managerAddress !== null)
        .flatMap(({ domain }) => [
          ...(rootSubtrees.get(domain.name) ?? [domain.name]),
        ]),
    )
    return new Set(
      [...allSelectable].filter(
        (name) => !namesNeedingManagerRestoration.has(name),
      ),
    )
  }, [allSelectable, eligible, isRecovery, rootSubtrees])

  const didSeed = useRef(false)
  useEffect(() => {
    if (didSeed.current || isPending || eligible.length === 0) return
    didSeed.current = true
    setSelected(initiallySelected)
    onNamesChange([...initiallySelected])
  }, [isPending, eligible.length, initiallySelected, onNamesChange])

  useEffect(() => {
    if (!didSeed.current || isPending) return
    setSelected((prev) => {
      const next = new Set([...prev].filter((name) => allSelectable.has(name)))
      if (next.size === prev.size) return prev
      onNamesChange([...next])
      return next
    })
  }, [allSelectable, isPending, onNamesChange])

  const searchLower = search.toLowerCase()
  const filteredGroups = useMemo(
    () => filterGroupsBySearch(groups, searchLower),
    [groups, searchLower],
  )
  const filteredOrphans = useMemo(
    () => filterOrphansBySearch(orphans, searchLower),
    [orphans, searchLower],
  )
  const filteredGracePeriodNames = useMemo(
    () =>
      gracePeriodNames.filter(({ domain }) =>
        domain.name.toLowerCase().includes(searchLower),
      ),
    [gracePeriodNames, searchLower],
  )

  const toggleName = useCallback(
    (name: string) => {
      setSelected((prev) => {
        const next = toggleRootSubtree(prev, name, rootSubtrees)
        onNamesChange([...next])
        return next
      })
    },
    [onNamesChange, rootSubtrees],
  )

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const isAllSelected =
        allSelectable.size > 0 &&
        [...allSelectable].every((name) => prev.has(name))
      const next = isAllSelected ? new Set<string>() : allSelectable
      onNamesChange([...next])
      return next
    })
  }, [allSelectable, onNamesChange])

  const currentSelected = useMemo(
    () => new Set([...selected].filter((name) => allSelectable.has(name))),
    [allSelectable, selected],
  )
  const allSelected =
    allSelectable.size > 0 &&
    [...allSelectable].every((name) => currentSelected.has(name))

  return {
    search,
    setSearch,
    selected: currentSelected,
    totalSelected: currentSelected.size,
    visibleCount: allSelectable.size,
    displayedCount: allSelectable.size + gracePeriodNames.length,
    allSelected,
    filteredGroups,
    filteredOrphans,
    filteredGracePeriodNames,
    toggleName,
    toggleAll,
  }
}
