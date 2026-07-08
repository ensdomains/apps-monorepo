/**
 * DQA controls for the unified DevDrawer. Loads overlay.js in embed mode and
 * drives auth / comment mode via `window.__DQA__`. Pins, cursors, and popovers
 * remain in the overlay script's full-viewport shadow root.
 */

import { type CSSProperties, useState } from 'react'
import {
  DqaCommentFilters,
  type CommentFilter,
  type CommentOwnership,
} from './panel/DqaCommentFilters'
import { DqaCommentList } from './panel/DqaCommentList'
import { DqaPreviewBanner } from './panel/DqaPreviewBanner'
import { DqaToolbar } from './panel/DqaToolbar'
import { PANEL } from './panel/panelTheme'
import { useDqaPanel } from './panel/useDqaPanel'
import { toggleDqaTheme } from './theme'

export function DqaPanelContent() {
  const { state, api, loadError, isMockMode } = useDqaPanel()
  const [filter, setFilter] = useState<CommentFilter>('open')
  const [ownership, setOwnership] = useState<CommentOwnership>('all')
  const [devName, setDevName] = useState('')

  if (!state.ready || state.loading) {
    return <p style={mutedStyle}>Loading DQA…</p>
  }

  const showSignIn = !state.authenticated && !isMockMode
  const showToolbar = state.authenticated || isMockMode
  const canInteract = !!(api && (state.authenticated || isMockMode))

  const handleFocus = (id: string) => {
    api?.focusComment(id)
  }

  // Ownership filter: "Mine" narrows to comments authored by the signed-in
  // reviewer (matched on the session user id).
  const visibleComments =
    ownership === 'mine' && state.user
      ? state.comments.filter((c) => c.authorId === state.user?.id)
      : state.comments

  return (
    <div style={rootStyle}>
      {showSignIn && (
        <div style={signInSectionStyle}>
          <div style={signInRowStyle}>
            {state.authConfig?.oauthConfigured && (
              <>
                <button
                  onClick={() => api?.startLinearLogin()}
                  style={primaryBtnStyle}
                  type="button"
                >
                  Sign in with Linear
                </button>
                <button
                  onClick={() => api?.switchLinearAccount()}
                  style={secondaryBtnStyle}
                  title="Log out of Linear and sign in with a different account"
                  type="button"
                >
                  Use different account
                </button>
              </>
            )}
            {state.authConfig?.devAllowed && (
              <>
                <input
                  onChange={(event) => setDevName(event.target.value)}
                  placeholder="Your name"
                  style={inputStyle}
                  value={devName}
                />
                <button
                  onClick={() => void api?.devLogin(devName || 'Dev')}
                  style={secondaryBtnStyle}
                  type="button"
                >
                  Dev mode
                </button>
              </>
            )}
          </div>
          {state.signInError && (
            <p style={errorBlockStyle}>{state.signInError}</p>
          )}
        </div>
      )}

      {loadError && (
        <p style={warnStyle}>
          DQA server unavailable — {loadError}. Start the dqa service on port
          4000 and hard-refresh.
        </p>
      )}

      {isMockMode && <DqaPreviewBanner message="Mock UI — sample data" />}

      {showToolbar && (
        <DqaToolbar
          onSignOut={() => void api?.signOut()}
          onToggleCommentMode={() =>
            api?.setCommentMode(!state.commentMode)
          }
          onToggleTheme={() => toggleDqaTheme()}
          showCommentMode={canInteract}
          state={state}
        />
      )}

      <DqaCommentFilters
        comments={visibleComments}
        filter={filter}
        onFilterChange={setFilter}
        onOwnershipChange={state.user ? setOwnership : undefined}
        onToggleResolvedPins={
          api?.setShowResolved
            ? () => api.setShowResolved?.(!state.showResolved)
            : undefined
        }
        ownership={ownership}
        showResolvedPins={state.showResolved ?? false}
      />

      <DqaCommentList
        activeCommentId={state.activeCommentId}
        comments={visibleComments}
        filter={filter}
        onFocus={handleFocus}
        onResolve={
          canInteract && api?.resolveComment
            ? (id) => void api.resolveComment?.(id)
            : undefined
        }
        onDelete={
          canInteract && api?.deleteComment
            ? (id) => {
                if (window.confirm('Delete this DQA comment? (does not touch Linear)')) {
                  void api.deleteComment?.(id)
                }
              }
            : undefined
        }
        showFocusAction={canInteract}
      />
    </div>
  )
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
}

const signInSectionStyle: CSSProperties = {
  marginBottom: 12,
  paddingBottom: 10,
  borderBottom: `1px solid ${PANEL.border}`,
}

const signInRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
}

const mutedStyle: CSSProperties = {
  margin: 0,
  color: PANEL.muted,
  font: PANEL.font,
}

const warnStyle: CSSProperties = {
  ...mutedStyle,
  color: PANEL.error,
  marginBottom: 8,
  maxWidth: 520,
}

const errorBlockStyle: CSSProperties = {
  margin: '8px 0 0',
  color: PANEL.error,
  font: PANEL.fontSans,
  fontSize: 12,
  lineHeight: 1.4,
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

const secondaryBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  border: `1px solid ${PANEL.border}`,
  background: PANEL.surface,
  color: PANEL.accentDense,
}

const inputStyle: CSSProperties = {
  background: PANEL.surface,
  border: `1px solid ${PANEL.border}`,
  borderRadius: 4,
  color: PANEL.fg,
  font: PANEL.font,
  padding: '4px 8px',
  width: 100,
}
