/**
 * Unified dev/QA tooling — TanStack-style floating trigger beside the router
 * devtools, with a tabbed bottom sheet: one tab per enabled tool (Time Travel,
 * Migration, Design QA, …). Add future tools by pushing another entry into the
 * `tabs` array. The active tab persists across reloads; the sheet can be
 * expanded for tools that need more room.
 */

import {
  DqaPanelContent,
  getDqaTheme,
  isDQAEnabled,
  loadDqaOverlay,
  subscribeDqaTheme,
} from '@ens-apps/dev-dqa-overlay'
import {
  isMigrationToolEnabled,
  MigrationPanelContent,
} from '@ens-apps/dev-migration-tool'
import {
  isTimeTravelEnabled,
  TimeTravelPanelContent,
} from '@ens-apps/dev-time-travel'
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { isDevDrawerEnabled } from './config'
import { DRAWER, DRAWER_THEME_VARS } from './drawerTheme'

const TANSTACK_DEVTOOLS_OFFSET = 168 - 10

const ACTIVE_TAB_KEY = 'ens-devtools:active-tab'

type ToolTab = {
  readonly key: string
  readonly label: string
  readonly accent: string
  readonly content: ReactNode
}

export function DevDrawer() {
  if (!isDevDrawerEnabled()) return null
  return <DevDrawerInner />
}

function DevDrawerInner() {
  // Two-phase mount for the slide animation: `rendered` mounts the sheet,
  // `shown` (set a frame later) slides it in; closing reverses and unmounts
  // on transitionend.
  const [rendered, setRendered] = useState(false)
  const [shown, setShown] = useState(false)
  const [settled, setSettled] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Drawer-wide theme (dark default) — shared with the DQA overlay/panel via
  // localStorage `dqa_theme`; the DQA toolbar toggle updates it live.
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getDqaTheme())

  useEffect(() => subscribeDqaTheme(setTheme), [])
  const [activeKey, setActiveKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(ACTIVE_TAB_KEY)
    } catch {
      return null
    }
  })
  const travelEnabled = isTimeTravelEnabled()
  const migrationEnabled = isMigrationToolEnabled()
  const dqaEnabled = isDQAEnabled()

  useEffect(() => {
    if (dqaEnabled) void loadDqaOverlay()
  }, [dqaEnabled])

  // Close the drawer when DQA comment mode turns on so the reviewer sees the
  // full page while picking an element (only reacts to the transition).
  useEffect(() => {
    if (!dqaEnabled || !rendered) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    void loadDqaOverlay()
      .then((api) => {
        if (cancelled) return
        let prev = api.getState().commentMode
        unsubscribe = api.subscribe((state) => {
          if (state.commentMode && !prev) setShown(false)
          prev = state.commentMode
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [dqaEnabled, rendered])

  useEffect(() => {
    if (!rendered) {
      setSettled(false)
      return
    }
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setShown(true)),
    )
    return () => cancelAnimationFrame(id)
  }, [rendered])

  useEffect(() => {
    if (!shown) setSettled(false)
  }, [shown])

  // Reserve scroll room for the open sheet (like TanStack devtools): pad the
  // body by the panel's measured height so it never covers page content, and
  // restore on close. ResizeObserver keeps it in sync with expand/viewport.
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!rendered) return
    const panel = panelRef.current
    if (!panel) return
    const body = document.body
    const previousPadding = body.style.paddingBottom
    const apply = () => {
      body.style.paddingBottom = `${panel.getBoundingClientRect().height}px`
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(panel)
    return () => {
      observer.disconnect()
      body.style.paddingBottom = previousPadding
    }
  }, [rendered])

  const tabs: ToolTab[] = []

  if (travelEnabled) {
    tabs.push({
      key: 'time-travel',
      label: 'Time travel',
      accent: DRAWER.accent,
      content: <TimeTravelPanelContent />,
    })
  }

  if (migrationEnabled) {
    tabs.push({
      key: 'migration',
      label: 'Migration',
      accent: '#e7a259',
      content: <MigrationPanelContent />,
    })
  }

  if (dqaEnabled) {
    tabs.push({
      key: 'dqa',
      label: 'Design QA',
      accent: '#b34ad7',
      content: <DqaPanelContent />,
    })
  }

  const fallbackTab = tabs[0]
  if (!fallbackTab) return null

  const active = tabs.find((tab) => tab.key === activeKey) ?? fallbackTab

  const selectTab = (key: string) => {
    setActiveKey(key)
    try {
      window.localStorage.setItem(ACTIVE_TAB_KEY, key)
    } catch {}
  }

  return (
    <>
      {rendered && (
        <div
          data-dqa-ignore=""
          ref={panelRef}
          onTransitionEnd={(event) => {
            if (event.propertyName !== 'transform') return
            if (!shown) setRendered(false)
            else setSettled(true)
          }}
          style={{
            ...panelStyle,
            ...DRAWER_THEME_VARS[theme],
            height: expanded ? '85vh' : PANEL_HEIGHT,
            // `none` once settled: a lingering transform forces subpixel
            // compositing that renders text blurry.
            transform: shown
              ? settled
                ? 'none'
                : 'translateY(0)'
              : 'translateY(100%)',
          }}
          role="region"
          aria-label="ENS dev tools"
        >
          <div style={panelHeaderStyle}>
            <div style={panelBrandStyle}>
              <span style={panelBrandMarkStyle}>ENS</span>
              <span style={panelBrandTitleStyle}>Dev tools</span>
            </div>
            <div style={tabsRowStyle} role="tablist" aria-label="Dev tools">
              {tabs.map((tab) => {
                const isActive = tab.key === active.key
                return (
                  <button
                    aria-selected={isActive}
                    key={tab.key}
                    onClick={() => selectTab(tab.key)}
                    role="tab"
                    style={{
                      ...tabStyle,
                      ...(isActive
                        ? {
                            background: DRAWER.accentBg,
                            borderColor: tab.accent,
                            color: DRAWER.accentDense,
                          }
                        : undefined),
                    }}
                    type="button"
                  >
                    <span
                      aria-hidden
                      style={{ ...tabDotStyle, background: tab.accent }}
                    />
                    {tab.label}
                  </button>
                )
              })}
            </div>
            <div style={headerActionsStyle}>
              <button
                aria-label={expanded ? 'Shrink dev tools' : 'Expand dev tools'}
                onClick={() => setExpanded((value) => !value)}
                style={headerBtnStyle}
                title={expanded ? 'Shrink' : 'Expand'}
                type="button"
              >
                {expanded ? '⌄' : '⌃'}
              </button>
              <button
                aria-label="Close dev tools"
                onClick={() => setShown(false)}
                style={headerBtnStyle}
                type="button"
              >
                ✕
              </button>
            </div>
          </div>
          <div style={tabContentStyle} role="tabpanel">
            {active.content}
          </div>
        </div>
      )}

      {!rendered && (
        <button
          aria-expanded={rendered}
          aria-label="Open ENS dev tools"
          data-dqa-ignore=""
          onClick={() => setRendered(true)}
          style={{ ...toggleStyle, ...DRAWER_THEME_VARS[theme] }}
          type="button"
        >
          <span style={toggleMarkStyle}>ENS</span>
          <span style={toggleLabelStyle}>Dev tools</span>
          <span style={toggleDotsStyle}>
            {tabs.map((tab) => (
              <span
                key={tab.key}
                style={{ ...statusDotStyle, background: tab.accent }}
              />
            ))}
          </span>
        </button>
      )}
    </>
  )
}

