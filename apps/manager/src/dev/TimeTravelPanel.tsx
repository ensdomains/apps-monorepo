/**
 * DEV-only floating panel for manual time travel against the local Anvil fork.
 *
 * Advances chain time (`evm_increaseTime` + `evm_mine`) AND the browser clock
 * (via the installed chain clock) together, then reloads so cached on-chain
 * reads (e.g. premium price from `getRegisterPrice`) refetch. Rendered only
 * when `isTimeTravelEnabled()` — see `routes/__root.tsx`.
 */
import {
  getBlockTimestampMs,
  increaseTime,
} from '@ens-apps/utils/time-travel/anvilTime'
import { getChainClock } from '@ens-apps/utils/time-travel/installChainClock'
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { TIME_TRAVEL_RPC } from './timeTravel'

const HOUR = 3600
const DAY = 86_400
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

const POSITION_STORAGE_KEY = 'ens:time-travel:pos'

type Pos = { left: number; top: number }

// --- pure helpers ----------------------------------------------------------

function formatDateTime(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  // Explicit-arg `new Date(ms)` is NOT shifted by the chain clock, so this
  // shows the true absolute instant for the given epoch ms.
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

function formatOffset(ms: number): string {
  if (!ms) return 'real time (no offset)'
  const sign = ms > 0 ? '+' : '−'
  let rem = Math.floor(Math.abs(ms) / 1000)
  const days = Math.floor(rem / DAY)
  rem -= days * DAY
  const hours = Math.floor(rem / HOUR)
  rem -= hours * HOUR
  const mins = Math.floor(rem / 60)
  const parts = [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    mins && !days ? `${mins}m` : '',
  ].filter(Boolean)
  return `${sign}${parts.join(' ') || '0m'}`
}

function readStoredPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Pos>
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      return { left: parsed.left, top: parsed.top }
    }
    return null
  } catch {
    return null
  }
}

/** Keep the panel within the viewport (with a small margin). */
function clampPos(pos: Pos, el: HTMLElement | null): Pos {
  if (typeof window === 'undefined') return pos
  const width = el?.offsetWidth ?? 248
  const height = el?.offsetHeight ?? 220
  const maxLeft = Math.max(4, window.innerWidth - width - 4)
  const maxTop = Math.max(4, window.innerHeight - height - 4)
  return {
    left: Math.min(Math.max(4, pos.left), maxLeft),
    top: Math.min(Math.max(4, pos.top), maxTop),
  }
}

// --- hooks (no naked useEffect in the component) ---------------------------

/** Reactive warped `Date.now()` (what the app sees), updated every second. */
function useWarpedNow(intervalMs = 1000): number {
  const [nowMs, setNowMs] = useState<number>(() =>
    typeof window === 'undefined' ? 0 : Date.now(),
  )
  useEffect(() => {
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return nowMs
}

/** Poll the Anvil block timestamp (ms) on mount and every 5s. */
function useAnvilBlockMs(endpoint: string): {
  blockMs: number | null
  error: string | null
} {
  const [blockMs, setBlockMs] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const ms = await getBlockTimestampMs(endpoint)
        if (!active) return
        setBlockMs(ms)
        setError(null)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e))
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [endpoint])
  return { blockMs, error }
}

/** On first ever run (no stored offset), align the browser clock to chain. */
function useFirstRunChainSync(endpoint: string): void {
  useEffect(() => {
    const clock = getChainClock()
    if (!clock || clock.hasStoredOffset()) return
    clock.syncFromChain(endpoint).catch(() => {})
  }, [endpoint])
}

/**
 * Make the panel draggable by a handle. Position persists in localStorage so
 * it survives the reload that each time warp triggers. Returns a node-ref
 * setter (for viewport clamping), drag handlers for the handle, and a position
 * style to merge onto the panel (empty → default corner via the base style).
 */
function useDraggablePanel(): {
  setNodeRef: (el: HTMLElement | null) => void
  dragHandlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: () => void
    onPointerCancel: () => void
  }
  positionStyle: CSSProperties
} {
  const nodeRef = useRef<HTMLElement | null>(null)
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  const setNodeRef = useCallback((el: HTMLElement | null) => {
    nodeRef.current = el
  }, [])

  useEffect(() => {
    const stored = readStoredPos()
    if (stored) setPos(clampPos(stored, nodeRef.current))
  }, [])

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const el = nodeRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const offset = dragOffset.current
    if (!offset) return
    setPos(
      clampPos(
        { left: e.clientX - offset.dx, top: e.clientY - offset.dy },
        nodeRef.current,
      ),
    )
  }, [])

  const stopDrag = useCallback(() => {
    if (!dragOffset.current) return
    dragOffset.current = null
    setPos((current) => {
      if (current) {
        try {
          localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(current))
        } catch {
          // ignore (storage disabled)
        }
      }
      return current
    })
  }, [])

  const positionStyle: CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
    : {}

  return {
    setNodeRef,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stopDrag,
      onPointerCancel: stopDrag,
    },
    positionStyle,
  }
}

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
        onClick={() => setCollapsed(false)}
        ref={setNodeRef}
        style={{ ...collapsedStyle, ...positionStyle }}
        title="Open Time Travel panel"
        type="button"
      >
        ⏱ {formatOffset(offsetMs)}
      </button>
    )
  }

  return (
    <div ref={setNodeRef} style={{ ...panelStyle, ...positionStyle }}>
      <div
        style={{ ...headerStyle, cursor: 'move', touchAction: 'none' }}
        {...dragHandlers}
      >
        <span style={{ fontWeight: 600 }}>⏱ Time Travel (dev)</span>
        <button
          onClick={() => setCollapsed(true)}
          onPointerDown={(e) => e.stopPropagation()}
          style={iconButtonStyle}
          title="Collapse"
          type="button"
        >
          ✕
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
            disabled={busy}
            key={step.label}
            onClick={() => advanceSeconds(step.seconds)}
            style={stepButtonStyle(busy)}
            type="button"
          >
            {step.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          aria-label="Days to advance"
          disabled={busy}
          min="0"
          onChange={(e) => setCustomDays(e.target.value)}
          step="0.5"
          style={inputStyle}
          type="number"
          value={customDays}
        />
        <button
          disabled={busy}
          onClick={advanceCustom}
          style={stepButtonStyle(busy)}
          type="button"
        >
          Advance days
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button
          disabled={busy}
          onClick={syncToChain}
          style={secondaryButtonStyle(busy)}
          title="Set the browser clock to the current Anvil block time"
          type="button"
        >
          Sync to chain
        </button>
        <button
          disabled={busy}
          onClick={resetToRealTime}
          style={secondaryButtonStyle(busy)}
          title="Clear the offset — browser clock returns to real time"
          type="button"
        >
          Real time
        </button>
      </div>

      <button
        disabled={busy}
        onClick={skipCommitWait}
        style={{ ...stepButtonStyle(busy), width: '100%', marginTop: 8 }}
        title="Advance ~70s (MIN_COMMITMENT_AGE) so a registration's commitment cooldown completes — no reload, keeps the in-progress flow"
        type="button"
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

// --- styles ----------------------------------------------------------------

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
