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
                <p style={ttLabelStyle}>⏱ Time Travel</p>
                <TimeTravelPanelContent />
              </section>
            )}
            {travelEnabled && migrationEnabled && <div style={dividerStyle} />}
            {migrationEnabled && (
              <section style={sectionStyle}>
                <p style={migLabelStyle}>↑ Migration</p>
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

const FONT = '11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace'
const BG = 'rgba(17, 24, 39, 0.72)'
const BORDER = '1px solid rgba(255,255,255,0.09)'
const BLUR = 'blur(14px) saturate(140%)'
const Z = 2_147_483_000

const containerStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: Z,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
}

const handleStyle: CSSProperties = {
  alignSelf: 'center',
  padding: '4px 14px',
  background: BG,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  color: '#9ca3af',
  font: '11px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
  border: BORDER,
  borderBottom: 'none',
  borderRadius: '7px 7px 0 0',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  letterSpacing: '0.03em',
}

const panelStyle: CSSProperties = {
  background: BG,
  backdropFilter: BLUR,
  WebkitBackdropFilter: BLUR,
  border: BORDER,
  borderBottom: 'none',
  borderTop: BORDER,
  color: '#e5e7eb',
  font: FONT,
  boxShadow: '0 -4px 24px rgba(0,0,0,0.25)',
  width: '100%',
}

const toolsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '5px 24px 6px',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const dividerStyle: CSSProperties = {
  width: 1,
  background: 'rgba(255,255,255,0.08)',
  margin: '0 12px',
  alignSelf: 'stretch',
  flexShrink: 0,
}

const baseLabelStyle: CSSProperties = {
  margin: '0 0 4px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  paddingLeft: 6,
  borderRadius: '3px 3px 0 0',
}

const ttLabelStyle: CSSProperties = {
  ...baseLabelStyle,
  color: '#7dd3fc',
  borderLeft: '2px solid #38bdf8',
}

const migLabelStyle: CSSProperties = {
  ...baseLabelStyle,
  color: '#fbbf24',
  borderLeft: '2px solid #f59e0b',
}
