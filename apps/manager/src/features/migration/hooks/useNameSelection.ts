import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ALL_ELIGIBLE_PRESET,
  type MigrationAiPreset,
  NO_MANAGER_RESTORATION_PRESET,
  proposeNoManagerRestorationNames,
  proposeRequestedMigrationNames,
} from '../components/migrationAiPreset'
import {
  buildRootSubtreeIndex,
  collectAllSelectable,
  filterGroupsBySearch,
  filterOrphansBySearch,
  toggleRootSubtree,
} from '../components/selectNames.helpers'
import type { ClassifiedName } from '../service/classifyNames'
import { groupByParent } from '../service/groupByParent'

type Params = {
  readonly eligible: readonly ClassifiedName[]
  readonly isPending: boolean
  readonly isRecovery?: boolean
  readonly preset?: MigrationAiPreset
  readonly names?: readonly string[]
  readonly onNamesChange: (names: string[]) => void
}

export const useNameSelection = ({
  eligible,
  isPending,
  isRecovery = false,
  preset,
  names,
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
    if (names) {
      const proposal = proposeRequestedMigrationNames(eligible, names, preset)
      return new Set(
        [...proposal.selected].filter((name) => allSelectable.has(name)),
      )
    }
    if (preset === ALL_ELIGIBLE_PRESET) return allSelectable
    if (preset === NO_MANAGER_RESTORATION_PRESET) {
      const proposal = proposeNoManagerRestorationNames(eligible)
      return new Set(
        [...proposal.selected].filter((name) => allSelectable.has(name)),
      )
    }
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
  }, [allSelectable, eligible, isRecovery, preset, rootSubtrees, names])

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
    allSelected,
    filteredGroups,
    filteredOrphans,
    toggleName,
    toggleAll,
  }
}
