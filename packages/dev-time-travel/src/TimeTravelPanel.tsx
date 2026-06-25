/**
 * DEV-only floating panel for manual time travel against the local Anvil fork.
 *
 * Advances chain time (`evm_increaseTime` + `evm_mine`) AND the browser clock
 * (via the installed chain clock) together, then reloads so cached on-chain
 * reads (e.g. premium price from `getRegisterPrice`) refetch. Rendered only
 * when `isTimeTravelEnabled()` — mounted by each app's root route.
 */

import {
  increaseTime,
} from '@ens-apps/utils/time-travel/anvilTime'
import { getChainClock } from '@ens-apps/utils/time-travel/installChainClock'
import { type CSSProperties, useCallback, useState } from 'react'
import { TIME_TRAVEL_RPC } from './config'
import { DAY, HOUR, formatDateTime, formatOffset } from './TimeTravelPanel.helpers'
import {
  useAnvilBlockMs,
  useDraggablePanel,
  useFirstRunChainSync,
  useWarpedNow,
} from './TimeTravelPanel.hooks'

const STEPS: { label: string; seconds: number }[] = [
  { label: '+1h', seconds: HOUR },
  { label: '+1d', seconds: DAY },
  { label: '+7d', seconds: 7 * DAY },
  { label: '+30d', seconds: 30 * DAY },
  { label: '+90d', seconds: 90 * DAY },
  { label: '+1y', seconds: 365 * DAY },
]

/** MIN_COMMITMENT_AGE (60s on the v2 ETHRegistrar) + a small buffer. */
const COMMIT_SKIP_SECONDS = 70

// --- component -------------------------------------------------------------

