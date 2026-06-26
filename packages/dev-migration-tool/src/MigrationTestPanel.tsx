/**
 * DEV-only floating panel for creating V1 ENS name states and triggering
 * migration — for QA testing of the ENS V1→V2 migration flow.
 *
 * Creates names directly on a local Anvil fork via raw JSON-RPC calls, then
 * lets testers navigate to the migration UI with the name pre-selected.
 *
 * Rendered only when `isMigrationToolEnabled()` — mounted by each app's root.
 */

import { useQueryClient } from '@tanstack/react-query'
import { type CSSProperties, useCallback, useEffect, useState } from 'react'
import { MIGRATION_TOOL_RPC } from './config'
import {
  type ActiveName,
  buildMockDomain,
  createV1NameOnAnvil,
  ensureNamesOnAnvil,
  PRESETS,
  type PresetType,
  readStoredNames,
  TYPE_BADGE_COLORS,
  writeStoredNames,
} from './MigrationTestPanel.helpers'
import { useAnvilStatus, useDraggablePanel } from './MigrationTestPanel.hooks'

// V1 subgraph URL pattern — intercepted to inject panel-created names
const V1_SUBGRAPH_PATTERN = 'ensnode.io/subgraph'

// ---------------------------------------------------------------------------
// Module-level fetch interceptor — installed at import time so it's active
// before React Query fires its first request (useEffect is too late: RQ fires
// before effects run on the initial render).
// ---------------------------------------------------------------------------

/** Current names to inject — kept in sync by the component via setInjectedNames(). */
let _injectedNames: ActiveName[] = readStoredNames()

export function setInjectedNames(names: ActiveName[]): void {
  _injectedNames = names
}

