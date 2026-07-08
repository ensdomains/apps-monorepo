import { type CSSProperties } from 'react'
import type { DqaCommentSummary } from '../types'
import { PANEL } from './panelTheme'

export type CommentFilter = 'open' | 'resolved' | 'all'
export type CommentOwnership = 'all' | 'mine'

type DqaCommentFiltersProps = {
  readonly comments: readonly DqaCommentSummary[]
  readonly filter: CommentFilter
  readonly onFilterChange: (filter: CommentFilter) => void
  readonly ownership?: CommentOwnership
  readonly onOwnershipChange?: (ownership: CommentOwnership) => void
  readonly showResolvedPins?: boolean
  readonly onToggleResolvedPins?: () => void
}

export function DqaCommentFilters({
  comments,
  filter,
  onFilterChange,
  ownership = 'all',
  onOwnershipChange,
  showResolvedPins = false,
  onToggleResolvedPins,
}: DqaCommentFiltersProps) {
  const openCount = comments.filter((c) => c.status === 'open').length
  const resolvedCount = comments.filter((c) => c.status === 'resolved').length

  const tabs: { key: CommentFilter; label: string; count: number }[] = [
    { key: 'open', label: 'Open', count: openCount },
    { key: 'resolved', label: 'Resolved', count: resolvedCount },
    { key: 'all', label: 'All', count: comments.length },
  ]

  return (
    <div style={rowStyle} role="tablist" aria-label="Comment filters">
      {tabs.map((tab) => {
        const active = filter === tab.key
        return (
          <button
            aria-selected={active}
            key={tab.key}
            onClick={() => onFilterChange(tab.key)}
            role="tab"
            style={{
              ...tabStyle,
              ...(active ? tabActiveStyle : undefined),
            }}
            type="button"
          >
            {tab.label}
            <span style={countStyle}>· {tab.count}</span>
          </button>
        )
      })}

      {onToggleResolvedPins && (
        <button
          aria-pressed={showResolvedPins}
          onClick={onToggleResolvedPins}
          style={{
            ...ownershipBtnStyle,
            ...(showResolvedPins ? tabActiveStyle : undefined),
          }}
          title="Show or hide resolved comments' pins on the page"
          type="button"
        >
          {showResolvedPins ? '✓ Resolved pins' : 'Resolved pins'}
        </button>
      )}

      {onOwnershipChange && (
        <div
          aria-label="Comment ownership"
          role="group"
          style={ownershipGroupStyle}
        >
          {(['all', 'mine'] as const).map((key) => {
            const active = ownership === key
            return (
              <button
                aria-pressed={active}
                key={key}
                onClick={() => onOwnershipChange(key)}
                style={{
                  ...ownershipBtnStyle,
                  ...(active ? tabActiveStyle : undefined),
                }}
                title={
                  key === 'mine'
                    ? 'Only comments you made'
                    : 'Comments from everyone'
                }
                type="button"
              >
                {key === 'mine' ? 'Mine' : 'Everyone'}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginBottom: 10,
}

const tabStyle: CSSProperties = {
  border: `1px solid ${PANEL.border}`,
  background: PANEL.surface,
  color: PANEL.muted,
  borderRadius: 6,
  padding: '4px 10px',
  font: PANEL.font,
  cursor: 'pointer',
}

const tabActiveStyle: CSSProperties = {
  borderColor: PANEL.accent,
  background: PANEL.accentBg,
  color: PANEL.accentDense,
  fontWeight: 600,
}

const countStyle: CSSProperties = {
  opacity: 0.85,
}

const ownershipGroupStyle: CSSProperties = {
  marginLeft: 'auto',
  display: 'flex',
  gap: 4,
}

const ownershipBtnStyle: CSSProperties = {
  border: `1px solid ${PANEL.border}`,
  background: PANEL.surface,
  color: PANEL.muted,
  borderRadius: 6,
  padding: '4px 10px',
  font: PANEL.font,
  cursor: 'pointer',
}