export function TimeTravelPanel() {
  const endpoint = TIME_TRAVEL_RPC
  const warpedNow = useWarpedNow()
  const { blockMs, error: blockError } = useAnvilBlockMs(endpoint)
  useFirstRunChainSync(endpoint)
  const { setNodeRef, dragHandlers, positionStyle } = useDraggablePanel()

  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [customDays, setCustomDays] = useState('30')

  const offsetMs = getChainClock()?.getOffsetMs() ?? 0

  const runAndReload = useCallback(async (op: () => Promise<void>) => {
    setBusy(true)
    setActionError(null)
    try {
      await op()
      window.location.reload()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }, [])

  const advanceSeconds = useCallback(
    (seconds: number) =>
      runAndReload(async () => {
        await increaseTime(seconds, endpoint)
        await getChainClock()?.syncFromChain(endpoint)
      }),
    [endpoint, runAndReload],
  )

  const syncToChain = useCallback(
    () =>
      runAndReload(async () => {
        await getChainClock()?.syncFromChain(endpoint)
      }),
    [endpoint, runAndReload],
  )

  const resetToRealTime = useCallback(
    () =>
      runAndReload(async () => {
        getChainClock()?.clearOffset()
      }),
    [runAndReload],
  )

  const advanceCustom = useCallback(() => {
    const days = Number.parseFloat(customDays)
    if (!Number.isFinite(days) || days <= 0) {
      setActionError('Enter a positive number of days')
      return
    }
    advanceSeconds(Math.round(days * DAY))
  }, [customDays, advanceSeconds])

  // Advance past the registration commitment cooldown WITHOUT reloading, so the
  // in-progress registration flow survives. Advancing the chain makes the
  // subsequent on-chain `register` valid; the Date.now() jump (syncFromChain)
  // releases the commitment cooldown (which polls the clock) and zeroes its
  // on-screen countdown.
  const skipCommitWait = useCallback(async () => {
    setBusy(true)
    setActionError(null)
    try {
      await increaseTime(COMMIT_SKIP_SECONDS, endpoint)
      await getChainClock()?.syncFromChain(endpoint)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [endpoint])

  const error = actionError ?? blockError

  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => setCollapsed(false)}
        style={{ ...collapsedStyle, ...positionStyle }}
        title="Open Time Travel panel"
      >
        {'⏱'} {formatOffset(offsetMs)}
      </button>
    )
  }

  return (
    <div ref={setNodeRef} style={{ ...panelStyle, ...positionStyle }}>
      <div
        style={{ ...headerStyle, cursor: 'move', touchAction: 'none' }}
        {...dragHandlers}
      >
        <span style={{ fontWeight: 600 }}>{'⏱'} Time Travel (dev)</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          onPointerDown={(e) => e.stopPropagation()}
          style={iconButtonStyle}
          title="Collapse"
        >
          {'✕'}
        </button>
      </div>

      <dl style={rowsStyle}>
        <dt style={dtStyle}>App clock</dt>
        <dd style={ddStyle}>{formatDateTime(warpedNow || null)}</dd>
        <dt style={dtStyle}>Anvil block</dt>
        <dd style={ddStyle}>{formatDateTime(blockMs)}</dd>
        <dt style={dtStyle}>Offset</dt>
        <dd style={ddStyle}>{formatOffset(offsetMs)}</dd>
      </dl>

      <div style={gridStyle}>
        {STEPS.map((step) => (
          <button
            key={step.label}
            type="button"
            disabled={busy}
            onClick={() => advanceSeconds(step.seconds)}
            style={stepButtonStyle(busy)}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          type="number"
          min="0"
          step="0.5"
          value={customDays}
          onChange={(e) => setCustomDays(e.target.value)}
          disabled={busy}
          style={inputStyle}
          aria-label="Days to advance"
        />
        <button
          type="button"
          disabled={busy}
          onClick={advanceCustom}
          style={stepButtonStyle(busy)}
        >
          Advance days
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          type="button"
          disabled={busy}
          onClick={syncToChain}
          style={secondaryButtonStyle(busy)}
          title="Set the browser clock to the current Anvil block time"
        >
          Sync to chain
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={resetToRealTime}
          style={secondaryButtonStyle(busy)}
          title="Clear the offset — browser clock returns to real time"
        >
          Real time
        </button>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={skipCommitWait}
        style={{ ...stepButtonStyle(busy), width: '100%', marginTop: 8 }}
        title="Advance ~70s (MIN_COMMITMENT_AGE) so a registration's commitment cooldown completes — no reload, keeps the in-progress flow"
      >
        Skip commit wait (+{COMMIT_SKIP_SECONDS}s)
      </button>

      {error ? <p style={errorStyle}>{error}</p> : null}
      <p style={hintStyle}>
        Advancing warps Anvil + the browser clock, then reloads. Drag the title
        bar to move this panel.
      </p>
    </div>
  )
}

// --- styles -----------------------------------------------------------------
//
// Inline CSSProperties instead of Tailwind (a deliberate styleguide exception).
// This is a self-contained dev widget injected into multiple apps; it must not
// depend on any host app's Tailwind setup. Both consumers are on Tailwind v4,
// whose source detection scans each app's own directory and skips node_modules,
// so utility classes from this workspace package would never be generated unless
// every consumer added an explicit `@source` for it. Inline styles guarantee the
// panel looks identical in any host. DEV-only.

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  left: 12,
  zIndex: 2_147_483_000,
  width: 248,
  padding: 12,
  borderRadius: 10,
  background: 'rgba(17, 24, 39, 0.96)',
  color: '#e5e7eb',
  font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
  boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
  border: '1px solid rgba(255,255,255,0.08)',
}

const collapsedStyle: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  left: 12,
  zIndex: 2_147_483_000,
  padding: '6px 10px',
  borderRadius: 8,
  background: 'rgba(17, 24, 39, 0.96)',
  color: '#e5e7eb',
  font: '12px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
  border: '1px solid rgba(255,255,255,0.08)',
  cursor: 'pointer',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
}

const iconButtonStyle: CSSProperties = {
  padding: '2px 6px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'transparent',
  color: '#e5e7eb',
  cursor: 'pointer',
}

const rowsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: 8,
  rowGap: 2,
  margin: '0 0 8px',
}

const dtStyle: CSSProperties = { color: '#9ca3af' }
const ddStyle: CSSProperties = { margin: 0, textAlign: 'right' }

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
}

function stepButtonStyle(disabled: boolean): CSSProperties {
  return {
    padding: '6px 0',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: disabled ? 'rgba(75,85,99,0.5)' : '#2563eb',
    color: '#fff',
    cursor: disabled ? 'default' : 'pointer',
  }
}

function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 0',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'transparent',
    color: '#e5e7eb',
    cursor: disabled ? 'default' : 'pointer',
  }
}

const inputStyle: CSSProperties = {
  width: 72,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(0,0,0,0.25)',
  color: '#e5e7eb',
}

const errorStyle: CSSProperties = {
  margin: '8px 0 0',
  color: '#fca5a5',
  wordBreak: 'break-word',
}

const hintStyle: CSSProperties = {
  margin: '8px 0 0',
  color: '#6b7280',
}
