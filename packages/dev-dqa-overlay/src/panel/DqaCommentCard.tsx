import { type CSSProperties } from 'react'
import type { DqaCommentSummary } from '../types'
import { formatRelativeTime } from './formatRelativeTime'
import { linearIssueUrl } from './linearUrl'
import { PANEL } from './panelTheme'

type DqaCommentCardProps = {
  readonly comment: DqaCommentSummary
  readonly active: boolean
  readonly onFocus: () => void
  readonly onResolve?: () => void
  readonly onDelete?: () => void
  readonly showFocusAction?: boolean
}

export function DqaCommentCard({
  comment,
  active,
  onFocus,
  onResolve,
  onDelete,
  showFocusAction = true,
}: DqaCommentCardProps) {
  const linearUrl =
    comment.linear?.url ??
    (comment.issueRef ? linearIssueUrl(comment.issueRef) : null)
  const linearLabel = comment.linear?.identifier ?? comment.issueRef
  const clickable = showFocusAction

  return (
    // biome-ignore lint/a11y/useSemanticElements: clickable card with inner controls
    <article
      aria-label={clickable ? 'Focus comment on page' : undefined}
      onClick={clickable ? onFocus : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onFocus()
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      style={{
        ...cardStyle,
        ...(clickable ? cardClickableStyle : undefined),
        ...(active ? cardActiveStyle : undefined),
      }}
    >
      <div style={headerStyle}>
        <div style={headerLeftStyle}>
          <span style={pinStyle}>
            {comment.status === 'resolved' ? '✓' : `#${comment.pinIndex}`}
          </span>
          <span style={anchorStyle}>{comment.anchorLabel ?? 'Element'}</span>
        </div>
        <span
          style={{
            ...statusStyle,
            ...(comment.status === 'resolved' ? statusResolvedStyle : undefined),
          }}
        >
          {comment.status}
        </span>
      </div>

      <p style={bodyStyle}>"{comment.body}"</p>

      <div style={metaStyle}>
        <span>{comment.author}</span>
        {comment.replyCount > 0 && (
          <span>
            · {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
          </span>
        )}
        <span>· {formatRelativeTime(comment.createdAt)}</span>
        {comment.linearDeleted ? (
          <span
            style={linearDeletedStyle}
            title="The pushed comment/issue was deleted in Linear"
          >
            {linearLabel ?? 'Linear'} · deleted in Linear
          </span>
        ) : (
          linearLabel &&
          linearUrl && (
            <a
              href={linearUrl}
              onClick={(event) => event.stopPropagation()}
              rel="noopener noreferrer"
              style={linearLinkStyle}
              target="_blank"
            >
              {linearLabel} ↗
            </a>
          )
        )}
        {!comment.linear && !comment.issueRef && (
          <span style={notLinkedStyle}>· Not in Linear yet</span>
        )}
      </div>

      {showFocusAction && (onResolve || onDelete) && (
        <div style={actionsStyle}>
          {onDelete && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onDelete()
              }}
              style={deleteBtnStyle}
              title="Delete this DQA comment (does not touch Linear)"
              type="button"
            >
              Delete
            </button>
          )}
          {comment.status === 'open' && onResolve && (
            <button
              onClick={(event) => {
                event.stopPropagation()
                onResolve()
              }}
              style={resolveBtnStyle}
              title="Mark as resolved (moves out of the Open filter)"
              type="button"
            >
              ✓ Resolve
            </button>
          )}
        </div>
      )}
    </article>
  )
}

const cardStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${PANEL.border}`,
  background: PANEL.surface,
}

const cardClickableStyle: CSSProperties = {
  cursor: 'pointer',
}

const cardActiveStyle: CSSProperties = {
  borderColor: PANEL.accent,
  background: PANEL.accentBg,
  boxShadow: `0 0 0 1px ${PANEL.accent}`,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 6,
}

const headerLeftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

const pinStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: PANEL.accentDense,
  color: PANEL.onAccent,
  font: PANEL.font,
  fontWeight: 700,
  fontSize: 10,
}

const anchorStyle: CSSProperties = {
  font: PANEL.font,
  fontWeight: 600,
  color: PANEL.accentDense,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const statusStyle: CSSProperties = {
  flexShrink: 0,
  font: PANEL.font,
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: PANEL.accent,
}

const statusResolvedStyle: CSSProperties = {
  color: PANEL.muted,
}

const bodyStyle: CSSProperties = {
  margin: '0 0 8px',
  font: PANEL.fontSans,
  fontSize: 12,
  lineHeight: 1.45,
  color: PANEL.fg,
}

const metaStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 4,
  font: PANEL.font,
  fontSize: 10,
  color: PANEL.muted,
}

const linearLinkStyle: CSSProperties = {
  color: PANEL.accentDense,
  fontWeight: 600,
  textDecoration: 'none',
}

const notLinkedStyle: CSSProperties = {
  fontStyle: 'italic',
}

const actionsStyle: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  justifyContent: 'flex-end',
}

const resolveBtnStyle: CSSProperties = {
  border: `1px solid ${PANEL.borderStrong}`,
  background: PANEL.surface,
  color: PANEL.accentDense,
  borderRadius: 4,
  padding: '3px 8px',
  font: PANEL.font,
  cursor: 'pointer',
}

const deleteBtnStyle: CSSProperties = {
  ...resolveBtnStyle,
  color: PANEL.error,
  borderColor: PANEL.border,
}

const linearDeletedStyle: CSSProperties = {
  color: PANEL.error,
  fontWeight: 600,
  textDecoration: 'line-through',
}
