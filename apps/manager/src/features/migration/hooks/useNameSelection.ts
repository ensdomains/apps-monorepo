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
  type IneligibleName,
  managerRestorationCandidates,
  registryControllerOf,
} from '../service/classifyNames'
import { groupByParent } from '../service/groupByParent'
import { hasManagerRestorationAfterRenewal } from './useNameSelection.helpers'

type Params = {
  readonly eligible: readonly ClassifiedName[]
  readonly gracePeriodNames?: readonly IneligibleName[]
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

const EMPTY_GRACE_PERIOD_NAMES: readonly IneligibleName[] = []

export const useNameSelection = ({
  eligible,
  gracePeriodNames = EMPTY_GRACE_PERIOD_NAMES,
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
  const rootSubtrees = useMemo(() => {
    const subtrees = new Map(buildRootSubtreeIndex(groups, orphans))
    for (const { domain } of gracePeriodNames) {
      subtrees.set(domain.name, new Set([domain.name]))
    }
    return subtrees
  }, [groups, orphans, gracePeriodNames])
  const eligibleSelectable = useMemo(
    () => collectAllSelectable(groups, orphans),
    [groups, orphans],
  )
  const allSelectable = useMemo(
    () =>
      new Set([
        ...eligibleSelectable,
        ...gracePeriodNames.map(({ domain }) => domain.name),
      ]),
    [eligibleSelectable, gracePeriodNames],
  )
  const initiallySelected = useMemo(() => {
    if (isRecovery) return eligibleSelectable
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
    const namesNeedingManagerRestoration = new Set([
      ...eligible
        .filter(({ managerAddress }) => managerAddress !== null)
        .flatMap(({ domain }) => [
          ...(rootSubtrees.get(domain.name) ?? [domain.name]),
        ]),
      // Grace names have no classification yet, so check the unwrapped
      // ownership that will require manager restoration after renewal.
      ...gracePeriodNames
        .filter(({ domain }) =>
          hasManagerRestorationAfterRenewal(domain, nowSeconds),
        )
        .map(({ domain }) => domain.name),
    ])
    return new Set(
      [...allSelectable].filter(
        (name) => !namesNeedingManagerRestoration.has(name),
      ),
    )
  }, [
    allSelectable,
    eligible,
    eligibleSelectable,
    gracePeriodNames,
    isRecovery,
    rootSubtrees,
  ])
  const didSeed = useRef(false)
  useEffect(() => {
    if (didSeed.current || isPending || allSelectable.size === 0) return
    didSeed.current = true
    setSelected(initiallySelected)
    onNamesChange([...initiallySelected])
  }, [isPending, allSelectable.size, initiallySelected, onNamesChange])

  useEffect(() => {
    if (!didSeed.current || isPending) return
    setSelected((prev) => {
      const next = new Set([...prev].filter((name) => allSelectable.has(name)))
      if (next.size === prev.size) return prev
      onNamesChange([...next])
      return next
    })
  }, [allSelectable, isPending, onNamesChange])

  const managerCandidates = useMemo(() => {
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
    return new Map<string, Address>([
      ...managerRestorationCandidates(eligible).flatMap((name) =>
        name.registryController
          ? [[name.domain.name, name.registryController] as const]
          : [],
      ),
      // Grace names are classified only after renewal; offer the same choice
      // for the controller that classification will then record.
      ...gracePeriodNames.flatMap(({ domain }) => {
        const controller = hasManagerRestorationAfterRenewal(domain, nowSeconds)
          ? registryControllerOf(domain)
          : null
        return controller ? [[domain.name, controller] as const] : []
      }),
    ])
  }, [eligible, gracePeriodNames])

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
    displayedCount: allSelectable.size,
    allSelected,
    filteredGroups,
    filteredOrphans,
    filteredGracePeriodNames,
    toggleName,
    toggleAll,
  }
}
