/**
 * DEV-only floating panel for creating V1 ENS name states and triggering
 * migration — for QA testing of the ENS V1→V2 migration flow.
 *
 * Creates names directly on a local Anvil fork via raw JSON-RPC calls, then
 * lets testers navigate to the migration UI with the name pre-selected.
 *
 * Rendered only when `isMigrationToolEnabled()` — mounted by each app's root.
 */

import { ensL1Subgraphs, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { useQueryClient } from '@tanstack/react-query'
import { type CSSProperties, useCallback, useEffect, useState } from 'react'
import { MIGRATION_TOOL_RPC } from './config'
import {
  type ActiveName,
  accountLabel,
  approveNameWrapperToken,
  buildMockDomain,
  buildMockSubnameDomain,
  CANNOT_UNWRAP,
  type CreateNameOptions,
  createV1NameOnAnvil,
  DEFAULT_ACCOUNT,
  DEV_ACCOUNTS,
  ETH_NODE,
  ensureNamesOnAnvil,
  fuseSummary,
  getOnchainExpiries,
  invalidFuseCombination,
  isMigratedInV2,
  isSubnameEmancipated,
  LIFECYCLE_DRIFT_DAYS,
  labelhash,
  migrationOutcomeFor,
  type NameLifecycle,
  namehashFromLabelAndParent,
  OWNER_FUSE_OPTIONS,
  PARENT_CANNOT_CONTROL,
  PRESET_DRIFT_DAYS,
  PRESETS,
  type PresetType,
  readStoredNames,
  SEEDED_COIN_TYPES,
  SEEDED_TEXT_KEYS,
  SUBNAME_LABEL,
  setSubnamePrimary,
  setV1PrimaryName,
  TYPE_BADGE_COLORS,
  transferManager,
  transferSubname,
  transferV1Name,
  transferV2Name,
  V1_NAME_WRAPPER,
  wrapSubname,
  writeStoredNames,
} from './MigrationTestPanel.helpers'
import {
  useAnvilStatus,
  useDraggablePanel,
  useInvalidateMigrationQueriesOnMount,
} from './MigrationTestPanel.hooks'

/**
 * The V1 subgraph endpoint the apps actually talk to, read from the same ensjs
 * chain config their clients are built from. Hardcoding the host is what
 * silently broke injection once before: ensjs moved Sepolia's V1 subgraph off
 * `ensnode.io`, the pattern stopped matching, and every panel-created name
 * looked non-existent (and therefore non-migratable) to the apps while real
 * subgraph-indexed names kept working.
 */
const V1_SUBGRAPH_URL = ensL1Subgraphs[supportedL1Chains.sepolia].ens.url

/**
 * Whether a request is the V1 subgraph. Matches the configured endpoint first,
 * then falls back to any `/subgraph` path so a proxied or relocated endpoint
 * still gets injected — the V2 indexer serves `/graphql`, so there's no overlap.
 */
function isV1SubgraphRequest(url: string): boolean {
  if (url.startsWith(V1_SUBGRAPH_URL)) return true
  try {
    return new URL(url, window.location.origin).pathname.endsWith('/subgraph')
  } catch {
    return false
  }
}

const nodeForLabel = (label: string): `0x${string}` =>
  namehashFromLabelAndParent(labelhash(label), ETH_NODE)

/** Extract the `name` GraphQL variable from a subgraph request body. */
function migrationLookupName(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { variables?: { name?: string } }
    return parsed.variables?.name
  } catch {
    return undefined
  }
}

/**
 * Names the address-scoped `getNamesForAddress` query should see.
 *
 * The query filters on owner/registrant/wrappedOwner, so a name must only be injected for
 * the account that actually holds it — otherwise every address's profile leaks somebody
 * else's names. Panel names used to be uniformly owned by DEFAULT_ACCOUNT and this was a
 * single check against that constant; with multi-account support each name carries its
 * own owner (and manager), so it is matched per name.
 *
 * The address is embedded verbatim (lowercased) in the where filter, so a substring check
 * against the serialized body is robust to the exact filter shape.
 */