;(function installSubgraphInterceptor() {
  if (typeof window === 'undefined') return
  // HMR guard: store the true original fetch under a well-known key so that
  // re-executing this module (hot reload) doesn't double-wrap window.fetch.
  type W = typeof window & { __migToolOrigFetch?: typeof fetch }
  const w = window as W
  if (!w.__migToolOrigFetch) w.__migToolOrigFetch = window.fetch.bind(window)
  const origFetch = w.__migToolOrigFetch

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url

    if (!url.includes(V1_SUBGRAPH_PATTERN)) return origFetch(input, init)

    const body = typeof init?.body === 'string' ? init.body : ''
    if (!body.includes('getNamesForAddress')) return origFetch(input, init)

    let realDomains: unknown[] = []
    try {
      const real = await origFetch(input, init)
      const json = (await real.json()) as { data?: { domains?: unknown[] } }
      realDomains = json?.data?.domains ?? []
    } catch {
      /* subgraph unreachable */
    }

    return new Response(
      JSON.stringify({
        data: {
          domains: [...realDomains, ..._injectedNames.map(buildMockDomain)],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
})()

// --- component -------------------------------------------------------------

let _nameCounter = Math.floor(Date.now() / 1000) % 10000
function nextLabel(): string {
  return `dev${(++_nameCounter).toString().padStart(4, '0')}`
}

export function MigrationTestPanel() {
  const endpoint = MIGRATION_TOOL_RPC
  const { setNodeRef, dragHandlers, positionStyle } = useDraggablePanel()
  const anvilStatus = useAnvilStatus(endpoint)

  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyPreset, setBusyPreset] = useState<PresetType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Restore names from localStorage so they survive page navigation
  const [activeNames, setActiveNames] = useState<ActiveName[]>(() =>
    readStoredNames(),
  )
  const queryClient = useQueryClient()

  // On mount: bust any stale migration query caches (v1_names + eligibility).
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: [{ $scope: 'migration' }] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the module-level injected names in sync with React state + localStorage
  useEffect(() => {
    setInjectedNames(activeNames)
    writeStoredNames(activeNames)
  }, [activeNames])

  const createName = useCallback(
    async (type: PresetType) => {
      const label = nextLabel()
      setBusy(true)
      setBusyPreset(type)
      setActionError(null)
      try {
        const { label: resultLabel, expiryDate } = await createV1NameOnAnvil(
          endpoint,
          label,
          type,
        )
        setActiveNames((prev) => [
          ...prev,
          {
            label: resultLabel,
            type,
            id: `${resultLabel}-${Date.now()}`,
            expiryDate,
          },
        ])
      } catch (e) {
        setActionError(
          `Failed to create ${type}: ${e instanceof Error ? e.message : String(e)}`,
        )
      } finally {
        setBusy(false)
        setBusyPreset(null)
      }
    },
    [endpoint],
  )

  /**
   * Sync names to Anvil, invalidate migration caches, then hard-navigate.
   * Hard navigation keeps localStorage names alive across the reload so the
   * fetch interceptor restores and injects them into the next subgraph query.
   */
  const navigateToMigration = useCallback(
    async (names: ActiveName[]) => {
      setBusy(true)
      setActionError(null)
      try {
        const refreshed = await ensureNamesOnAnvil(endpoint, names)
        setActiveNames(refreshed)
        setInjectedNames(refreshed)
        writeStoredNames(refreshed)
        void queryClient.invalidateQueries({
          queryKey: [{ $scope: 'migration' }],
        })
        const nameParam = refreshed.map((n) => `${n.label}.eth`).join(',')
        window.location.href = `/migration?names=${encodeURIComponent(nameParam)}`
      } catch (e) {
        setActionError(`Failed to sync names to Anvil: ${String(e)}`)
        setBusy(false)
      }
    },
    [endpoint, queryClient],
  )

  const migrateAll = useCallback(() => {
    if (activeNames.length === 0) return
    void navigateToMigration(activeNames)
  }, [activeNames, navigateToMigration])

  const migrateSingle = useCallback(
    (name: ActiveName) => {
      void navigateToMigration([name])
    },
    [navigateToMigration],
  )

  const removeName = useCallback((id: string) => {
    setActiveNames((prev) => prev.filter((n) => n.id !== id))
  }, [])

  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => setCollapsed(false)}
        style={{ ...collapsedStyle, ...positionStyle }}
        title="Open Migration Tool panel"
      >
        {'↑'} Migration Tool
      </button>
    )
  }

  return (
    <div ref={setNodeRef} style={{ ...panelStyle, ...positionStyle }}>
      {/* Header */}
      <div
        style={{ ...headerStyle, cursor: 'move', touchAction: 'none' }}
        {...dragHandlers}
      >
        <span style={{ fontWeight: 600 }}>{'↑'} Migration Tool (dev)</span>
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

      {/* Section 1: Create Preset */}
      <p style={sectionLabelStyle}>Create V1 name</p>
      <div style={gridStyle}>
        {PRESETS.map((preset) => {
          const isThisBusy = busy && busyPreset === preset.type
          return (
            <button
              key={preset.type}
              type="button"
              disabled={busy}
              onClick={() => void createName(preset.type)}
              style={presetButtonStyle(busy, isThisBusy)}
              title={preset.title}
            >
              {isThisBusy ? 'Creating...' : preset.label}
            </button>
          )
        })}
      </div>

      {/* Section 2: Active Names */}
      {activeNames.length > 0 && (
        <>
          <p style={sectionLabelStyle}>Active names ({activeNames.length})</p>
          <div style={nameListStyle}>
            {activeNames.map((name) => (
              <div key={name.id} style={nameRowStyle}>
                <span style={nameLabelStyle}>{name.label}.eth</span>
                <span
                  style={{
                    ...typeBadgeStyle,
                    background: TYPE_BADGE_COLORS[name.type],
                  }}
                >
                  {name.type}
                </span>
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => migrateSingle(name)}
                    style={smallButtonStyle('#2563eb')}
                    title={`Migrate ${name.label}.eth`}
                  >
                    Migrate
                  </button>
                  <button
                    type="button"
                    onClick={() => removeName(name.id)}
                    style={smallButtonStyle('#374151')}
                    title="Remove from list"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Section 3: Footer */}
      <div style={footerStyle}>
        <button
          type="button"
          disabled={busy || activeNames.length === 0}
          onClick={migrateAll}
          style={migrateAllButtonStyle(busy || activeNames.length === 0)}
          title="Navigate to /migration with all active names"
        >
          Migrate All ({activeNames.length})
        </button>
        <div style={statusDotContainerStyle}>
          <span
            style={{
              ...statusDotStyle,
              background:
                anvilStatus === 'ok'
                  ? '#22c55e'
                  : anvilStatus === 'error'
                    ? '#ef4444'
                    : '#f59e0b',
            }}
            title={`Anvil: ${anvilStatus}`}
          />
          <span style={{ color: '#6b7280' }}>Anvil</span>
        </div>
      </div>

      {actionError ? <p style={errorStyle}>{actionError}</p> : null}
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
  right: 12,
  zIndex: 2_147_483_000,
  width: 280,
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
  right: 12,
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

const sectionLabelStyle: CSSProperties = {
  margin: '8px 0 4px',
  color: '#9ca3af',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 5,
}

function presetButtonStyle(disabled: boolean, active: boolean): CSSProperties {
  return {
    padding: '6px 4px',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: active
      ? 'rgba(37,99,235,0.6)'
      : disabled
        ? 'rgba(75,85,99,0.4)'
        : 'rgba(37,99,235,0.8)',
    color: disabled ? '#9ca3af' : '#fff',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

const nameListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  maxHeight: 160,
  overflowY: 'auto',
}

const nameRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '4px 0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}

const nameLabelStyle: CSSProperties = {
  flexShrink: 0,
  color: '#e5e7eb',
}

const typeBadgeStyle: CSSProperties = {
  flexShrink: 0,
  padding: '1px 5px',
  borderRadius: 4,
  color: '#fff',
  fontSize: 10,
  whiteSpace: 'nowrap',
}

function smallButtonStyle(bg: string): CSSProperties {
  return {
    padding: '3px 6px',
    borderRadius: 5,
    border: '1px solid rgba(255,255,255,0.12)',
    background: bg,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
  }
}

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 10,
}

function migrateAllButtonStyle(disabled: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 0',
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.12)',
    background: disabled ? 'rgba(75,85,99,0.4)' : '#d97706',
    color: disabled ? '#9ca3af' : '#fff',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 600,
  }
}

const statusDotContainerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
}

const statusDotStyle: CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
}

const errorStyle: CSSProperties = {
  margin: '8px 0 0',
  color: '#fca5a5',
  wordBreak: 'break-word',
}
