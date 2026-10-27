import type { CSSProperties } from 'react'
import type { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import type { NameTreeNode } from '@/features/migration/service/groupByParent'
import { cn } from '@/lib/utils'
import type {
  ClassifiedName,
  CopyClassifiedName,
} from '../service/classifyNames'
import { IncludedSubnameDetails } from './IncludedSubnameDetails'
import { NameRow } from './NameRow'

type NameSelectionState = ReturnType<typeof useNameSelection>

type NameTreeRowsProps = {
  readonly depth: number
  readonly isManagerRestorationLocked: boolean
  readonly managerCandidates: NameSelectionState['managerCandidates']
  readonly nodes: readonly NameTreeNode[]
  readonly includedSubnames: ReadonlyMap<string, readonly CopyClassifiedName[]>
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

const importedSubname = (item: ClassifiedName): CopyClassifiedName | null =>
  item.action === 'copy' && item.recreationRoot ? item : null

const childrenWithCopies = (
  node: NameTreeNode,
  copies: readonly CopyClassifiedName[],
): readonly NameTreeNode[] => {
  const children = new Map(
    node.children.map((child) => [child.item.domain.name, child]),
  )
  for (const item of copies) {
    children.set(item.domain.name, {
      item,
      children: children.get(item.domain.name)?.children ?? [],
    })
  }
  return [...children.values()].sort((a, b) =>
    a.item.domain.name.localeCompare(b.item.domain.name),
  )
}

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

export const NameTreeRows = ({
  depth,
  isManagerRestorationLocked,
  managerCandidates,
  nodes,
  includedSubnames,
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
      const copy = importedSubname(node.item)
      const isSelected = selected.has(copy?.recreationRoot ?? name)
      const copies = isSelected ? (includedSubnames.get(name) ?? []) : []
      const children = childrenWithCopies(node, copies)
      const isFirst = index === 0
      const isLast = index === nodes.length - 1
      // Paint containment would clip the primary badge above the row.
      const shouldDeferOffscreenRow =
        depth === 0 &&
        nodes.length >= LARGE_LIST_THRESHOLD &&
        name !== primaryName &&
        children.length === 0
      return (
        <li
          className={cn('relative min-w-0', depth > 0 && 'pl-7.5')}
          key={node.item.domain.id}
          style={shouldDeferOffscreenRow ? OFFSCREEN_ROW_STYLE : undefined}
        >
          {depth > 0 && <NameTreeConnector isFirst={isFirst} isLast={isLast} />}
          <NameRow
            depth={depth}
            isManagerRestorationLocked={isManagerRestorationLocked}
            isManagerRestored={restoredManagers.has(name)}
            isPrimary={name === primaryName}
            isSelected={isSelected}
            item={node.item}
            managerCandidate={managerCandidates.get(name)}
            onToggle={depth === 0 ? toggleName : undefined}
            onToggleManagerRestoration={
              depth === 0 ? toggleManagerRestoration : undefined
            }
          />
          {copy && <IncludedSubnameDetails subname={copy} />}
          {children.length > 0 && (
            <NameTreeRows
              depth={depth + 1}
              includedSubnames={includedSubnames}
              isManagerRestorationLocked={isManagerRestorationLocked}
              managerCandidates={managerCandidates}
              nodes={children}
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