const Z_PANEL = 2_147_483_640
const Z_TOGGLE = 2_147_483_645

const PANEL_HEIGHT = 'min(52vh, 520px)'

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: Z_PANEL,
  display: 'flex',
  flexDirection: 'column',
  background: DRAWER.bg,
  color: DRAWER.fg,
  font: DRAWER.font,
  borderTop: `1px solid ${DRAWER.borderStrong}`,
  boxShadow: '0 -8px 32px rgba(9, 60, 82, 0.14)',
  transition: 'transform 0.22s ease-out, height 0.15s ease-out',
}

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '8px 16px',
  borderBottom: `1px solid ${DRAWER.border}`,
  background: DRAWER.surface,
  flexShrink: 0,
}

const panelBrandStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

const panelBrandMarkStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.06em',
  color: DRAWER.onAccent,
  background: DRAWER.accentDense,
  borderRadius: 4,
  padding: '2px 6px',
}

const panelBrandTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: DRAWER.accentDense,
  letterSpacing: '0.02em',
}

const tabsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flex: 1,
  overflowX: 'auto',
}

const tabStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 6,
  border: `1px solid transparent`,
  background: 'transparent',
  color: DRAWER.muted,
  font: '12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
}

const tabDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
}

const headerActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

const headerBtnStyle: CSSProperties = {
  border: `1px solid ${DRAWER.border}`,
  background: DRAWER.surface,
  color: DRAWER.muted,
  borderRadius: 6,
  width: 28,
  height: 28,
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
}

const tabContentStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '14px 16px 16px',
}

const toggleStyle: CSSProperties = {
  position: 'fixed',
  bottom: 7,
  right: TANSTACK_DEVTOOLS_OFFSET,
  zIndex: Z_TOGGLE,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 12px 7px 8px',
  // Match the TanStack devtools pill sitting next to it.
  borderRadius: 6,
  background: DRAWER.handleBg,
  color: DRAWER.handleFg,
  border: `1px solid ${DRAWER.borderStrong}`,
  boxShadow: '0 2px 8px rgba(9, 60, 82, 0.24)',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  font: '600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
}

const toggleMarkStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.05em',
  background: 'rgba(255,255,255,0.16)',
  borderRadius: 4,
  padding: '2px 5px',
}

const toggleLabelStyle: CSSProperties = {
  fontWeight: 600,
  letterSpacing: '0.02em',
}

const toggleDotsStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  marginLeft: 2,
}

const statusDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
}
