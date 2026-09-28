import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import {
  buildRootSubtreeIndex,
  collectAllSelectable,
  filterGroupsBySearch,
  filterOrphansBySearch,
  toggleRootSubtree,
} from '../components/selectNames.helpers'
import {
  type ClassifiedName,
  managerRestorationCandidates,
} from '../service/classifyNames'
import { groupByParent } from '../service/groupByParent'

type Params = {
  readonly eligible: readonly ClassifiedName[]
  readonly isPending: boolean
  readonly isRecovery?: boolean
  /**
   * A resumed run replays the opt-in from its durable snapshot, so the choice
   * is fixed for the rest of that run and the checkboxes are read-only.
   */
  readonly isManagerRestorationLocked?: boolean
  readonly onNamesChange: (names: string[]) => void
  readonly onManagerRestorationChange: (names: string[]) => void
}

export const useNameSelection = ({
  eligible,
  isPending,
  isRecovery = false,
  isManagerRestorationLocked = false,
  onNamesChange,
  onManagerRestorationChange,
}: Params) => {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Opt-in, never seeded from a v1 controller: a controller that differs from
  // the registrant may be a manager the owner appointed or a seller a
  // marketplace transfer left behind, so nothing is re-granted until it is
  // asked for by name. A resumed run is the one exception — there the choice
  // was already made and is replayed from the snapshot below.
  const [restoredManagers, setRestoredManagers] = useState<ReadonlySet<string>>(
    new Set(),
  )

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

  const managerCandidates = useMemo(
    () =>
      new Map<string, Address>(
        managerRestorationCandidates(eligible).flatMap((name) =>
          name.registryController
            ? [[name.domain.name, name.registryController] as const]
            : [],
        ),
      ),
    [eligible],
  )

  // On a resumed run the classified names already carry the opt-in replayed
  // from the durable snapshot, so the checkboxes show what will actually be
  // granted instead of starting blank.
  const lockedRestoredManagers = useMemo(
    () =>
      new Set(
        eligible
          .filter(({ managerAddress }) => managerAddress !== null)
          .map(({ domain }) => domain.name),
      ),
    [eligible],
  )

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

  // No side effect inside the updater: React may run it speculatively or
  // discard the result, which would let the machine's opt-in list drift from
  // the checkbox the owner actually sees. Reporting happens in one effect,
  // below, off the committed state.
  const toggleManagerRestoration = useCallback(
    (name: string) => {
      if (isManagerRestorationLocked) return
      setRestoredManagers((prev) => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        return next
      })
    },
    [isManagerRestorationLocked],
  )

  const currentSelected = useMemo(
    () => new Set([...selected].filter((name) => allSelectable.has(name))),
    [allSelectable, selected],
  )
  const allSelected =
    allSelectable.size > 0 &&
    [...allSelectable].every((name) => currentSelected.has(name))

  // Purely derived, never written back into state. A render where `eligible`
  // is briefly empty must not destroy the owner's ticks, so the stored set is
  // left alone and only this view is narrowed: deselecting a name, or losing
  // it from the eligible set, withdraws its opt-in from the batch.
  const currentRestoredManagers = useMemo(() => {
    const source = isManagerRestorationLocked
      ? lockedRestoredManagers
      : restoredManagers
    return new Set(
      [...source].filter(
        (name) => managerCandidates.has(name) && currentSelected.has(name),
      ),
    )
  }, [
    currentSelected,
    isManagerRestorationLocked,
    lockedRestoredManagers,
    managerCandidates,
    restoredManagers,
  ])

  // Stable identity for the effect below: a fresh Set every render would loop.
  const restoredManagersKey = useMemo(
    () => [...currentRestoredManagers].sort().join(','),
    [currentRestoredManagers],
  )

  useEffect(() => {
    if (!didSeed.current || isPending) return
    onManagerRestorationChange(
      restoredManagersKey === '' ? [] : restoredManagersKey.split(','),
    )
  }, [isPending, onManagerRestorationChange, restoredManagersKey])

  return {
    search,
    setSearch,
    selected: currentSelected,
    managerCandidates,
    isManagerRestorationLocked,
    restoredManagers: currentRestoredManagers,
    toggleManagerRestoration,
    totalSelected: currentSelected.size,
    visibleCount: allSelectable.size,
    allSelected,
    filteredGroups,
    filteredOrphans,
    toggleName,
    toggleAll,
  }
}
