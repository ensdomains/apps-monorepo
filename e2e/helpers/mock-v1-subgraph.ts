/**
 * Mock V1 Subgraph — intercepts the ENS V1 subgraph requests in the browser
 * and injects locally-registered V1 names into the response.
 *
 * The migration UI queries `https://v1-graphql.ens.dev/subgraph` for V1
 * names (`apps/manager/src/features/migration/service/v1SubgraphClient.ts`).
 * Since our test names are registered on the local Anvil fork (not the real
 * Sepolia), the subgraph doesn't see them. This helper uses Playwright's
 * `page.route()` to intercept those requests and inject our test domain(s)
 * into the response.
 *
 * The URL here must track the app's client exactly: it drifted once already
 * (this file pointed at a since-retired `…railway.app/subgraph` staging
 * host while the app had moved to `v1-graphql.ens.dev`), and because
 * `page.route()` silently no-ops on a non-matching pattern rather than
 * erroring, every migration.spec.ts test kept "passing" its own timeout as a
 * plain hang instead of failing loudly on the mismatch.
 *
 * ## Subnames
 *
 * This mock used to be able to describe only `.eth` 2LDs. It derived the label
 * with `name.replace('.eth', '')`, hardcoded `parent: { name: 'eth' }`, and
 * always emitted a `registration` block. That made three whole classes of name
 * inexpressible, and — since the subname-migration PR added `isValidLabel` —
 * actively wrong: `sub.parent.eth` produced `labelName: 'sub.parent'`, and a
 * label containing a dot is now classified ineligible `invalid-label`. So the
 * test would not merely mis-shape the name, it would silently assert the wrong
 * product behaviour.
 *
 * The input is therefore a *tree* (`MockV1Tree`). Every node emits one
 * `V1Domain`, and the fields a subname needs — `parent.wrappedDomain.fuses`,
 * a null `registration`, a null `registrant`, an owner that is the EOA rather
 * than the NameWrapper — are derived from its position in that tree rather
 * than assumed. The flat `MockV1Name[]` form still works and is unchanged.
 */
import type { Page } from '@playwright/test'
import { keccak256, namehash, toHex } from 'viem'
import {
  V1_NAME_WRAPPER,
  V1_PUBLIC_RESOLVER,
  type V1AddressRecord,
  type V1NameType,
  type V1TextRecord,
} from '../fixtures/makeV1Name.js'

// Rule 7 (no address literals): these come from `makeV1Name.ts`, which is the
// single place the V1 deployment is pinned. They were duplicated here, which
// is exactly how the same registry ended up with three different addresses
// across three files.

const V1_SUBGRAPH_URL = 'v1-graphql.ens.dev/subgraph'

/**
 * Fuse values matching the NameWrapper contract.
 * PARENT_CANNOT_CONTROL and IS_DOT_ETH are auto-set for .eth 2LDs.
 */
const FUSES = {
  CANNOT_UNWRAP: 1,
  PARENT_CANNOT_CONTROL: 1 << 16,
  IS_DOT_ETH: 1 << 17,
} as const

/** Fuses set by NameWrapper for an unlocked .eth 2LD wrap (fuses=0) */
const UNLOCKED_2LD_FUSES = FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH // 196608

/** Fuses set by NameWrapper for a locked .eth 2LD wrap (fuses=CANNOT_UNWRAP) */
const LOCKED_2LD_FUSES =
  FUSES.CANNOT_UNWRAP | FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH // 196609

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

const labelhashOf = (label: string) => keccak256(toHex(label))

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Records a node carries on its V1 resolver. */
export type MockV1Records = {
  texts?: V1TextRecord[]
  addresses?: V1AddressRecord[]
  /** Presence, not value — this is how migration learns a contenthash EXISTS. */
  contentHash?: string | null
  abiContentTypes?: number[]
}

/**
 * How a node exists in V1. This is a discriminated union rather than a set of
 * optional flags because the three shapes are genuinely disjoint on chain, and
 * every one of them makes `classifyName` take a different branch:
 *
 * - `registration`  a `.eth` 2LD held by the BaseRegistrar (optionally wrapped)
 * - `wrapped-child` a NameWrapper subname — an ERC-1155 under its parent's node
 * - `registry-child` a subname owned directly in the legacy registry, no token
 */
