/**
 * DEV-only bottom drawer that surfaces all dev tools in one unobtrusive place.
 *
 * Stays collapsed as a thin tab at the bottom centre of the screen (out of the
 * way of any app UI). Click to expand: both Time Travel and Migration Tool
 * panels appear side-by-side above the tab. Each tool section only renders
 * when its flag is enabled, so the drawer itself hides completely if neither
 * is on.
 *
 * Inline CSSProperties (no Tailwind) — same rationale as the individual
 * panels: this package is consumed by multiple host apps whose Tailwind
 * source-scanning never covers node_modules.
 */

import {
  isMigrationToolEnabled,
  MigrationPanelContent,
} from '@ens-apps/dev-migration-tool'
import {
  isTimeTravelEnabled,
  TimeTravelPanelContent,
} from '@ens-apps/dev-time-travel'
import { type CSSProperties, useState } from 'react'

export function DevDrawer() {
  const [open, setOpen] = useState(false)
  const travelEnabled = isTimeTravelEnabled()
  const migrationEnabled = isMigrationToolEnabled()

  if (!travelEnabled && !migrationEnabled) return null

  return (
    <div style={containerStyle}>
      {open && (
        <div style={panelStyle}>
          <div style={toolsRowStyle}>
            {travelEnabled && (
              <section style={sectionStyle}>
                <p style={sectionTitleStyle}>{'⏱'} Time Travel</p>
                <TimeTravelPanelContent />
              </section>
            )}
            {travelEnabled && migrationEnabled && <div style={dividerStyle} />}
            {migrationEnabled && (
              <section style={sectionStyle}>
                <p style={sectionTitleStyle}>{'↑'} Migration Tool</p>
                <MigrationPanelContent />
              </section>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={handleStyle}
        title={open ? 'Close dev tools' : 'Open dev tools'}
      >
        {open ? '▼' : '▲'} Dev Tools
        {travelEnabled ? ' ⏱' : ''}
        {migrationEnabled ? ' ↑' : ''}
      </button>
    </div>
  )
}

// --- styles -----------------------------------------------------------------

const FONT = '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace'
const BG = 'rgba(17, 24, 39, 0.97)'
const BORDER = '1px solid rgba(255,255,255,0.09)'
const Z = 2_147_483_000

const containerStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: Z,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const handleStyle: CSSProperties = {
  padding: '5px 16px',
  background: BG,
  color: '#9ca3af',
  font: '11px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
  border: BORDER,
  borderBottom: 'none',
  borderRadius: '8px 8px 0 0',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  letterSpacing: '0.03em',
}

const panelStyle: CSSProperties = {
  background: BG,
  border: BORDER,
  borderBottom: 'none',
  borderRadius: '12px 12px 0 0',
  color: '#e5e7eb',
  font: FONT,
  boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
  maxHeight: '80vh',
  overflowY: 'auto',
  width: 'max-content',
  maxWidth: '95vw',
}

const toolsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '14px 16px 16px',
  alignItems: 'flex-start',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 248,
  maxWidth: 300,
}

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 10px',
  fontWeight: 600,
  paddingBottom: 7,
  borderBottom: '1px solid rgba(255,255,255,0.10)',
  color: '#e5e7eb',
}

const dividerStyle: CSSProperties = {
  width: 1,
  background: 'rgba(255,255,255,0.08)',
  margin: '0 16px',
  alignSelf: 'stretch',
  flexShrink: 0,
}
