import { Trans } from '@lingui/react/macro'
import { type CSSProperties, memo } from 'react'
import { match } from 'ts-pattern'
import type { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import type { NameTreeNode } from '@/features/migration/service/groupByParent'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { cn } from '@/lib/utils'
import { NameListSkeleton } from './NameListSkeleton'
import { NameRow } from './NameRow'

type NameSelectionState = ReturnType<typeof useNameSelection>

type SelectNamesStepNameListProps = Pick<
  NameSelectionState,
  | 'filteredGroups'
  | 'filteredOrphans'
  | 'filteredGracePeriodNames'
  | 'managerCandidates'
  | 'restoredManagers'
  | 'search'
  | 'selected'
  | 'toggleManagerRestoration'
  | 'toggleName'
> & {
  readonly isPending: boolean
}

type NameTreeRowsProps = {
  readonly depth: number
  readonly managerCandidates: NameSelectionState['managerCandidates']
  readonly nodes: readonly NameTreeNode[]
  readonly primaryName: string | null | undefined
  readonly restoredManagers: ReadonlySet<string>
  readonly selected: ReadonlySet<string>
  readonly toggleManagerRestoration: (name: string) => void
  readonly toggleName: (name: string) => void
}

type NameTreeConnectorProps = {
  readonly isFirst: boolean
  readonly isLast: boolean
}

const LARGE_LIST_THRESHOLD = 100
const OFFSCREEN_ROW_STYLE = {
  containIntrinsicBlockSize: 'auto 37px',
  contentVisibility: 'auto',
} satisfies CSSProperties

const NameTreeConnector = ({ isFirst, isLast }: NameTreeConnectorProps) => (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-y-0 left-0 w-7.5 text-ens-garnet-900 opacity-30"
  >
    {!isLast && (
      <span className="absolute top-0 -bottom-4 left-0 w-px bg-current" />
    )}
    <span className="absolute top-0 left-0 h-9.25 w-7.5">
      <span
        className={cn(
          'absolute right-0 bottom-1/2 left-0 rounded-bl-md border-current border-b border-l',
          isFirst ? '-top-4' : 'top-0',
        )}
      />
    </span>
  </span>
)

const NameTreeRows = ({
  depth,
  managerCandidates,
  nodes,
  primaryName,
  restoredManagers,
  selected,
  toggleManagerRestoration,
  toggleName,
}: NameTreeRowsProps) => (
  <ul
    className={cn(
      'flex min-w-0 flex-col',
      'gap-4',
      depth > 0 && 'mt-4',
      depth === 1 && 'ml-10',
      depth > 1 && 'ml-4.5',
    )}
  >
    {nodes.map((node, index) => {
      const name = node.item.domain.name
      const isFirst = index === 0
      const isLast = index === nodes.length - 1
      // Paint containment would clip the primary badge above the row.
      const shouldDeferOffscreenRow =
        depth === 0 &&
        nodes.length >= LARGE_LIST_THRESHOLD &&
        name !== primaryName &&
        node.children.length === 0
      return (
        <li
          className={cn('relative min-w-0', depth > 0 && 'pl-7.5')}
          key={node.item.domain.id}
          style={shouldDeferOffscreenRow ? OFFSCREEN_ROW_STYLE : undefined}
        >
          {depth > 0 && <NameTreeConnector isFirst={isFirst} isLast={isLast} />}
          <NameRow
            depth={depth}
            isManagerRestored={restoredManagers.has(name)}
            isPrimary={name === primaryName}
            isSelected={selected.has(name)}
            item={node.item}
            managerCandidate={managerCandidates.get(name)}
            onToggle={depth === 0 ? toggleName : undefined}
            onToggleManagerRestoration={
              depth === 0 ? toggleManagerRestoration : undefined
            }
          />
          {node.children.length > 0 && (
            <NameTreeRows
              depth={depth + 1}
              managerCandidates={managerCandidates}
              nodes={node.children}
              primaryName={primaryName}
              restoredManagers={restoredManagers}
              selected={selected}
              toggleManagerRestoration={toggleManagerRestoration}
              toggleName={toggleName}
            />
          )}
        </li>
      )
    })}
  </ul>
)

const SelectNamesStepNameListComponent = ({
  filteredGroups,
  filteredOrphans,
  filteredGracePeriodNames,
  isPending,
  managerCandidates,
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
      <>
        <NameTreeRows
          depth={0}
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
                  isPrimary={item.domain.name === primaryName}
                  isSelected={selected.has(item.domain.name)}
                  item={item}
                  onToggle={toggleName}
                />
              </li>
            ))}
          </ul>
        )}
      </>
    ))
}

export const SelectNamesStepNameList = memo(SelectNamesStepNameListComponent)