export type MockV1NodeKind =
  | {
      readonly kind: 'registration'
      /** Mirrors `makeV1Name`'s `type`. */
      readonly type?: V1NameType
      /**
       * Owner-controlled fuse bits only. PARENT_CANNOT_CONTROL and IS_DOT_ETH
       * are burned by `wrapETH2LD` itself and are OR'd in here, matching what
       * the NameWrapper actually reports.
       */
      readonly ownerFuses?: number
    }
  | {
      readonly kind: 'wrapped-child'
      /**
       * The FULL fuse bitmap the NameWrapper reports for this child. Nothing is
       * OR'd in. A subname is not a `.eth` 2LD, so IS_DOT_ETH must not be set,
       * and PARENT_CANNOT_CONTROL is exactly the bit that decides
       * `detached-child` (migrate) versus `unlocked-child` (copy). The old mock
       * OR'd both bits into every name unconditionally, which is what made the
       * copy path impossible to express.
       */
      readonly fuses: number
    }
  | { readonly kind: 'registry-child' }

export type MockV1Node = MockV1NodeKind & {
  /** ONE label. Never a dotted path — the tree supplies the ancestry. */
  readonly label: string
  /**
   * Unix seconds. For a `registration` this is the registration *and* wrapper
   * expiry. For a `wrapped-child` it is `wrappedDomain.expiryDate`, which the
   * classifier reads as a copy's `sourceExpiry` — so it must be settable
   * independently of the parent to test `expired-registration`.
   */
  readonly expiryDate?: number
  readonly registrationDate?: number
  /**
   * `null` is meaningful and is the default for a child: the classifier's
   * `hasSupportedCopyResolver(null)` is `true`, so a resolver-less subname is
   * eligible to copy. Point this at an unrecognised address to build an
   * `unsupported-resolver` fixture.
   */
  readonly resolver?: string | null
  readonly records?: MockV1Records
  /** Defaults to the tree's owner. */
  readonly ownerAddress?: string
  /** `registration` nodes only — differs from the owner for the managed case. */
  readonly registrantAddress?: string
  readonly children?: readonly MockV1Node[]
}

export type MockV1Tree = {
  readonly ownerAddress: string
  readonly roots: readonly MockV1Root[]
}

/**
 * A root normally hangs off `eth`. Overriding that is how an ORPHAN is
 * expressed: a subname whose parent genuinely exists on chain but is
 * deliberately absent from the injection, so `hasCompleteCopyRoute` cannot
 * reach a migrating 2LD ancestor and the name is demoted to `missing-parent`.
 *
 * The parent's fuses are unknowable in that case — the subgraph would report
 * them, but the point of the fixture is that we are not reporting the parent at
 * all — so `parentWrappedFuses` is whatever the caller declares.
 */
export type MockV1Root = MockV1Node & {
  /** Full parent name, e.g. `absent.eth`. Defaults to `eth`. */
  readonly parentName?: string
  /** The absent parent's wrapper fuses, if it is wrapped. */
  readonly parentFuses?: number
}

/**
 * The original flat form: one `.eth` 2LD per entry. Still supported verbatim so
 * `migration.spec.ts`, `migration-fuses.spec.ts` and `migration-premium.spec.ts`
 * need no changes.
 */
export type MockV1Name = {
  /** Full name including .eth (e.g. "migtest-123.eth") */
  name: string
  /** EOA address that owns this V1 name */
  ownerAddress: string
  /** V1 name type — must match what was passed to makeV1Name */
  type?: V1NameType
  /**
   * Override the full fuse bitmap injected into the subgraph mock.
   * When provided, overrides the default fuses derived from `type`.
   * The NameWrapper always auto-adds PARENT_CANNOT_CONTROL | IS_DOT_ETH for .eth
   * 2LDs, so pass only the owner-controlled bits (e.g. FUSES.CANNOT_UNWRAP | FUSES.CANNOT_BURN_FUSES).
   * The mock will OR in PARENT_CANNOT_CONTROL and IS_DOT_ETH automatically.
   */
  fuses?: number
  /** Registration expiry timestamp (Unix seconds). Defaults to now + 1 year. */
  expiryDate?: number
  /** V1 records set on this name (used to mock getProfilesForDomains) */
  records?: MockV1Records
  /** Subnames beneath this 2LD, to any depth. */
  children?: readonly MockV1Node[]
}

// ---------------------------------------------------------------------------
// Tree → V1Domain[]
// ---------------------------------------------------------------------------

/** A node paired with everything its `V1Domain` needs from its ancestors. */
type FlatNode = {
  readonly node: MockV1Node
  readonly fullName: string
  readonly parentName: string
  readonly parentWrappedFuses: number | null
  readonly parentExpiry: number
}

/**
 * Whether a node's registry `owner` is the NameWrapper. This is what
 * `classifyName` keys on to decide there is no active wrapper, which is the
 * gate in front of the whole `registry-child` copy branch.
 */
const isWrappedNode = (node: MockV1Node): boolean =>
  node.kind === 'registration'
    ? node.type === 'wrapped' || node.type === 'locked'
    : node.kind === 'wrapped-child'

