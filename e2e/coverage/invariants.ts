/**
 * Invariant sweep registry — Track B of `e2e-build-goal.md` §9.
 *
 * Track A (`scenarios.ts`) answers *"does this flow work?"*. This file answers
 * *"where else is this class of bug?"*. An invariant is a property that must
 * hold at **every** site where it applies; a sweep enumerates the sites and
 * checks each one. Finite and auditable — not open-ended exploration.
 *
 * This is where severity lives. Both S1 defects found so far are the same INV1
 * class through different doors (an irreversible `detach-resolver` ordered
 * ahead of a step that could not succeed — once because the owner lacked a
 * role, once because the recipient could not receive an ERC-1155). Fixing the
 * first did not find the second. A sweep would have.
 *
 * A site is claimed by a Playwright tag, exactly as a scenario is:
 *
 *     test('…', { tag: ['@inv:INV1-transfer-plan'] }, …)
 *
 * The reconciler derives each site's status from that tag the same way it
 * derives a scenario's — a committed, non-skipped test that a project config
 * actually runs. A site is *checked* only on that evidence; `exempt` is the
 * only hand-written terminal state, and it needs a reason and an approver.
 *
 * Sites come from `e2e-test-catalogue.md` Part 4. Adding a site is expected as
 * the apps grow — an invariant whose site list stops growing while the app
 * gains surfaces is an invariant that has quietly stopped being swept.
 */

import type { Exemption } from './scenarios.js'

export const INVARIANT_IDS = ['INV1', 'INV2', 'INV3', 'INV4', 'INV5'] as const
export type InvariantId = (typeof INVARIANT_IDS)[number]

export interface Site {
  /** Stable id, used verbatim in an `@inv:<id>` tag. Prefixed by its invariant. */
  id: string
  invariant: InvariantId
  /** The flow or surface being swept. */
  title: string
  /**
   * What holding looks like *here*. The generic statement is on the invariant;
   * this is the site-specific reading of it, and it is what a test must assert.
   */
  oracle: string
  /** Written exemption — the only hand-written terminal state. */
  exempt?: Exemption
}

export interface Invariant {
  id: InvariantId
  statement: string
  /** Why this invariant exists — usually a real incident. */
  rationale: string
  sites: Site[]
}

const site = (
  invariant: InvariantId,
  slug: string,
  title: string,
  oracle: string,
  extra: Partial<Site> = {},
): Site => ({ id: `${invariant}-${slug}`, invariant, title, oracle, ...extra })

