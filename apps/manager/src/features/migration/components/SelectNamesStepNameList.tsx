import { Trans } from '@lingui/react/macro'
import { match } from 'ts-pattern'
import type { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import type { NameTreeNode } from '@/features/migration/service/groupByParent'
import { cn } from '@/lib/utils'
import { NameListSkeleton } from './NameListSkeleton'
import { NameRow } from './NameRow'

type NameSelectionState = ReturnType<typeof useNameSelection>

type SelectNamesStepNameListProps = Pick<
  NameSelectionState,
  'filteredGroups' | 'filteredOrphans' | 'search' | 'selected' | 'toggleName'
> & {
  readonly isPending: boolean
}

type NameTreeRowsProps = {
  readonly depth: number
  readonly nodes: readonly NameTreeNode[]
  readonly selected: ReadonlySet<string>
  readonly toggleName: (name: string) => void
}

type NameTreeConnectorProps = {
  readonly isFirst: boolean
  readonly isLast: boolean
}

const NameTreeConnector = ({ isFirst, isLast }: NameTreeConnectorProps) => (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-y-0 left-0 w-7.5 text-ens-garnet-900 opacity-30"
  >
    {!isLast && (
      <span className="absolute top-0 -bottom-4 left-0 w-px bg-current" />
    )}
    <span
      className={cn(
        'absolute left-0 w-7.5 rounded-bl-md border-current border-b border-l',
        isFirst ? '-top-4 h-[34.5px]' : 'top-0 h-[18.5px]',
      )}
    />
  </span>
)

const NameTreeRows = ({
  depth,
  nodes,
  selected,
  toggleName,
}: NameTreeRowsProps) => (
  <ul
    className={cn(
      'flex min-w-0 flex-col',
      'gap-4',
      depth > 0 && 'mt-4',
      depth === 1 && 'ml-14.5',
      depth > 1 && 'ml-4.5',
    )}
  >
    {nodes.map((node, index) => {
      const name = node.item.domain.name
      const isFirst = index === 0
      const isLast = index === nodes.length - 1
      return (
        <li
          className={cn('relative min-w-0', depth > 0 && 'pl-7.5')}
          key={node.item.domain.id}
        >
          {depth > 0 && <NameTreeConnector isFirst={isFirst} isLast={isLast} />}
          <NameRow
            depth={depth}
            isSelected={selected.has(name)}
            item={node.item}
            onClick={depth === 0 ? () => toggleName(name) : undefined}
          />
          {node.children.length > 0 && (
            <NameTreeRows
              depth={depth + 1}
              nodes={node.children}
              selected={selected}
              toggleName={toggleName}
            />
          )}
        </li>
      )
    })}
  </ul>
)

export const SelectNamesStepNameList = ({
  filteredGroups,
  filteredOrphans,
  isPending,
  search,
  selected,
  toggleName,
}: SelectNamesStepNameListProps) =>
  match({
    isPending,
    hasResults: filteredGroups.length > 0 || filteredOrphans.length > 0,
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
      <NameTreeRows
        depth={0}
        nodes={[...filteredGroups, ...filteredOrphans]}
        selected={selected}
        toggleName={toggleName}
      />
    ))