/** The full fuse bitmap the NameWrapper would report for a node. */
const fusesOf = (node: MockV1Node): number => {
  if (node.kind === 'wrapped-child') return node.fuses
  if (node.kind === 'registry-child') return 0
  if (node.ownerFuses !== undefined) {
    return node.ownerFuses | FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH
  }
  return node.type === 'locked' ? LOCKED_2LD_FUSES : UNLOCKED_2LD_FUSES
}

/**
 * Walk the tree, carrying each node's ancestry down. Emitted parent-first so a
 * logged domain list reads top-down, which matters when diagnosing a name that
 * failed `hasCompleteCopyRoute` (the check walks *up* from the child, so the
 * missing link is always an earlier entry).
 */
function flattenTree(tree: MockV1Tree, now: number): FlatNode[] {
  const out: FlatNode[] = []

  const visit = (
    node: MockV1Node,
    parentName: string,
    parentWrappedFuses: number | null,
    parentExpiry: number,
  ) => {
    const fullName = `${node.label}.${parentName}`
    out.push({ node, fullName, parentName, parentWrappedFuses, parentExpiry })

    const expiry = node.expiryDate ?? parentExpiry
    const wrappedFuses = isWrappedNode(node) ? fusesOf(node) : null
    for (const child of node.children ?? []) {
      visit(child, fullName, wrappedFuses, expiry)
    }
  }

  for (const root of tree.roots) {
    const asRoot = root as MockV1Root
    visit(
      root,
      asRoot.parentName ?? 'eth',
      asRoot.parentFuses ?? null,
      now + ONE_YEAR_SECONDS,
    )
  }
  return out
}

/**
 * Which resolver a node reports. An explicit `null` is meaningful — it is the
 * eligible state for a copy — so this distinguishes "unset" from "none".
 */
function resolverAddressOf(
  node: MockV1Node,
  is2LD: boolean,
  isWrapped: boolean,
): string | null {
  if (node.resolver !== undefined) return node.resolver
  if (is2LD && (node.records || isWrapped)) return V1_PUBLIC_RESOLVER
  return null
}

/**
 * Build the `V1Domain` for one node. Every field a subname needs differs from
 * a 2LD's, and each of these was previously hardcoded to the 2LD answer:
 *
 * - `labelName`/`labelhash` are the node's OWN label, not the dotted path.
 * - `registration` and `registrant` are 2LD-only. Supplying them on a child
 *   makes `hasExpiredDotEthRegistration` treat it as a `.eth` registration.
 * - `parent.wrappedDomain.fuses` carries the parent's real fuses, which is the
 *   only way `classifyUnlockedWrapper` can tell `detached-child` from
 *   `unlocked-child`.
 * - `owner.id` is the NameWrapper for a wrapped node and the EOA otherwise;
 *   `classifyWithoutActiveWrapper` reads it as the registry owner.
 */
function buildV1Domain(flat: FlatNode, ownerAddress: string, now: number) {
  const { node, fullName, parentName, parentWrappedFuses, parentExpiry } = flat
  const owner = (node.ownerAddress ?? ownerAddress).toLowerCase()
  const isWrapped = isWrappedNode(node)
  const is2LD = node.kind === 'registration'
  const expiry =
    node.expiryDate ?? (is2LD ? now + ONE_YEAR_SECONDS : parentExpiry)
  const registrationDate = node.registrationDate ?? now

  // A resolver is only implied for a 2LD, where the existing flat-form callers
  // rely on wrapped names reporting one. For a child, an unset resolver means
  // "none", which is a valid and eligible state for a copy.
  const resolverAddress = resolverAddressOf(node, is2LD, isWrapped)

  return {
    id: namehash(fullName),
    labelName: node.label,
    labelhash: labelhashOf(node.label),
    name: fullName,
    isMigrated: false,
    createdAt: String(registrationDate),
    resolvedAddress: null,
    resolver: resolverAddress
      ? { id: resolverAddress, address: resolverAddress }
      : null,
    owner: { id: isWrapped ? V1_NAME_WRAPPER : owner },
    // The BaseRegistrar ERC-721 holder. Subnames have no registrant at all.
    registrant: is2LD
      ? { id: node.registrantAddress?.toLowerCase() ?? owner }
      : null,
    wrappedOwner: isWrapped ? { id: owner } : null,
    parent: {
      name: parentName,
      id: namehash(parentName),
      wrappedDomain:
        parentWrappedFuses === null
          ? null
          : { expiryDate: String(parentExpiry), fuses: parentWrappedFuses },
    },
    // `.eth` 2LD registrations only.
    registration: is2LD
      ? {
          registrationDate: String(registrationDate),
          expiryDate: String(expiry),
        }
      : null,
    wrappedDomain: isWrapped
      ? { expiryDate: String(expiry), fuses: fusesOf(node) }
      : null,
  }
}

