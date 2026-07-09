import { type CSSProperties } from 'react'
import type { DqaState } from '../types'
import { linearIssueUrl } from './linearUrl'
import { PANEL } from './panelTheme'

const MAX_VISIBLE_AVATARS = 5

type DqaToolbarProps = {
  readonly state: DqaState
  readonly onToggleCommentMode: () => void
  readonly onSignOut: () => void
  readonly onToggleTheme?: () => void
  readonly onToggleHighlightAll?: () => void
  readonly showCommentMode?: boolean
}

export function DqaToolbar({
  state,
  onToggleCommentMode,
  onSignOut,
  onToggleTheme,
  onToggleHighlightAll,
  showCommentMode = true,
}: DqaToolbarProps) {
  const { user, commentMode, presence, pageIssueRef, theme, outlineAll } = state
  const visible = presence.slice(0, MAX_VISIBLE_AVATARS)
  const overflow = presence.length - visible.length
  const pageLinearUrl = pageIssueRef ? linearIssueUrl(pageIssueRef) : null

  return (
    <div style={toolbarStyle}>
      <div style={leftStyle}>
        {showCommentMode && (
          <button
            onClick={onToggleCommentMode}
            style={commentMode ? activeBtnStyle : primaryBtnStyle}
            type="button"
          >
            {commentMode ? 'Pick an element' : 'Inspect'}
          </button>
        )}

        {showCommentMode && onToggleHighlightAll && (
          <button
            onClick={onToggleHighlightAll}
            style={outlineAll ? activeBtnStyle : secondaryBtnStyle}
            title="Outline every commentable element on the page — click one to comment (helps find hard-to-hover elements)"
            type="button"
          >
            {outlineAll ? 'Hide outlines' : 'Highlight all'}
          </button>
        )}

        {presence.length > 0 && (
          <div style={presenceGroupStyle}>
            <div style={presenceStyle} title={presence.map((p) => p.name).join(', ')}>
              {visible.map((peer) => (
                <span
                  key={peer.id}
                  style={{
                    ...avatarStyle,
                    background: peer.color ?? PANEL.accent,
                  }}
                  title={peer.name}
                >
                  {(peer.name || '?').slice(0, 1).toUpperCase()}
                </span>
              ))}
              {overflow > 0 && <span style={overflowStyle}>+{overflow}</span>}
            </div>
            <span style={viewingStyle}>
              {presence.length} viewing
            </span>
          </div>
        )}
      </div>

      <div style={rightStyle}>
        {pageIssueRef && pageLinearUrl && (
          <a
            href={pageLinearUrl}
            rel="noopener noreferrer"
            style={pageIssueStyle}
            target="_blank"
            title={`Open ${pageIssueRef} in Linear`}
          >
            {pageIssueRef} ↗
          </a>
        )}
        {user && <span style={userStyle}>{user.name}</span>}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            style={secondaryBtnStyle}
            title={`Overlay theme: ${theme ?? 'dark'} — click to switch`}
            type="button"
          >
            {(theme ?? 'dark') === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>
        )}
        <button onClick={onSignOut} style={secondaryBtnStyle} type="button">
          Sign out
        </button>
      </div>
    </div>
  )
}

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 12,
  paddingBottom: 10,
  borderBottom: `1px solid ${PANEL.border}`,
}

const leftStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
}

const rightStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
}

const baseBtnStyle: CSSProperties = {
  borderRadius: 4,
  padding: '4px 10px',
  font: PANEL.font,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const primaryBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  border: `1px solid ${PANEL.accent}`,
  background: PANEL.accent,
  color: PANEL.onAccent,
}

const activeBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  border: `1px solid ${PANEL.accentDense}`,
  background: PANEL.accentDense,
  color: PANEL.onAccent,
}

const secondaryBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  border: `1px solid ${PANEL.border}`,
  background: PANEL.surface,
  color: PANEL.accentDense,
}

const presenceGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const presenceStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
}

const avatarStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  marginLeft: -4,
  borderRadius: '50%',
  border: `2px solid ${PANEL.bg}`,
  color: '#fff',
  fontSize: 10,
  fontWeight: 700,
}

const overflowStyle: CSSProperties = {
  marginLeft: 4,
  font: PANEL.font,
  fontSize: 10,
  color: PANEL.muted,
}

const viewingStyle: CSSProperties = {
  font: PANEL.font,
  fontSize: 10,
  color: PANEL.muted,
}

const pageIssueStyle: CSSProperties = {
  font: PANEL.font,
  fontSize: 10,
  fontWeight: 600,
  color: PANEL.accentDense,
  textDecoration: 'none',
  padding: '3px 6px',
  borderRadius: 4,
  border: `1px solid ${PANEL.borderStrong}`,
  background: PANEL.accentBg,
}

const userStyle: CSSProperties = {
  color: PANEL.accentDense,
  font: PANEL.font,
  fontWeight: 600,
}