function namesVisibleTo(body: string, names: ActiveName[]): ActiveName[] {
  const haystack = body.toLowerCase()
  return names.filter((n) => {
    const owner = (n.ownerAddress ?? DEFAULT_ACCOUNT).toLowerCase()
    if (haystack.includes(owner)) return true
    // A V1 manager is the registry `owner` of the node, so the query matches on it too.
    const manager = n.managerAddress?.toLowerCase()
    if (manager && haystack.includes(manager)) return true
    // A subname can have been moved to somebody else — it still needs listing for them.
    const subOwner = n.subnameOwner?.toLowerCase()
    return subOwner ? haystack.includes(subOwner) : false
  })
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

    if (!isV1SubgraphRequest(url)) return origFetch(input, init)

    // Three v1-subgraph queries need panel-created names injected:
    //  - getNamesForAddress: the dashboard name list (returns all names).
    //  - getV1DomainForMigration: the migration-status lookup, which filters
    //    domains(where: { name: $name }) and must therefore be narrowed to just
    //    the requested name — otherwise the upgrade banner never resolves for
    //    Anvil-only names, since the real hosted subgraph can't see them.
    //  - getProfilesForDomains: the record KEYS the migration replays. Without this the
    //    app sees no records on a seeded name and silently migrates it without them.
    const body = typeof init?.body === 'string' ? init.body : ''
    const isNameList = body.includes('getNamesForAddress')
    const isMigrationLookup = body.includes('getV1DomainForMigration')
    const isProfileLookup = body.includes('getProfilesForDomains')
    // ensjs's subgraph-backed `getSubnames`, used by the portal's V1 subnames tab. Without
    // it a panel-created subname exists on chain but the tab renders empty, because the
    // hosted subgraph has never seen an Anvil-only name.
    const isSubnameLookup = body.includes('getSubnames')
    // ensjs's `getSubgraphRecords`, which the portal uses to discover WHICH text keys and
    // coin types a name has before reading their values on chain. The values are real, but
    // without the key list the records tab renders "No records set".
    const isRecordKeyLookup = body.includes('getSubgraphRecords')
    if (
      !isNameList &&
      !isMigrationLookup &&
      !isProfileLookup &&
      !isSubnameLookup &&
      !isRecordKeyLookup
    ) {
      return origFetch(input, init)
    }

    if (isRecordKeyLookup) {
      let domainId: string | undefined
      try {
        const parsed = JSON.parse(body) as { variables?: { id?: string } }
        domainId = parsed.variables?.id
      } catch {
        /* fall through with no id */
      }
      const seeded = _injectedNames.find(
        (n) => n.hasRecords && nodeForLabel(n.label) === domainId,
      )
      if (!seeded) return origFetch(input, init)

      const resolver = {
        texts: [...SEEDED_TEXT_KEYS],
        coinTypes: [...SEEDED_COIN_TYPES],
      }
      // Both query variants are answered: `resolver` at the top level covers the
      // custom-resolver form, and nesting it under `domain` covers the inherited form.
      return new Response(
        JSON.stringify({
          data: {
            domain: {
              name: `${seeded.label}.eth`,
              isMigrated: true,
              createdAt: String(Math.floor(Date.now() / 1000) - 60),
              resolver,
            },
            resolver,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (isSubnameLookup) {
      let parentId: string | undefined
      try {
        const parsed = JSON.parse(body) as { variables?: { id?: string } }
        parentId = parsed.variables?.id
      } catch {
        /* fall through with no id */
      }
      const parent = _injectedNames.find(
        (n) => n.subnameLabel && nodeForLabel(n.label) === parentId,
      )
      if (!parent?.subnameLabel) return origFetch(input, init)

      const owner = DEFAULT_ACCOUNT.toLowerCase()
      const subLabel = parent.subnameLabel
      const subName = `${subLabel}.${parent.label}.eth`
      return new Response(
        JSON.stringify({
          data: {
            domain: {
              subdomains: [
                {
                  id: namehashFromLabelAndParent(
                    labelhash(subLabel),
                    nodeForLabel(parent.label),
                  ),
                  labelName: subLabel,
                  labelhash: labelhash(subLabel),
                  name: subName,
                  isMigrated: true,
                  createdAt: String(Math.floor(Date.now() / 1000) - 60),
                  resolvedAddress: null,
                  owner: { id: V1_NAME_WRAPPER.toLowerCase() },
                  registrant: null,
                  wrappedOwner: { id: owner },
                  registration: null,
                  wrappedDomain: {
                    expiryDate: String(parent.expiryDate),
                    fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
                  },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (isProfileLookup) {
      let requestedIds: string[] = []
      try {
        const parsed = JSON.parse(body) as {
          variables?: { whereFilter?: { id_in?: string[] } }
        }
        requestedIds = parsed.variables?.whereFilter?.id_in ?? []
      } catch {
        /* fall through with no ids */
      }

      // Every panel-created node, parent AND subname — a child is a domain in its own
      // right and the app asks for its profile too.
      const byNode = new Map<string, ActiveName>()
      for (const n of _injectedNames) {
        byNode.set(nodeForLabel(n.label), n)
        if (n.subnameLabel) {
          byNode.set(
            namehashFromLabelAndParent(
              labelhash(n.subnameLabel),
              nodeForLabel(n.label),
            ),
            n,
          )
        }
      }

      // The app requires an entry for EVERY id it asked about — a missing one is a failed
      // lookup, not "no records", and it aborts the whole plan with a ProfileFetchError
      // (surfacing as "Gas estimate unavailable"). So answer for all of our nodes, with
      // empty key lists where nothing was seeded, and let the real subgraph cover the rest.
      let realDomains: unknown[] = []
      try {
        const real = await origFetch(input, init)
        const json = (await real.json()) as { data?: { domains?: unknown[] } }
        realDomains = json?.data?.domains ?? []
      } catch {
        /* subgraph unreachable */
      }
      const realIds = new Set(
        realDomains.map((d) => (d as { id?: string }).id).filter(Boolean),
      )
      const mockDomains = requestedIds
        .filter((id) => byNode.has(id) && !realIds.has(id))
        .map((id) => {
          const owner = byNode.get(id)
          const seeded = owner?.hasRecords === true
          return {
            id,
            resolver: {
              texts: seeded ? [...SEEDED_TEXT_KEYS] : [],
              coinTypes: seeded ? [...SEEDED_COIN_TYPES] : [],
              contentHash: null,
              abiChangeds: [],
            },
          }
        })

      return new Response(
        JSON.stringify({ data: { domains: [...realDomains, ...mockDomains] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (isSubnameLookup) {
      let parentId: string | undefined
      try {
        const parsed = JSON.parse(body) as { variables?: { id?: string } }
        parentId = parsed.variables?.id
      } catch {
        /* fall through with no id */
      }
      const parent = _injectedNames.find(
        (n) => n.subnameLabel && nodeForLabel(n.label) === parentId,
      )
      if (!parent?.subnameLabel) return origFetch(input, init)

      const owner = DEFAULT_ACCOUNT.toLowerCase()
      const subLabel = parent.subnameLabel
      const subName = `${subLabel}.${parent.label}.eth`
      return new Response(
        JSON.stringify({
          data: {
            domain: {
              subdomains: [
                {
                  id: namehashFromLabelAndParent(
                    labelhash(subLabel),
                    nodeForLabel(parent.label),
                  ),
                  labelName: subLabel,
                  labelhash: labelhash(subLabel),
                  name: subName,
                  isMigrated: true,
                  createdAt: String(Math.floor(Date.now() / 1000) - 60),
                  resolvedAddress: null,
                  owner: { id: V1_NAME_WRAPPER.toLowerCase() },
                  registrant: null,
                  wrappedOwner: { id: owner },
                  registration: null,
                  wrappedDomain: {
                    expiryDate: String(parent.expiryDate),
                    fuses: PARENT_CANNOT_CONTROL | CANNOT_UNWRAP,
                  },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (isProfileLookup) {
      let requestedIds: string[] = []
      try {
        const parsed = JSON.parse(body) as {
          variables?: { whereFilter?: { id_in?: string[] } }
        }
        requestedIds = parsed.variables?.whereFilter?.id_in ?? []
      } catch {
        /* fall through with no ids */
      }
      const byNode = new Map<string, ActiveName>(
        _injectedNames.map((n) => [nodeForLabel(n.label), n] as const),
      )
      const domains = requestedIds
        .filter((id) => byNode.get(id)?.hasRecords)
        .map((id) => ({
          id,
          resolver: {
            texts: [...SEEDED_TEXT_KEYS],
            coinTypes: [...SEEDED_COIN_TYPES],
            contentHash: null,
            abiChangeds: [],
          },
        }))
      return new Response(JSON.stringify({ data: { domains } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const nameListInjected = namesVisibleTo(body, _injectedNames)
    const injected = isNameList
      ? nameListInjected
      : _injectedNames.filter((n) => {
          const wanted = migrationLookupName(body)
          return (
            `${n.label}.eth` === wanted ||
            (n.subnameLabel !== undefined &&
              `${n.subnameLabel}.${n.label}.eth` === wanted)
          )
        })

    let realDomains: unknown[] = []
    try {
      const real = await origFetch(input, init)
      const json = (await real.json()) as { data?: { domains?: unknown[] } }
      realDomains = json?.data?.domains ?? []
    } catch {
      /* subgraph unreachable */
    }

    // Reflect the live on-chain expiry (renewals/time-travel move it) rather than
    // the value captured at creation — otherwise a renewed grace name still reads
    // as expired and migration eligibility keeps hiding the upgrade banner.
    const liveExpiries = await getOnchainExpiries(
      MIGRATION_TOOL_RPC,
      injected.map((name) => name.label),
    )
    const mockDomains = injected.flatMap((name, index) => {
      const liveExpiry = liveExpiries[index]
      const withExpiry =
        liveExpiry != null ? { ...name, expiryDate: liveExpiry } : name
      // A subname is a domain in its own right — without it the app never lists the child
      // and it can never be migrated into the parent's WrapperRegistry.
      const child = buildMockSubnameDomain(withExpiry)
      return child
        ? [buildMockDomain(withExpiry), child]
        : [buildMockDomain(withExpiry)]
    })

    return new Response(
      JSON.stringify({
        data: {
          domains: [...realDomains, ...mockDomains],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
})()

/** What a name row's action applies to. */
type RowTarget =
  | 'name'
  | 'subname'
  | 'manager'
  | 'approve'
  | 'primary'
  | 'subname-primary'
  | 'wrap-subname'

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

  const createName = useCallback(
    async (type: PresetType, fuses = 0, options: CreateNameOptions = {}) => {
      const label = nextLabel()
      setBusy(true)
      setBusyPreset(type)
      setActionError(null)
      try {
        const {
          label: resultLabel,
          expiryDate,
          ownerFuses,
          hasRecords,
          subnameLabel,
          ownerAddress,
          managerAddress,
          isPrimary,
        } = await createV1NameOnAnvil(endpoint, label, type, fuses, options)
        setActiveNames((prev) => [
          ...prev,
          {
            label: resultLabel,
            type,
            id: `${resultLabel}-${Date.now()}`,
            expiryDate,
            ...(ownerFuses === undefined ? {} : { ownerFuses }),
            ...(hasRecords ? { hasRecords } : {}),
            ...(subnameLabel ? { subnameLabel } : {}),
            // Without these the panel would keep showing the name under account A and
            // sign transfers as A, while the chain has it under whoever created it.
            ownerAddress,
            ...(managerAddress ? { managerAddress } : {}),
            ...(isPrimary ? { isPrimary } : {}),
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
    [],
  )

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

  /**
   * Run the action chosen on a name's row.
   *
   * V1 and V2 hold a name in different places, so which contract to touch is decided by
   * asking V2 whether the name is REGISTERED rather than trusting the panel's own record —
   * a name can be migrated from the app while the panel still lists it.
   */
  // Per-row: what to move, and to whom. Kept per name id so each row is independent.
  const [rowTargets, setRowTargets] = useState<Record<string, RowTarget>>({})
  const [rowRecipients, setRowRecipients] = useState<Record<string, string>>({})

  const runRowAction = useCallback(
    async (name: ActiveName) => {
      const target = rowTargets[name.id] ?? 'name'
      const to = rowRecipients[name.id] ?? DEV_ACCOUNTS[1]?.address ?? ''
      const from = name.ownerAddress ?? DEFAULT_ACCOUNT
      setBusy(true)
      setActionError(null)
      try {
        if (target === 'wrap-subname') {
          if (!name.subnameLabel) return
          await wrapSubname(
            endpoint,
            name.label,
            name.subnameLabel,
            from as `0x${string}`,
          )
          setActiveNames((prev) =>
            prev.map((n) =>
              n.id === name.id ? { ...n, subnameWrapped: true } : n,
            ),
          )
          return
        }

        if (target === 'subname-primary') {
          if (!name.subnameLabel) return
          await setSubnamePrimary(
            endpoint,
            name.label,
            name.subnameLabel,
            from as `0x${string}`,
          )
          setActiveNames((prev) =>
            prev.map((n) =>
              n.id === name.id ? { ...n, subnamePrimary: true } : n,
            ),
          )
          return
        }

        if (target === 'primary') {
          // Set on the CURRENT owner, not the recipient — a primary belongs to whoever
          // holds the name, and the recipient dropdown is irrelevant here.
          await setV1PrimaryName(endpoint, name.label, from as `0x${string}`)
          setActiveNames((prev) =>
            prev.map((n) => (n.id === name.id ? { ...n, isPrimary: true } : n)),
          )
          return
        }

        if (target === 'approve') {
          await approveNameWrapperToken(
            endpoint,
            name.label,
            to as `0x${string}`,
            from as `0x${string}`,
          )
          return
        }

        if (target === 'manager') {
          await transferManager(
            endpoint,
            name.label,
            from as `0x${string}`,
            to as `0x${string}`,
          )
          setActiveNames((prev) =>
            prev.map((n) =>
              n.id === name.id ? { ...n, managerAddress: to } : n,
            ),
          )
          return
        }

        if (target === 'subname') {
          if (!name.subnameLabel) return
          // The token moves regardless, but the parent can take a non-emancipated child
          // straight back with `setSubnodeOwner` — say so rather than let it look durable.
          const emancipated = await isSubnameEmancipated(
            endpoint,
            name.label,
            name.subnameLabel,
          )
          await transferSubname(
            endpoint,
            name.label,
            name.subnameLabel,
            from as `0x${string}`,
            to as `0x${string}`,
          )
          setActiveNames((prev) =>
            prev.map((n) =>
              n.id === name.id ? { ...n, subnameOwner: to } : n,
            ),
          )
          if (!emancipated) {
            setActionError(
              `${name.subnameLabel}.${name.label}.eth moved to ${accountLabel(to)}, but it is NOT emancipated — the parent can take it back with setSubnodeOwner.`,
            )
          }
          return
        }

        if (from.toLowerCase() === to.toLowerCase()) {
          setActionError(
            `${name.label}.eth is already held by ${accountLabel(to)}`,
          )
          return
        }
        const migrated = await isMigratedInV2(endpoint, name.label)
        if (migrated) {
          await transferV2Name(
            endpoint,
            name.label,
            from as `0x${string}`,
            to as `0x${string}`,
          )
        } else {
          const isWrapped =
            name.type !== 'unwrapped' &&
            name.type !== 'grace-renewable-unwrapped'
          await transferV1Name(
            endpoint,
            name.label,
            from as `0x${string}`,
            to as `0x${string}`,
            isWrapped,
          )
        }
        // Keep the panel's view of ownership in step, or the subgraph mock keeps showing
        // the name under the previous holder.
        setActiveNames((prev) =>
          prev.map((n) => (n.id === name.id ? { ...n, ownerAddress: to } : n)),
        )
      } catch (e) {
        setActionError(
          `Failed on ${name.label}.eth: ${e instanceof Error ? e.message : String(e)}`,
        )
      } finally {
        setBusy(false)
      }
    },
    [rowTargets, rowRecipients],
  )

  // Custom fuse builder — lets a tester wrap a name with any owner-controlled fuse
  // combination, rather than only the fixed presets.
  const [customFuses, setCustomFuses] = useState(0)
  const customOutcome = migrationOutcomeFor(customFuses)
  // V1 refuses owner fuses on an unlocked name, so don't offer a create that must revert.
  const [withSubname, setWithSubname] = useState(false)
  const [withRecords, setWithRecords] = useState(false)
  const [withPrimary, setWithPrimary] = useState(false)
  const [lifecycle, setLifecycle] = useState<NameLifecycle>('active')
  const [createOwner, setCreateOwner] = useState<string>(DEFAULT_ACCOUNT)
  // '' = no split; the manager is only applied to UNWRAPPED names (see CreateNameOptions).
  const [createManager, setCreateManager] = useState<string>('')
  const driftDays = LIFECYCLE_DRIFT_DAYS[lifecycle]
  const customInvalid = invalidFuseCombination(customFuses, {
    withSubname,
    withRecords,
  })

  return (
    <div style={columnStyle}>
      {/* Row 1: preset buttons */}
      <div style={rowStyle}>
        {PRESETS.map((preset) => {
          const isThisBusy = busy && busyPreset === preset.type
          const drift = PRESET_DRIFT_DAYS[preset.type]
          return (
            <button
              key={preset.type}
              type="button"
              disabled={busy}
              onClick={() =>
                void createName(preset.type, 0, {
                  owner: createOwner as `0x${string}`,
                  ...(createManager
                    ? { manager: createManager as `0x${string}` }
                    : {}),
                  withSubname,
                  withRecords,
                  withPrimary,
                  lifecycle,
                })
              }
              style={presetChipStyle(busy, isThisBusy)}
              title={
                drift
                  ? `${preset.title}\n\n⚠ Advances the shared fork clock by ~${drift} days — every OTHER name ages too, and any with less time left will expire.`
                  : preset.title
              }
            >
              {isThisBusy ? '…' : drift ? `${preset.label} ⏱` : preset.label}
            </button>
          )
        })}
      </div>

      {/* Row 1b: custom fuse builder */}
      <div style={rowStyle}>
        <span style={fuseGroupLabelStyle}>Fuses</span>
        {OWNER_FUSE_OPTIONS.map((fuse) => {
          const checked = (customFuses & fuse.value) !== 0
          return (
            <label
              key={fuse.label}
              style={fuseToggleStyle(checked, busy)}
              title={fuse.note}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={() => setCustomFuses((prev) => prev ^ fuse.value)}
                style={fuseCheckboxStyle}
              />
              {/* Trim the CANNOT_ prefix — the tooltip carries the full name and meaning */}
              {fuse.label.replace(/^CANNOT_/, '')}
            </label>
          )
        })}
        <span style={sepStyle} />
        <button
          type="button"
          disabled={busy || customInvalid !== null}
          onClick={() =>
            void createName('custom', customFuses, {
              withSubname,
              withRecords,
              withPrimary,
              lifecycle,
              owner: createOwner as `0x${string}`,
              ...(createManager
                ? { manager: createManager as `0x${string}` }
                : {}),
            })
          }
          style={presetChipStyle(
            busy || customInvalid !== null,
            busy && busyPreset === 'custom',
          )}
          title={
            customInvalid?.reason ??
            `Wrap a new name with ${fuseSummary(customFuses)} — ${customOutcome.reason}`
          }
        >
          {busy && busyPreset === 'custom' ? '…' : 'Create custom'}
        </button>
        <span
          style={fuseOutcomeStyle(customOutcome.kind)}
          title={customOutcome.reason}
        >
          {customInvalid
            ? `⚠ ${customInvalid.short}`
            : customOutcome.kind === 'blocked'
              ? '⚠ unmigratable'
              : fuseSummary(customFuses)}
        </span>
      </div>

      {/* Row 1c: what else to seed alongside the name */}
      <div style={rowStyle}>
        <span style={fuseGroupLabelStyle}>Also</span>
        <label
          style={fuseToggleStyle(withSubname, busy)}
          title={`Create ${SUBNAME_LABEL}.<name>.eth under the new name. Emancipated (PARENT_CANNOT_CONTROL) when the parent is locked, otherwise a plain subname.`}
        >
          <input
            type="checkbox"
            checked={withSubname}
            disabled={busy}
            onChange={() => setWithSubname((v) => !v)}
            style={fuseCheckboxStyle}
          />
          subname
        </label>
        <label
          style={fuseToggleStyle(withRecords, busy)}
          title={`Set a resolver and seed records (${SEEDED_TEXT_KEYS.join(', ')}, ETH address). Written before fuses burn, so it works even with CANNOT_SET_RESOLVER.`}
        >
          <input
            type="checkbox"
            checked={withRecords}
            disabled={busy}
            onChange={() => setWithRecords((v) => !v)}
            style={fuseCheckboxStyle}
          />
          records
        </label>
        <label
          style={fuseToggleStyle(withPrimary, busy)}
          title="Set this name as the owner's V1 primary (reverse) name. Implies records — a primary only verifies when forward resolution returns the same address. Migration never touches reverse records, so this is how you check a primary survives it."
        >
          <input
            type="checkbox"
            checked={withPrimary}
            disabled={busy}
            onChange={() => setWithPrimary((v) => !v)}
            style={fuseCheckboxStyle}
          />
          primary
        </label>
        <span style={sepStyle} />
        <span style={fuseGroupLabelStyle}>Owner</span>
        <select
          value={createOwner}
          disabled={busy}
          onChange={(e) => setCreateOwner(e.target.value)}
          style={selectStyle}
          title="Account that will hold the new name. Every V1 write is signed by this account."
        >
          {DEV_ACCOUNTS.map((a) => (
            <option key={a.address} value={a.address}>
              {a.label} {a.address.slice(0, 6)}…
            </option>
          ))}
        </select>
        <span style={fuseGroupLabelStyle}>Manager</span>
        <select
          value={createManager}
          disabled={busy}
          onChange={(e) => setCreateManager(e.target.value)}
          style={selectStyle}
          title="V1 registry controller, when it should differ from the registrant. UNWRAPPED names only — wrapping hands the registry node to the NameWrapper. The app mirrors the split by granting this address ROLE_SET_RESOLVER in V2."
        >
          <option value="">same as owner</option>
          {DEV_ACCOUNTS.filter((a) => a.address !== createOwner).map((a) => (
            <option key={a.address} value={a.address}>
              {a.label} {a.address.slice(0, 6)}…
            </option>
          ))}
        </select>
        <span style={sepStyle} />
        <span style={fuseGroupLabelStyle}>State</span>
        <select
          value={lifecycle}
          disabled={busy}
          onChange={(e) => setLifecycle(e.target.value as NameLifecycle)}
          style={selectStyle}
          title="Lifecycle state to leave the name in. grace and premium advance the fork clock for EVERY name, not just this one."
        >
          <option value="active">active</option>
          <option value="grace">grace (renewable)</option>
          <option value="premium">temp premium</option>
        </select>
        <span
          style={fuseOutcomeStyle(driftDays > 0 ? 'blocked' : 'migrates')}
          title={
            driftDays > 0
              ? `Creating this advances the shared fork clock by ~${driftDays} days — every other name ages too.`
              : 'No clock change.'
          }
        >
          {driftDays > 0
            ? `⚠ advances fork clock ~${driftDays}d`
            : 'applies to “Create custom”'}
        </span>
      </div>

      {/* Names — one row each, so a name's state and its actions live together */}
      <div style={namesBlockStyle}>
        <div style={namesHeaderStyle}>
          <span>
            {activeNames.length} name{activeNames.length === 1 ? '' : 's'}
          </span>
          <span style={{ flex: 1 }} />
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

        {activeNames.length === 0 ? (
          <span style={emptyStyle}>no names yet — build one above</span>
        ) : (
          activeNames.map((n) => {
            const owner = n.ownerAddress ?? DEFAULT_ACCOUNT
            const isWrapped =
              n.type !== 'unwrapped' && n.type !== 'grace-renewable-unwrapped'
            return (
              <div key={n.id} style={nameRowStyle}>
                <div style={nameRowTopStyle}>
                  <span style={nameLabelStyle}>{n.label}.eth</span>
                  <span style={badgeStyle(TYPE_BADGE_COLORS[n.type])}>
                    {n.type}
                  </span>
                  {n.ownerFuses !== undefined && n.ownerFuses !== 0 && (
                    <span
                      style={badgeStyle('#4b5563')}
                      title={fuseSummary(n.ownerFuses)}
                    >
                      {fuseSummary(n.ownerFuses).replace(/CANNOT_/g, '')}
                    </span>
                  )}
                  {n.hasRecords && (
                    <span style={badgeStyle('#0f766e')}>records</span>
                  )}
                  {n.subnameLabel && (
                    <span
                      style={badgeStyle(
                        n.subnameWrapped ? '#1d4ed8' : '#4b5563',
                      )}
                      title={
                        n.subnameWrapped
                          ? 'Subname is in the NameWrapper'
                          : 'Subname is registry-only (not wrapped) — it will not appear as migratable'
                      }
                    >
                      sub {n.subnameWrapped ? 'wrapped' : 'unwrapped'}
                    </span>
                  )}
                  {n.subnamePrimary && (
                    <span
                      style={badgeStyle('#7c3aed')}
                      title={`${n.subnameLabel}.${n.label}.eth is the owner's V1 primary. Only the PARENT migrates — check whether the primary still verifies afterwards.`}
                    >
                      sub is primary
                    </span>
                  )}
                  {n.isPrimary && (
                    <span
                      style={badgeStyle('#7c3aed')}
                      title="Owner's V1 primary (reverse) name. Migration does not move reverse records — check it still verifies afterwards."
                    >
                      primary
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  <span style={ownerChipStyle} title={owner}>
                    owner {accountLabel(owner)}
                  </span>
                  {n.managerAddress && (
                    <span
                      style={ownerChipStyle}
                      title={`V1 registry controller ${n.managerAddress}`}
                    >
                      mgr {accountLabel(n.managerAddress)}
                    </span>
                  )}
                </div>

                <div style={nameRowActionsStyle}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => migrateSingle(n)}
                    style={smallChipStyle('#0080bc')}
                    title={`Migrate ${n.label}.eth`}
                  >
                    Migrate
                  </button>
                  <span style={rowLabelStyle}>send</span>
                  <select
                    value={rowTargets[n.id] ?? 'name'}
                    disabled={busy}
                    onChange={(e) =>
                      setRowTargets((prev) => ({
                        ...prev,
                        [n.id]: e.target.value as RowTarget,
                      }))
                    }
                    style={selectStyle}
                    title="What to move: the name itself, its subname, or the V1 manager role"
                  >
                    <option value="name">the name</option>
                    {n.subnameLabel && (
                      <option value="subname">
                        {n.subnameLabel}.{n.label}.eth
                      </option>
                    )}
                    {!isWrapped && (
                      <option value="manager">manager role</option>
                    )}
                    <option value="approve">approve (operator)</option>
                    <option value="primary">set as owner's primary</option>
                    {n.subnameLabel && !n.subnameWrapped && (
                      <option value="wrap-subname">
                        wrap {n.subnameLabel}.{n.label}.eth
                      </option>
                    )}
                    {n.subnameLabel && (
                      <option value="subname-primary">
                        set {n.subnameLabel}.{n.label}.eth as primary
                      </option>
                    )}
                  </select>
                  <span style={rowLabelStyle}>→</span>
                  <select
                    value={rowRecipients[n.id] ?? DEV_ACCOUNTS[1]?.address}
                    disabled={busy}
                    onChange={(e) =>
                      setRowRecipients((prev) => ({
                        ...prev,
                        [n.id]: e.target.value,
                      }))
                    }
                    style={selectStyle}
                  >
                    {DEV_ACCOUNTS.map((a) => (
                      <option key={a.address} value={a.address}>
                        {a.label} {a.address.slice(0, 6)}…
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runRowAction(n)}
                    style={smallChipStyle('#0f766e')}
                  >
                    Go
                  </button>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeName(n.id)}
                    style={smallChipStyle('#737373')}
                    title="Forget this name (does not touch the chain)"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })
        )}
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

const namesBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  borderTop: '1px solid #2a2a2a',
  paddingTop: 6,
}

const namesHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: '#737373',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const nameRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '5px 6px',
  borderRadius: 4,
  background: '#171717',
  border: '1px solid #262626',
}

const nameRowTopStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  flexWrap: 'wrap',
}

const nameRowActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
}

const nameLabelStyle: CSSProperties = {
  color: '#e5e5e5',
  fontSize: 12,
  fontWeight: 600,
}

const rowLabelStyle: CSSProperties = {
  color: '#737373',
  fontSize: 10,
}

const ownerChipStyle: CSSProperties = {
  color: '#a3a3a3',
  fontSize: 10,
  background: '#232323',
  border: '1px solid #303030',
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
}

function badgeStyle(bg: string): CSSProperties {
  return {
    background: bg,
    color: '#fff',
    fontSize: 9,
    borderRadius: 3,
    padding: '1px 5px',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  }
}

const emptyStyle: CSSProperties = {
  color: '#737373',
  fontSize: 11,
  fontStyle: 'italic',
}

const fuseGroupLabelStyle: CSSProperties = {
  color: '#737373',
  fontSize: 11,
  fontWeight: 600,
  marginRight: 2,
}

const fuseCheckboxStyle: CSSProperties = {
  margin: 0,
  width: 11,
  height: 11,
  cursor: 'inherit',
}

function fuseToggleStyle(checked: boolean, disabled: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '1px 5px',
    borderRadius: 4,
    border: `1px solid ${checked ? '#0080bc' : '#d9d9d9'}`,
    background: checked ? '#e6f2f8' : '#ffffff',
    color: disabled ? '#a3a3a3' : '#191919',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 10,
    lineHeight: '1.3',
    whiteSpace: 'nowrap',
  }
}

function fuseOutcomeStyle(kind: 'migrates' | 'blocked'): CSSProperties {
  return {
    color: kind === 'blocked' ? '#be123c' : '#737373',
    fontSize: 10,
    fontStyle: 'italic',
    maxWidth: 260,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
