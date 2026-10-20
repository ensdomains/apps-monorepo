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
import {
  type CSSProperties,
  Fragment,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { answerBignameRequest } from './bignameMock'
import {
  BIGNAME_API_URL,
  isMigrationToolEnabled,
  MIGRATION_TOOL_RPC,
} from './config'
import {
  type ActiveName,
  type CopyTargetState,
  createV1NameOnAnvil,
  ensureNamesOnAnvil,
  fullNamesFor,
  ownershipTargetFor,
  PRESET_FAMILY,
  PRESETS,
  type PresetType,
  readStoredNames,
  writeStoredNames,
} from './MigrationTestPanel.helpers'
import {
  useAnvilStatus,
  useCopyTargetState,
  useDraggablePanel,
  useInvalidateMigrationQueriesOnMount,
} from './MigrationTestPanel.hooks'

/**
 * The request's route under bigname's base (a bigname.sh host, or the app's
 * override, which may sit under a path or be root-relative), or null.
 */
function bignamePath(url: URL): string | null {
  if (BIGNAME_API_URL !== undefined) {
    const base = new URL(BIGNAME_API_URL, window.location.origin)
    const prefix = base.pathname.replace(/\/+$/, '')
    if (url.origin === base.origin && url.pathname.startsWith(`${prefix}/v1/`))
      return url.pathname.slice(prefix.length)
  }
  const isBigname =
    url.hostname === 'bigname.sh' || url.hostname.endsWith('.bigname.sh')
  return isBigname && url.pathname.startsWith('/v1/') ? url.pathname : null
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

;(function installBignameInterceptor() {
  if (typeof window === 'undefined' || !isMigrationToolEnabled()) return
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
    const href =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url
    const url = new URL(href, window.location.origin)
    const path = bignamePath(url)
    if (path === null || _injectedNames.length === 0)
      return origFetch(input, init)
    return answerBignameRequest(url, path, init, _injectedNames, () =>
      origFetch(input, init),
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

/**
 * The preset strip, grouped by which migration route each preset exercises.
 *
 * With 22 presets a flat row is unreadable, and the three families have
 * genuinely different expected outcomes: `migrate` moves a token, `copy`
 * re-creates the name inside a UserRegistry, and `ineligible` should produce
 * nothing at all — which is only meaningful if you seed something alongside it.
 */
function PresetButtons({
  busy,
  busyPreset,
  onCreate,
}: {
  readonly busy: boolean
  readonly busyPreset: PresetType | null
  readonly onCreate: (type: PresetType) => void
}) {
  return (
    <div style={rowStyle}>
      {(['migrate', 'copy', 'transfer', 'ineligible'] as const).map(
        (family, index) => (
          <Fragment key={family}>
            {index > 0 && <span style={sepStyle} />}
            <span style={familyLabelStyle}>{family}</span>
            {PRESETS.filter((p) => PRESET_FAMILY[p.type] === family).map(
              (preset) => {
                const isThisBusy = busy && busyPreset === preset.type
                return (
                  <button
                    key={preset.type}
                    type="button"
                    disabled={busy}
                    onClick={() => onCreate(preset.type)}
                    style={presetChipStyle(busy, isThisBusy)}
                    title={preset.title}
                  >
                    {isThisBusy ? '…' : preset.label}
                  </button>
                )
              },
            )}
          </Fragment>
        ),
      )}
    </div>
  )
}

/** The name picker plus its per-name actions and copy-target state. */
function SelectedNameActions({
  activeNames,
  busy,
  copyState,
  isCopyPreset,
  onMigrate,
  onRemove,
  onOpen,
  onSelect,
  selectedName,
}: {
  readonly activeNames: readonly ActiveName[]
  readonly busy: boolean
  readonly copyState: CopyTargetState
  readonly isCopyPreset: boolean
  readonly onMigrate: (name: ActiveName) => void
  readonly onRemove: (id: string) => void
  readonly onOpen: (name: ActiveName) => void
  readonly onSelect: (id: string) => void
  readonly selectedName: ActiveName | null
}) {
  return (
    <>
      <select
        value={selectedName?.id ?? ''}
        onChange={(e) => onSelect(e.target.value)}
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
        onClick={() => selectedName && onMigrate(selectedName)}
        style={smallChipStyle('#0080bc')}
        title={selectedName ? `Upgrade ${selectedName.label}.eth` : ''}
      >
        Upgrade
      </button>
      <button
        type="button"
        disabled={busy || !selectedName}
        onClick={() => selectedName && onOpen(selectedName)}
        style={smallChipStyle('#7c6bd6')}
        title={
          selectedName
            ? `Open ${selectedName.label}.eth's Ownership tab — then use the app's own Transfer link`
            : ''
        }
      >
        Open
      </button>
      {/* A copy lands in a UserRegistry whose address derives from
          namehash(parentName), so re-migrating the same label hits the same slot
          and `copyMigrationReadiness` refuses it. The app shows none of that —
          just a disabled button under "Gas estimate unavailable". */}
      {isCopyPreset && (
        <span
          style={copyStateChipStyle(copyState)}
          title={
            copyState === 'pristine'
              ? 'No subregistry on the 2LD yet — a fresh copy plan will be accepted.'
              : 'This 2LD already has a subregistry, so a fresh copy plan is refused (subregistry-conflict / v2-name-history). Seed the preset again for a new label.'
          }
        >
          {copyState === 'pristine' ? 'pristine' : 'already migrated'}
        </span>
      )}
      <button
        type="button"
        disabled={!selectedName}
        onClick={() => selectedName && onRemove(selectedName.id)}
        style={smallChipStyle('#737373')}
        title="Remove selected"
      >
        ×
      </button>
      <span style={sepStyle} />
    </>
  )
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
        // Include child names, so a `subname*` preset arrives with the whole
        // hierarchy pre-selected instead of just its 2LD.
        const nameParam = refreshed.flatMap((n) => fullNamesFor(n)).join(',')
        window.location.href = `/upgrade?names=${encodeURIComponent(nameParam)}`
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

  /**
   * Open the selected name's **Ownership** tab — the app's own entry point,
   * not the transfer route.
   *
   * Deliberately one step short of `/ownership/transfer`. Whether that tab
   * offers a Transfer link at all is part of what manual QA is checking: a
   * link that leads to a refusal, or a missing link on a transferable name,
   * is the shape E2E-001 was about. A button that jumped straight to the
   * route would walk the tester past the check.
   *
   * For the refusal shapes the link is *correctly* absent, so there is
   * nothing to click — append `/transfer` to the URL by hand to read the
   * card. The absence is itself the assertion; see manual-v1-transfer.md.
   *
   * Does NOT sync to the bigname mock the way `migrate` does: ownership is
   * read from chain (BaseRegistrar / ENSRegistry / the V2 registry), not from
   * the indexer, so the injection is irrelevant here.
   */
  const openOwnership = useCallback((name: ActiveName) => {
    // A subname-centred transfer preset (#1144's reassign family) opens the
    // subname, not the 2LD that exists only to be its parent.
    window.location.href = `/${ownershipTargetFor(name)}/ownership`
  }, [])

  const removeName = useCallback((id: string) => {
    setActiveNames((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const [selectedId, setSelectedId] = useState<string>('')
  const selectedName =
    activeNames.find((n) => n.id === selectedId) ?? activeNames[0] ?? null

  const isCopyPreset =
    selectedName != null && PRESET_FAMILY[selectedName.type] === 'copy'
  const copyState = useCopyTargetState(endpoint, selectedName, isCopyPreset)

  return (
    <div style={columnStyle}>
      <PresetButtons
        busy={busy}
        busyPreset={busyPreset}
        onCreate={createName}
      />

      {/* Row 2: name picker + migrate actions + anvil */}
      <div style={rowStyle}>
        {activeNames.length > 0 ? (
          <SelectedNameActions
            activeNames={activeNames}
            busy={busy}
            copyState={copyState}
            isCopyPreset={isCopyPreset}
            onMigrate={migrateSingle}
            onOpen={openOwnership}
            onRemove={removeName}
            onSelect={setSelectedId}
            selectedName={selectedName}
          />
        ) : (
          <span style={emptyStyle}>no names</span>
        )}
        <button
          type="button"
          disabled={busy || activeNames.length === 0}
          onClick={migrateAll}
          style={migrateAllChipStyle(busy || activeNames.length === 0)}
          title="Navigate to /upgrade with all active names"
        >
          Upgrade All ({activeNames.length})
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
  background: '#d9d9d9',
  flexShrink: 0,
  alignSelf: 'center',
  margin: '0 3px',
}

const selectStyle: CSSProperties = {
  padding: '2px 5px',
  borderRadius: 4,
  border: '1px solid #d9d9d9',
  background: '#ffffff',
  color: '#191919',
  fontSize: 11,
  cursor: 'pointer',
  maxWidth: 200,
}

const emptyStyle: CSSProperties = {
  color: '#737373',
  fontSize: 11,
  fontStyle: 'italic',
}

const familyLabelStyle: CSSProperties = {
  color: '#737373',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  alignSelf: 'center',
  flexShrink: 0,
}

function copyStateChipStyle(state: CopyTargetState): CSSProperties {
  const pristine = state === 'pristine'
  return {
    padding: '2px 6px',
    borderRadius: 4,
    border: `1px solid ${pristine ? '#99f6e4' : '#fecdd3'}`,
    background: pristine ? '#f0fdfa' : '#fff1f2',
    color: pristine ? '#0f766e' : '#9f1239',
    fontSize: 10,
    flexShrink: 0,
    alignSelf: 'center',
  }
}

function presetChipStyle(disabled: boolean, active: boolean): CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid #cee1e8',
    background: active ? '#093c52' : disabled ? '#eeeded' : '#0080bc',
    color: disabled ? '#737373' : '#fff',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11,
    whiteSpace: 'nowrap',
    lineHeight: '1.2',
  }
}

function smallChipStyle(bg: string): CSSProperties {
  return {
    padding: '2px 8px',
    borderRadius: 4,
    border: '1px solid #cee1e8',
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
    border: '1px solid #e7a259',
    background: disabled ? '#eeeded' : '#984d1b',
    color: disabled ? '#737373' : '#fff',
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
  color: '#b42013',
  fontSize: 11,
}