export const invariants: Invariant[] = [
  {
    id: 'INV1',
    statement:
      'No irreversible write is ordered ahead of a step that can fail.',
    rationale:
      'E2E-001 and E2E-002 are this class through different doors: a `detach-resolver` ordered ahead of a step that could not succeed. Fixing the first did not find the second.',
    sites: [
      site(
        'INV1',
        'transfer-plan',
        'Transfer plan (buildTransferPlan)',
        'every step that can fail is simulated before the first irreversible step executes; on a plan whose final step cannot succeed, nothing irreversible runs',
      ),
      site(
        'INV1',
        'migration-batch',
        'Migration batch ordering',
        'no name is unwrapped or reclaimed before every precondition for its controller call is proven satisfiable',
      ),
      site(
        'INV1',
        'record-multicall',
        'Record save multicall',
        'a delete is not ordered ahead of a write that will revert; the whole set is atomic or nothing is written',
      ),
      site(
        'INV1',
        'role-grant-revoke',
        'Role grant / revoke',
        'a revoke that would strip the caller of the ability to complete the plan is refused, or warned about, before submission',
      ),
      site(
        'INV1',
        'registry-deploy',
        'Registry deploy + setSubregistry',
        'the subregistry is not attached before it is confirmed deployed and callable',
      ),
      site(
        'INV1',
        'resolver-detach',
        'Resolver detach (set to zero)',
        'detach is never the first step of a plan whose later steps can fail — the E2E-001/002 site',
      ),
      site(
        'INV1',
        'fuse-burn',
        'Fuse burn',
        'the irreversibility warning is shown, and dismissible, before the burn is submitted',
      ),
      site(
        'INV1',
        'renew-then-migrate',
        'Renew → migrate in one plan',
        'the renewal is not submitted if the migration leg is already known to be impossible',
      ),
    ],
  },
  {
    id: 'INV2',
    statement:
      'Conservation — nothing the user holds vanishes without being carried, or explicitly warned about.',
    rationale:
      'A post-check that verifies only what the code knows about passes while destroying what it does not. Migration carries texts and coin types but not contenthash, ABI, pubkey or interfaceImplementer — and reports success. A name serving an IPFS site loses it silently.',
    sites: [
      site(
        'INV2',
        'migration',
        'Migration V1→V2',
        'enumerate the before state independently of the app model — every text key, every coinType, contenthash, ABI, pubkey, interfaceImplementer, roles, expiry, approvals — and assert each is carried or the user was warned',
      ),
      site(
        'INV2',
        'transfer',
        'Ownership transfer',
        'every record and role not explicitly detached is byte-identical after the transfer',
      ),
      site(
        'INV2',
        'resolver-change',
        'Resolver change',
        'records are carried to the new resolver, or the user is told which will not survive, before submitting',
      ),
      site(
        'INV2',
        'registry-detach',
        'Registry detach',
        'subnames under the detached registry are enumerated and their fate stated before the write',
      ),
      site(
        'INV2',
        'upgrade',
        'Registry / resolver upgrade',
        'state held by the old contract is enumerated and either migrated or declared lost',
      ),
    ],
  },
  {
    id: 'INV3',
    statement:
      'Totality — every input lands in exactly one visible bucket. No silent nulls, and every declared reason is producible.',
    rationale:
      'A name that vanishes from *both* the eligible and ineligible lists is invisible to the user and to any flow-shaped test. Two of `classifyNames`’ ten ineligibility reasons are dead code — and the app surfaces no ineligible list at all, so "ineligible" is only ever observable as absence.',
    sites: [
      site(
        'INV3',
        'classify-names',
        'classifyNames — 7 token types, 10 reasons',
        'every getNameType state lands in exactly one bucket, and each of the 10 declared reasons is either produced by some input or recorded as unreachable. The subname-migration PR added the `unlocked-child` and `registry-child` copy token types and the `invalid-label` (GS13) and `unsupported-resolver` (GS16) reasons, and made `unlocked-subname` dead alongside `registry-only` — both of those shapes are now eligible copies (GS3, GS4). Still tracked as unreachable: registry-only, unlocked-subname. Produced elsewhere: frozen-approval → GW11, already-migrated → GM5, missing-parent → GS9',
      ),
      site(
        'INV3',
        'dashboard-lists',
        'Dashboard name lists',
        'the union of every list equals the set of names the wallet holds on chain — nothing in neither list',
      ),
      site(
        'INV3',
        'search-results',
        'Search result categorisation',
        'every query lands in exactly one buildSearchSuggestions category, including the ones with no result',
      ),
      site(
        'INV3',
        'detach-targets',
        'Transfer detach targets',
        'every detachable target is either offered or explained; none silently absent',
      ),
      site(
        'INV3',
        'migration-eligibility',
        'Migration eligibility list',
        'eligible ∪ ineligible = every V1 name the wallet holds, with no overlap and no gap',
      ),
    ],
  },
  {
    id: 'INV4',
    statement: 'No confident negative without an on-chain cross-check.',
    rationale:
      'A misconfigured-but-running indexer returns success with zero rows and the UI presents that as a confident answer ("No role holders yet"). This has already happened here.',
    sites: [
      site(
        'INV4',
        'roles-table',
        'Roles table',
        'an empty roles table is cross-checked against roles() on chain before it is rendered as "none"',
      ),
      site(
        'INV4',
        'subnames-table',
        'Subnames table',
        'an empty list is distinguished from an unknown one',
      ),
      site(
        'INV4',
        'name-history',
        'Name history',
        'no events ≠ could not read events',
      ),
      site(
        'INV4',
        'activity-feed',
        'Recent activity feed',
        'no rows ≠ nothing happened',
      ),
      site(
        'INV4',
        'dashboard',
        'Dashboard name list',
        'an empty dashboard is cross-checked on chain before "you own no names"',
      ),
      site(
        'INV4',
        'registry-detail',
        'Registry detail (labels, roles, history)',
        'each empty panel distinguishes empty from unknown',
      ),
      site(
        'INV4',
        'resolver-detail',
        'Resolver detail (nodes, aliases, roles)',
        'each empty panel distinguishes empty from unknown',
      ),
      site(
        'INV4',
        'notification-inbox',
        'Notification inbox',
        'an empty inbox is distinguished from a backend that did not answer',
      ),
    ],
  },
  {
    id: 'INV5',
    statement:
      'Every affordance offered is executable by the connected wallet, checked before it is offered.',
    rationale:
      'Offering an action the wallet cannot perform is how an irreversible plan step gets ordered ahead of an impossible one — INV5 failures become INV1 incidents.',
    sites: [
      site(
        'INV5',
        'role-gated-buttons',
        'Every role-gated button',
        'the role is read on chain before the button renders enabled — not after the click',
      ),
      site(
        'INV5',
        'plan-steps',
        'Every multi-step plan step',
        'each step is checked executable at plan-build time, not at execution time',
      ),
      site(
        'INV5',
        'recipient-capability',
        'Transfer recipient capability',
        'ERC-1155 receiver capability is checked before the plan is offered (E2E-002)',
      ),
      site(
        'INV5',
        'fuse-gated-actions',
        'Fuse-gated actions',
        'a fuse that forbids the action removes the affordance, not just the submission',
      ),
      site(
        'INV5',
        'subname-creation',
        'Subname creation',
        'ROLE_REGISTRAR on the target registry is checked before the form is offered',
      ),
      site(
        'INV5',
        'renew',
        'Renew',
        'ROLE_RENEW, where the registry requires it, is checked before the action is offered',
      ),
    ],
  },
]

export const siteById = new Map(
  invariants.flatMap((inv) => inv.sites.map((sc) => [sc.id, sc] as const)),
)

/** Duplicate-id guard — a duplicate would double-count the sweep. */
const duplicates = invariants
  .flatMap((inv) => inv.sites.map((sc) => sc.id))
  .filter((id, i, all) => all.indexOf(id) !== i)
if (duplicates.length > 0) {
  throw new Error(
    `Duplicate invariant site ids: ${[...new Set(duplicates)].join(', ')}`,
  )
}
