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
  writeStoredNames,
} from './MigrationTestPanel.helpers'
import {
  useAnvilStatus,
  useDraggablePanel,
  useInvalidateMigrationQueriesOnMount,
} from './MigrationTestPanel.hooks'

// V1 subgraph URL pattern — intercepted to inject panel-created names
const V1_SUBGRAPH_PATTERN = 'ensnode.io/subgraph'

/** Extract the `name` GraphQL variable from a subgraph request body. */
function migrationLookupName(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { variables?: { name?: string } }
    return parsed.variables?.name
  } catch {
    return undefined
  }
}

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

    // Two v1-subgraph queries need panel-created names injected:
    //  - getNamesForAddress: the dashboard name list (returns all names).
    //  - getV1DomainForMigration: the migration-status lookup, which filters
    //    domains(where: { name: $name }) and must therefore be narrowed to just
    //    the requested name — otherwise the upgrade banner never resolves for
    //    Anvil-only names, since the real hosted subgraph can't see them.
    const body = typeof init?.body === 'string' ? init.body : ''
    const isNameList = body.includes('getNamesForAddress')
    const isMigrationLookup = body.includes('getV1DomainForMigration')
    if (!isNameList && !isMigrationLookup) return origFetch(input, init)

    const injected = isNameList
      ? _injectedNames
      : _injectedNames.filter(
          (n) => `${n.label}.eth` === migrationLookupName(body),
        )

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
          domains: [...realDomains, ...injected.map(buildMockDomain)],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
})()

// --- components -------------------------------------------------------------

let _nameCounter = Math.floor(Date.now() / 1000) % 10000
function nextLabel(): string {
  return `dev${(++_nameCounter).toString().padStart(4, '0')}`
}

function useSyncInjectedNames(activeNames: ActiveName[]): void {
  useEffect(() => {
    setInjectedNames(activeNames)
    writeStoredNames(activeNames)
  }, [activeNames])
}

/** Inner UI — preset buttons, name list, migrate actions. No wrapper or positioning. */
export function MigrationPanelContent() {
  const endpoint = MIGRATION_TOOL_RPC
  const anvilStatus = useAnvilStatus(endpoint)

  const [busy, setBusy] = useState(false)
  const [busyPreset, setBusyPreset] = useState<PresetType | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeNames, setActiveNames] = useState<ActiveName[]>(() =>
    readStoredNames(),
  )
  const queryClient = useQueryClient()

  useInvalidateMigrationQueriesOnMount(queryClient)
  useSyncInjectedNames(activeNames)

  const createName = useCallback(async (type: PresetType) => {
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
  }, [])

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
    [queryClient],
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

  const [selectedId, setSelectedId] = useState<string>('')
  const selectedName =
    activeNames.find((n) => n.id === selectedId) ?? activeNames[0] ?? null

  return (
    <div style={columnStyle}>
      {/* Row 1: preset buttons */}
      <div style={rowStyle}>
        {PRESETS.map((preset) => {
          const isThisBusy = busy && busyPreset === preset.type
          return (
            <button
              key={preset.type}
              type="button"
              disabled={busy}
              onClick={() => void createName(preset.type)}
              style={presetChipStyle(busy, isThisBusy)}
              title={preset.title}
            >
              {isThisBusy ? '…' : preset.label}
            </button>
          )
        })}
      </div>

      {/* Row 2: name picker + migrate actions + anvil */}
      <div style={rowStyle}>
        {activeNames.length > 0 ? (
          <>
            <select
              value={selectedName?.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              style={selectStyle}
              disabled={busy}
            >
              {activeNames.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}.eth ({n.type})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selectedName}
              onClick={() => selectedName && migrateSingle(selectedName)}
              style={smallChipStyle('#2563eb')}
              title={selectedName ? `Migrate ${selectedName.label}.eth` : ''}
            >
              Migrate
            </button>
            <button
              type="button"
              disabled={!selectedName}
              onClick={() => selectedName && removeName(selectedName.id)}
              style={smallChipStyle('#374151')}
              title="Remove selected"
            >
              ×
            </button>
            <span style={sepStyle} />
          </>
        ) : (
          <span style={emptyStyle}>no names</span>
        )}
        <button
          type="button"
          disabled={busy || activeNames.length === 0}
          onClick={migrateAll}
          style={migrateAllChipStyle(busy || activeNames.length === 0)}
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
          <span style={{ color: '#6b7280', fontSize: 10 }}>Anvil</span>
        </div>
      </div>

      {actionError ? <span style={errorInlineStyle}>{actionError}</span> : null}
    </div>
  )
}

/** Standalone floating draggable panel — wraps MigrationPanelContent. */
export function MigrationTestPanel() {
  const { setNodeRef, dragHandlers, positionStyle } = useDraggablePanel()
  const [collapsed, setCollapsed] = useState(false)

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
      <MigrationPanelContent />
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
  top: 12,
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
  top: 12,
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

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
}

const sepStyle: CSSProperties = {
  width: 1,
  height: 13,
  background: 'rgba(255,255,255,0.15)',
  flexShrink: 0,
  alignSelf: 'center',
  margin: '0 3px',
}

const selectStyle: CSSProperties = {
  padding: '2px 5px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(0,0,0,0.3)',
  color: '#e5e7eb',
  fontSize: 11,
  cursor: 'pointer',
  maxWidth: 200,
}

const emptyStyle: CSSProperties = {
  color: '#4b5563',
  fontSize: 11,
  fontStyle: 'italic',
}

function presetChipStyle(disabled: boolean, active: boolean): CSSProperties {
  return {
    padding: '2px 7px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.12)',
    background: active
      ? 'rgba(37,99,235,0.6)'
      : disabled
        ? 'rgba(75,85,99,0.4)'
        : 'rgba(37,99,235,0.85)',
    color: disabled ? '#9ca3af' : '#fff',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11,
    whiteSpace: 'nowrap',
    lineHeight: '1.2',
  }
}

function smallChipStyle(bg: string): CSSProperties {
  return {
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.12)',
    background: bg,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 11,
    lineHeight: '1.2',
  }
}

function migrateAllChipStyle(disabled: boolean): CSSProperties {
  return {
    padding: '2px 10px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.12)',
    background: disabled ? 'rgba(75,85,99,0.4)' : '#d97706',
    color: disabled ? '#9ca3af' : '#fff',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    lineHeight: '1.2',
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
  width: 7,
  height: 7,
  borderRadius: '50%',
  flexShrink: 0,
}

const errorInlineStyle: CSSProperties = {
  color: '#fca5a5',
  fontSize: 11,
}
