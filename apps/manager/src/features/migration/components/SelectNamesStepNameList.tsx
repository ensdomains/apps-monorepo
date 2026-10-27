import { Plural, Trans } from '@lingui/react/macro'
import { Info, RotateCcw } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { match } from 'ts-pattern'
import type { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { NameListSkeleton } from './NameListSkeleton'
import { NameRow } from './NameRow'
import { NameTreeRows } from './NameTreeRows'

type NameSelectionState = ReturnType<typeof useNameSelection>

type SelectNamesStepNameListProps = Pick<
  NameSelectionState,
  | 'filteredGroups'
  | 'filteredOrphans'
  | 'filteredGracePeriodNames'
  | 'includedSubnames'
  | 'isManagerRestorationLocked'
  | 'managerCandidates'
  | 'restoredManagers'
  | 'search'
  | 'selected'
  | 'toggleManagerRestoration'
  | 'toggleName'
> & {
  readonly children: ReactNode
  readonly hasInsufficientRenewalFunds: boolean
  readonly isPending: boolean
}

const SelectNamesStepNameListComponent = ({
  children,
  filteredGroups,
  filteredOrphans,
  filteredGracePeriodNames,
  hasInsufficientRenewalFunds,
  isManagerRestorationLocked,
  isPending,
  managerCandidates,
  includedSubnames,
  restoredManagers,
  search,
  selected,
  toggleManagerRestoration,
  toggleName,
}: SelectNamesStepNameListProps) => {
  const { data: primaryName } = useConnectedReverseName()
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
      <div className="flex flex-col gap-8">
        {filteredGracePeriodNames.length > 0 && (
          <section className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 font-normal font-semi-mono text-ens-garnet-900 text-sm uppercase leading-[1.2] tracking-[0.14px] md:text-base md:tracking-[0.16px]">
                <RotateCcw aria-hidden className="size-4 shrink-0" />
                <Plural
                  one="# name in grace"
                  other="# names in grace"
                  value={filteredGracePeriodNames.length}
                />
              </h2>
              <p className="flex items-start gap-1 text-ens-garnet-900/70 text-xs leading-normal tracking-[-0.24px] md:text-sm md:tracking-[-0.28px]">
                <Info
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                  strokeWidth={1.8}
                />
                <Trans>
                  Names in grace will be renewed before being migrated
                </Trans>
              </p>
            </div>
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
                    warning={
                      hasInsufficientRenewalFunds &&
                      selected.has(item.domain.name) && (
                        <Trans>
                          Not enough USDC to renew the selected names. Add USDC
                          or deselect this name.
                        </Trans>
                      )
                    }
                  />
                  {selected.has(item.domain.name) &&
                    includedSubnames.has(item.domain.name) && (
                      <NameTreeRows
                        depth={1}
                        isManagerRestorationLocked={isManagerRestorationLocked}
                        managerCandidates={managerCandidates}
                        nodes={(
                          includedSubnames.get(item.domain.name) ?? []
                        ).map((child) => ({ item: child, children: [] }))}
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
          </section>
        )}
        {(filteredGroups.length > 0 || filteredOrphans.length > 0) && (
          <section className="flex min-w-0 flex-col gap-6">
            {children}
            <NameTreeRows
              depth={0}
              isManagerRestorationLocked={isManagerRestorationLocked}
              managerCandidates={managerCandidates}
              nodes={[...filteredGroups, ...filteredOrphans]}
              primaryName={primaryName}
              restoredManagers={restoredManagers}
              selected={selected}
              toggleManagerRestoration={toggleManagerRestoration}
              toggleName={toggleName}
            />
          </section>
        )}
      </div>
    ))
}

export const SelectNamesStepNameList = memo(SelectNamesStepNameListComponent)
