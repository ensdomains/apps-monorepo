import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import {
  buildRootSubtreeIndex,
  collectAllSelectable,
  filterGroupsBySearch,
  filterOrphansBySearch,
  includeSubnamesInTree,
  toggleRootSubtree,
} from '../components/selectNames.helpers'
import {
  type ClassifiedName,
  type CopyClassifiedName,
  type IneligibleName,
  managerRestorationCandidates,
  registryControllerOf,
} from '../service/classifyNames'
import { groupByParent } from '../service/groupByParent'
import { hasManagerRestorationAfterRenewal } from './useNameSelection.helpers'

type Params = {
  readonly eligible: readonly ClassifiedName[]
  readonly gracePeriodNames?: readonly IneligibleName[]
  readonly includedNames?: readonly ClassifiedName[]
  readonly isPending: boolean
  readonly isRecovery?: boolean
  /** Initial opt-out only; explicit choices and durable recovery are preserved. */
  readonly defaultExcludedNames?: readonly string[]
  /**
   * A resumed run replays the opt-in from its durable snapshot, so the choice
   * is fixed for the rest of that run and the checkboxes are read-only.
   */
  readonly isManagerRestorationLocked?: boolean
  readonly onNamesChange: (names: string[]) => void
  readonly onManagerRestorationChange: (names: string[]) => void
}

const EMPTY_GRACE_PERIOD_NAMES: readonly IneligibleName[] = []
const EMPTY_EXCLUDED_NAMES: readonly string[] = []
const EMPTY_INCLUDED_NAMES: readonly ClassifiedName[] = []

export const useNameSelection = ({
  eligible,
  gracePeriodNames = EMPTY_GRACE_PERIOD_NAMES,
  includedNames = EMPTY_INCLUDED_NAMES,
  isPending,
  isRecovery = false,
  defaultExcludedNames = EMPTY_EXCLUDED_NAMES,
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
    const excluded = new Set(defaultExcludedNames)
    // A root checkbox includes its migration subtree. Keep the entire group
    // opt-in when any operation in that group would delete subnames.
    for (const subtree of rootSubtrees.values()) {
      if ([...subtree].some((name) => excluded.has(name))) {
        for (const name of subtree) excluded.add(name)
      }
    }
    return new Set(
      [...allSelectable].filter(
        (name) =>
          !namesNeedingManagerRestoration.has(name) && !excluded.has(name),
      ),
    )
  }, [
    allSelectable,
    defaultExcludedNames,
    eligible,
    eligibleSelectable,
    gracePeriodNames,
    isRecovery,
    rootSubtrees,
  ])
  const [hasSeeded, setHasSeeded] = useState(false)
  useEffect(() => {
    if (hasSeeded || isPending || allSelectable.size === 0) return
    setHasSeeded(true)
    setSelected(initiallySelected)
  }, [hasSeeded, isPending, allSelectable.size, initiallySelected])

  useEffect(() => {
    if (!hasSeeded || isPending) return
    setSelected((prev) => {
      const next = new Set([...prev].filter((name) => allSelectable.has(name)))
      if (next.size === prev.size) return prev
      return next
    })
  }, [allSelectable, hasSeeded, isPending])

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
  const includedSubnames = useMemo(() => {
    const subnames = new Map<string, CopyClassifiedName[]>()
    for (const name of includedNames) {
      if (
        name.action !== 'copy' ||
        !name.recreationRoot ||
        !selected.has(name.recreationRoot)
      )
        continue
      if (
        !name.recreationRoot.toLowerCase().includes(searchLower) &&
        !name.domain.name.toLowerCase().includes(searchLower)
      )
        continue
      const children = subnames.get(name.recreationRoot) ?? []
      children.push(name)
      subnames.set(name.recreationRoot, children)
    }
    return subnames
  }, [includedNames, searchLower, selected])
  const filteredGroups = useMemo(
    () =>
      filterGroupsBySearch(
        includeSubnamesInTree(groups, includedSubnames),
        searchLower,
      ),
    [groups, includedSubnames, searchLower],
  )
  const filteredOrphans = useMemo(
    () =>
      filterOrphansBySearch(
        includeSubnamesInTree(orphans, includedSubnames),
        searchLower,
      ),
    [includedSubnames, orphans, searchLower],
  )
  const filteredGracePeriodNames = useMemo(
    () =>
      gracePeriodNames.filter(
        ({ domain }) =>
          domain.name.toLowerCase().includes(searchLower) ||
          includedSubnames.has(domain.name),
      ),
    [gracePeriodNames, includedSubnames, searchLower],
  )

  const toggleName = useCallback(
    (name: string) => {
      setSelected((prev) => toggleRootSubtree(prev, name, rootSubtrees))
    },
    [rootSubtrees],
  )

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const isAllSelected =
        allSelectable.size > 0 &&
        [...allSelectable].every((name) => prev.has(name))
      return isAllSelected ? new Set<string>() : allSelectable
    })
  }, [allSelectable])

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

  const selectedNamesKey = JSON.stringify([...currentSelected])
  const publishedNamesKey = useRef<string | null>(null)
  // Notify from committed state only: React can replay or discard updaters.
  // A stable key also avoids duplicate notifications when callbacks change.
  useEffect(() => {
    if (
      !hasSeeded ||
      isPending ||
      publishedNamesKey.current === selectedNamesKey
    )
      return
    publishedNamesKey.current = selectedNamesKey
    onNamesChange([...currentSelected])
  }, [currentSelected, hasSeeded, isPending, onNamesChange, selectedNamesKey])

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
    if (!hasSeeded || isPending) return
    onManagerRestorationChange(
      restoredManagersKey === '' ? [] : restoredManagersKey.split(','),
    )
  }, [hasSeeded, isPending, onManagerRestorationChange, restoredManagersKey])

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
    includedSubnames,
    toggleName,
    toggleAll,
  }
}
