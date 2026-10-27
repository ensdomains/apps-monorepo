import { Trans } from '@lingui/react/macro'
import { memo, useMemo } from 'react'
import { match } from 'ts-pattern'
import type { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import type {
  ClassifiedName,
  CopyClassifiedName,
} from '../service/classifyNames'
import { NameListSkeleton } from './NameListSkeleton'
import { NameRow } from './NameRow'
import { NameTreeRows } from './NameTreeRows'

type NameSelectionState = ReturnType<typeof useNameSelection>

type SelectNamesStepNameListProps = Pick<
  NameSelectionState,
  | 'filteredGroups'
  | 'filteredOrphans'
  | 'filteredGracePeriodNames'
  | 'isManagerRestorationLocked'
  | 'managerCandidates'
  | 'restoredManagers'
  | 'search'
  | 'selected'
  | 'toggleManagerRestoration'
  | 'toggleName'
> & {
  readonly isPending: boolean
  readonly includedNames?: readonly ClassifiedName[]
}

const EMPTY_INCLUDED_NAMES: readonly ClassifiedName[] = []

const SelectNamesStepNameListComponent = ({
  filteredGroups,
  filteredOrphans,
  filteredGracePeriodNames,
  isManagerRestorationLocked,
  isPending,
  managerCandidates,
  includedNames = EMPTY_INCLUDED_NAMES,
  restoredManagers,
  search,
  selected,
  toggleManagerRestoration,
  toggleName,
}: SelectNamesStepNameListProps) => {
  const { data: primaryName } = useConnectedReverseName()
  const includedSubnames = useMemo(() => {
    const groups = new Map<string, CopyClassifiedName[]>()
    for (const name of includedNames) {
      if (name.action !== 'copy' || !name.recreationRoot) continue
      const children = groups.get(name.recreationRoot) ?? []
      children.push(name)
      groups.set(name.recreationRoot, children)
    }
    return groups
  }, [includedNames])

  return match({
    isPending,
    hasResults:
      filteredGroups.length > 0 ||
      filteredOrphans.length > 0 ||
      filteredGracePeriodNames.length > 0,
  })
    .with({ isPending: true }, () => <NameListSkeleton />)
    .with({ hasResults: false }, () => (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-ens-garnet-900/40 text-sm">
          {match(search)
            .when(
              (s) => s.length > 0,
              () => <Trans>No names match your search</Trans>,
            )
            .otherwise(() => (
              <Trans>No eligible names found for this wallet</Trans>
            ))}
        </p>
      </div>
    ))
    .otherwise(() => (
      <>
        <NameTreeRows
          depth={0}
          includedSubnames={includedSubnames}
          isManagerRestorationLocked={isManagerRestorationLocked}
          managerCandidates={managerCandidates}
          nodes={[...filteredGroups, ...filteredOrphans]}
          primaryName={primaryName}
          restoredManagers={restoredManagers}
          selected={selected}
          toggleManagerRestoration={toggleManagerRestoration}
          toggleName={toggleName}
        />
        {filteredGracePeriodNames.length > 0 && (
          <ul className="flex min-w-0 flex-col gap-4">
            {filteredGracePeriodNames.map((item) => (
              <li className="min-w-0" key={item.domain.id}>
                <NameRow
                  depth={0}
                  isInGrace
                  isManagerRestorationLocked={isManagerRestorationLocked}
                  isManagerRestored={restoredManagers.has(item.domain.name)}
                  isPrimary={item.domain.name === primaryName}
                  isSelected={selected.has(item.domain.name)}
                  item={item}
                  managerCandidate={managerCandidates.get(item.domain.name)}
                  onToggle={toggleName}
                  onToggleManagerRestoration={toggleManagerRestoration}
                />
                {selected.has(item.domain.name) &&
                  includedSubnames.has(item.domain.name) && (
                    <NameTreeRows
                      depth={1}
                      includedSubnames={includedSubnames}
                      isManagerRestorationLocked={isManagerRestorationLocked}
                      managerCandidates={managerCandidates}
                      nodes={(includedSubnames.get(item.domain.name) ?? []).map(
                        (child) => ({ item: child, children: [] }),
                      )}
                      primaryName={primaryName}
                      restoredManagers={restoredManagers}
                      selected={selected}
                      toggleManagerRestoration={toggleManagerRestoration}
                      toggleName={toggleName}
                    />
                  )}
              </li>
            ))}
          </ul>
        )}
      </>
    ))
}

export const SelectNamesStepNameList = memo(SelectNamesStepNameListComponent)