/** Adapt the flat `MockV1Name[]` form onto the tree. */
function toTree(mockNames: readonly MockV1Name[]): MockV1Tree {
  const ownerAddress = mockNames[0]?.ownerAddress ?? ''
  return {
    ownerAddress,
    roots: mockNames.map((n) => ({
      kind: 'registration' as const,
      label: n.name.replace(/\.eth$/i, ''),
      type: n.type,
      ownerFuses: n.fuses,
      expiryDate: n.expiryDate,
      ownerAddress: n.ownerAddress,
      records: n.records,
      children: n.children,
    })),
  }
}

const isTree = (
  input: readonly MockV1Name[] | MockV1Tree,
): input is MockV1Tree => !Array.isArray(input)

// ---------------------------------------------------------------------------
// The route handler
// ---------------------------------------------------------------------------

/**
 * Intercept V1 subgraph requests and inject mock V1 names.
 *
 * Any request to the V1 subgraph URL that contains `getNamesForAddress`
 * will have the mock names appended to the response. Other subgraph
 * queries (like getProfilesForDomains) are passed through unmodified.
 *
 * Call this BEFORE navigating to pages that trigger V1 name queries.
 */
export async function mockV1Subgraph(
  page: Page,
  input: readonly MockV1Name[] | MockV1Tree,
): Promise<void> {
  const tree = isTree(input) ? input : toTree(input)
  const now = Math.floor(Date.now() / 1000)
  const flat = flattenTree(tree, now)

  // Lookup by namehash for the profile query, which is keyed on domain id.
  const nodesByNode = new Map<string, MockV1Node>()
  for (const entry of flat)
    nodesByNode.set(namehash(entry.fullName), entry.node)

  await page.route(`**/${V1_SUBGRAPH_URL}`, async (route, request) => {
    const postData = request.postData()

    // ── Handle getProfilesForDomains queries ────────────────────────
    // The migration fetches V1 profile keys (texts, coinTypes, contenthash and
    // ABI content types) from the subgraph before reading the actual values on
    // chain. `contentHash` and `abiChangeds` are how it learns those two
    // records EXIST — omitting them makes both silently unreplayed, which looks
    // exactly like the preservation feature being broken.
    if (postData?.includes('getProfilesForDomains')) {
      // Extract requested domain IDs from the filter
      let requestedIds: string[] = []
      try {
        const body = JSON.parse(postData)
        requestedIds = body?.variables?.whereFilter?.id_in ?? []
      } catch {
        /* ignore */
      }

      // Build mock profile entries for our names that have records
      const mockProfileDomains = requestedIds
        .filter((id: string) => nodesByNode.has(id))
        .map((id: string) => {
          const node = nodesByNode.get(id)!
          const records = node.records
          return {
            id,
            resolver: {
              texts: records?.texts?.map((t) => t.key) ?? [],
              coinTypes: records?.addresses?.map((a) => a.coinType) ?? [],
              contentHash: records?.contentHash ?? null,
              abiChangeds: (records?.abiContentTypes ?? []).map(
                (contentType) => ({ contentType }),
              ),
            },
          }
        })

      // Fetch real response and merge
      let realDomains: any[] = []
      try {
        const response = await route.fetch()
        const json = await response.json()
        realDomains = json?.data?.domains ?? []
      } catch {
        /* subgraph unreachable */
      }

      const allDomains = [...realDomains, ...mockProfileDomains]

      console.log(
        `[mock-v1-subgraph] Injecting ${mockProfileDomains.length} mock profiles into getProfilesForDomains`,
      )

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { domains: allDomains } }),
      })
    }

    // ── Handle getNamesForAddress queries ────────────────────────────
    if (!postData?.includes('getNamesForAddress')) {
      return route.continue()
    }

    const mockDomains = flat.map((entry) =>
      buildV1Domain(entry, tree.ownerAddress, now),
    )

    // Fetch the real response first to merge with existing names
    let realDomains: any[] = []
    try {
      const response = await route.fetch()
      const json = await response.json()
      realDomains = json?.data?.domains ?? []
    } catch {
      // If the real subgraph is unreachable, just use our mocks
    }

    // Merge: real names + our mock names
    const allDomains = [...realDomains, ...mockDomains]

    console.log(
      `[mock-v1-subgraph] Injecting ${mockDomains.length} mock V1 names ` +
        `(${mockDomains.map((d) => d.name).join(', ')}) into subgraph response ` +
        `(${realDomains.length} real names)`,
    )

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { domains: allDomains },
      }),
    })
  })
}
