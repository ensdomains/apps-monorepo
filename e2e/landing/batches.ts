/**
 * Landing plan for `e2e-tests-coverage` → `main`.
 *
 * `pnpm --filter @ens-apps/e2e landing`
 *
 * The branch is too large to merge in one PR, so it lands in batches, highest
 * priority first. This file is the only hand-written part of the tracker: it
 * says which batch every changed path belongs to, and which tests make up the
 * smoke suite. Whether a path has *landed* is never written here —
 * `scripts/landing-status.ts` derives it by comparing the path's blob on main
 * with its blob on the branch, so the ledger cannot claim more than git shows.
 *
 * Lives on the e2e branch only (see the DROP rule for it below) and goes away
 * with the branch. Read `docs/landing-handoff.md` before changing anything.
 */

export type BatchId =
  | 'B0'
  | 'B1a'
  | 'B1b'
  | 'B2'
  | 'B3'
  | 'B4'
  | 'B5'
  | 'B6'
  | 'B7'
  | 'B8'
  | 'B9'
  | 'B10'

export interface Batch {
  id: BatchId
  title: string
  /** The PR to main that lands this batch, once opened. */
  pr?: number
  /**
   * Set once the PR has merged. From then on a path that still differs from
   * main is `drifted` (the branch moved after landing), not `pending`.
   */
  merged?: boolean
}

/** Priority order: Smoke → CCIP → Migration → the rest. B0 gates all of them. */
export const batches: Batch[] = [
  {
    id: 'B0',
    title: 'Infra: stack, helpers, fixtures, harness, address gate',
    pr: 1599,
    merged: true,
  },
  {
    id: 'B1a',
    title: 'Smoke: Explorer specs + CI gate (smoke, nightly)',
    pr: 1601,
    merged: true,
  },
  { id: 'B1b', title: 'Smoke: Manager specs' },
  { id: 'B2', title: 'CCIP / offchain: the rest' },
  { id: 'B3', title: 'Migration: the rest' },
  { id: 'B4', title: 'Transfer, fuses, 4LD: the rest' },
  { id: 'B5', title: 'Registration, renewal, roles: the rest' },
  { id: 'B6', title: 'Display, history, metadata service' },
  { id: 'B7', title: 'V1 shape matrix' },
  { id: 'B8', title: 'Unit tests in apps/ and packages/' },
  {
    id: 'B9',
    title:
      'Exploratory suites (migration-matrix, parity, replacement): land or drop',
  },
  {
    id: 'B10',
    title:
      'Coverage ledger and planning docs (held back from B0; stay on the branch for now)',
  },
]

export type Target = BatchId | { drop: string }

interface Rule {
  globs: string[]
  target: Target
  /**
   * Every batch lands a slice of these (scripts, deps, defect rows whose
   * proving tests just landed, the ratchet baseline). They differ from the
   * branch until the last batch, so a merged batch reads `partial` here,
   * not `drifted`.
   */
  incremental?: true
}

const drop = (reason: string): Target => ({ drop: reason })

/**
 * First match wins, so specific rules come before the broad B0 globs.
 * `*` stays inside one path segment, `**` crosses them, `{a,b}` alternates.
 */
export const rules: Rule[] = [
  // ── Never lands ──────────────────────────────────────────────────────────
  {
    target: drop('branch-only landing tracker'),
    globs: [
      'e2e/landing/**',
      'e2e/scripts/landing-status.ts',
      'e2e/docs/landing-{ledger,handoff}.md',
    ],
  },
  {
    target: drop('scratch QA scripts from manual campaigns'),
    globs: ['e2e/qa2-*.mjs'],
  },
  {
    target: drop('campaign archives (tarballs and inventories), not tests'),
    globs: ['docs/testing-campaigns/**'],
  },
  // Only what nothing kept refers to. The other process notes (build goal, gap
  // analysis, spec audit, handoffs) are cited by specs and fixtures, so they
  // are held in B10 rather than dropped.
  {
    target: drop('superseded branch-process notes, unreferenced'),
    globs: ['e2e/docs/archive/**'],
  },
  {
    target: drop('one-off debugging probes, unreferenced'),
    globs: ['e2e/scripts/probe-{controller-roles,owner,role-events,roles}.ts'],
  },
  {
    target: drop('dead code: only its own test imports it'),
    globs: [
      'apps/manager/src/features/shared/service/readNamePages{,.test}.ts',
    ],
  },
  {
    target: drop(
      'commits MAILINATOR_API_KEY; CI reads secrets.MAILINATOR_API_KEY instead',
    ),
    globs: ['e2e/.env'],
  },

  // ── B10 coverage ledger and planning docs ────────────────────────────────
  // The user held these back from B0 on 2026-10-28; they stay on the branch
  // until a later decision. `matrix/{ids,scenarios}.ts` only feed the ledger.
  {
    target: 'B10',
    globs: [
      'e2e/coverage/**',
      'e2e/matrix/{ids,scenarios}.ts',
      'e2e/docs/{e2e-test-catalogue,e2e-master-test-plan,e2e-coverage,e2e-defects}.md',
      'e2e/docs/{e2e-build-goal,e2e-gap-analysis,e2e-spec-audit}.md',
      'e2e/docs/{bigname-harness,portal-bigname}-handoff.md',
    ],
  },
  // The cross-app V1 4LD observers (B1a) read rows with these.
  {
    target: 'B1a',
    incremental: true,
    globs: ['e2e/matrix/{assert,expectations}.ts'],
  },
  // The matrix runner and doc renderer serve the generated specs, not B0.
  // `render-docs.ts` imports `ids.ts`, so B7 needs B10 first.
  {
    target: 'B7',
    globs: ['e2e/matrix/{run,render-docs}.ts'],
  },

  // ── B0, comments reworded ────────────────────────────────────────────────
  // B0 carries these with citations of B10's docs (rule numbers, plan sections,
  // handoff iterations) reworded out, so they differ from this branch until B10
  // lands (2026-10-28).
  {
    target: 'B0',
    incremental: true,
    globs: [
      '.gitignore',
      'apps/manager/.env.example',
      'apps/portal/.env.example',
      'e2e/fixtures/chain-snapshot.ts',
      'e2e/fixtures/makeName.ts',
      'e2e/fixtures/makeSubname.ts',
      'e2e/fixtures/makeV1Name.ts',
      'e2e/fixtures/makeV2Name.ts',
      'e2e/fixtures/playwright.cross-app.fixture.ts',
      'e2e/fixtures/v1-controller-auth.ts',
      'e2e/fixtures/v1-records.ts',
      'e2e/fixtures/v1-tails.ts',
      'e2e/fixtures/wallets.ts',
      'e2e/helpers/bigname-labels.ts',
      'e2e/helpers/indexer-sync.ts',
      'e2e/helpers/migration-assertions.ts',
      'e2e/helpers/role-assertions.ts',
      'e2e/helpers/transaction-modal.ts',
      'e2e/projects/manager/playwright.config.ts',
      'e2e/projects/portal/playwright.config.ts',
      'e2e/scripts/check-address-literals.ts',
      'e2e/specs/harness-manager.spec.ts',
      'e2e/specs/harness.spec.ts',
      'packages/v1-name-shapes/src/shapes.test.ts',
      'packages/v1-name-shapes/src/shapes.ts',
      'packages/v1-name-shapes/src/tabs.ts',
      'packages/v1-name-shapes/src/types.ts',
    ],
  },

  // ── B0, pulled forward from later batches ────────────────────────────────
  // Fixtures and harness specs import these (seed, chain, records), so B0
  // does not compile without them (found preparing B0, 2026-10-28).
  {
    target: 'B0',
    globs: [
      'e2e/matrix/**',
      'packages/v1-name-shapes/**',
      'e2e/projects/migration-matrix/local-fork-routing.ts',
    ],
  },

  {
    target: drop(
      "reverts main's Node 24 pin (#1597); its e2e filter is moot (no test:coverage script)",
    ),
    globs: ['.github/workflows/test.yml'],
  },
  // Pulled forward from B1b (2026-10-29): the user wanted the migration smoke
  // flows per PR in B1a. B1a tags them and adds the manager-migration job.
  {
    target: 'B1a',
    incremental: true,
    globs: [
      'e2e/projects/manager/playwright.migration.config.ts',
      'e2e/projects/manager/tests/migration{,-fuses}.spec.ts',
    ],
  },
  // ── B1a smoke: Explorer + CI ─────────────────────────────────────────────
  // Incremental: B1a adds @smoke tags, rewrites smoke-suite.md and builds the
  // workflows from main's, so these differ from this branch on purpose.
  {
    target: 'B1a',
    incremental: true,
    globs: [
      '.github/workflows/**',
      'e2e/projects/portal/playwright.smoke.config.ts',
      'e2e/projects/portal/tests/{registration,transfer,subnames,v2-4ld,records,resolver,offchain-resolver}.spec.ts',
      'e2e/projects/cross-app/tests/{records-and-primary,v1-4ld-observers,v2-4ld-observers,transfer-in-explorer}.spec.ts',
      'e2e/docs/smoke-suite.md',
      'e2e/docs/{chain-mismatch-web281,registration-banner-web1490,resolver-reuse-web1572,stale-retry-error-web1229,zero-price-checkout-web1485}-test-plan.md',
      'e2e/docs/transfer-*-test-plan.md',
      // Cited by transfer.spec.ts and the transfer test plans.
      'e2e/scripts/probe-{migrated,detach,subname-transfer}.ts',
    ],
  },

  // ── B1b smoke: Manager ───────────────────────────────────────────────────
  {
    target: 'B1b',
    globs: [
      'e2e/projects/manager/playwright.smoke.config.ts',
      // Only the migration config runs it; the reconciler fails on a spec no
      // config runs.
      'e2e/specs/harness-manager-4ld.spec.ts',
      'e2e/projects/manager/tests/{registration,registration-rhinestone,profile,bulk-renew,primaryName,dashboard-names,hca-session-revoke,transaction-history}.spec.ts',
      'e2e/projects/manager/tests/migration{-subname,-grace,-time}.spec.ts',
      'e2e/projects/manager/tests/offchain-{resolver,migration}.spec.ts',
      'e2e/docs/{hca-budget-web1506,migration-grace-web424,payment-sheet-leftover-web1483,registration-lost-race-web1148,registration-tab-lock-web1702,session-revoke-web674,transaction-history-web1223}-test-plan.md',
    ],
  },

  // ── B2 CCIP / offchain ───────────────────────────────────────────────────
  {
    target: 'B2',
    globs: [
      'e2e/projects/manager/tests/offchain-*.spec.ts',
      'e2e/scripts/seed-offchain-*.ts',
    ],
  },

  // ── B3 migration ─────────────────────────────────────────────────────────
  {
    target: 'B3',
    globs: [
      'e2e/projects/manager/tests/migration-*.spec.ts',
      'e2e/projects/manager/tests/record-preservation-*.spec.ts',
      'e2e/projects/manager/playwright.record-{audit,grace}.config.ts',
      'e2e/projects/cross-app/tests/{migration-resolver,v1-4ld-time}.spec.ts',
      'e2e/projects/metadata/tests/migration-observability.spec.ts',
      'e2e/scripts/{seed-grace-v1-name,seed-v1-records,audit-records-readonly,check-g21-migration,seed-g21-abi,serve-g21-inventory,seed-g35-etc,serve-g35-inventory,seed-g02-delete,seed-g05-roles}.ts',
      'e2e/docs/migration-recreation-1494-test-plan.md',
      'e2e/docs/manual-{subname-migration,g02-delete,g05-v1-roles}.md',
    ],
  },

  // ── B4 transfer / fuses / 4LD ────────────────────────────────────────────
  {
    target: 'B4',
    globs: [
      'e2e/projects/manager/tests/transfer-observers.spec.ts',
      'e2e/projects/portal/tests/{fuses,migrated-fuses,v1-4ld,v2-4ld-time}.spec.ts',
      'e2e/scripts/{seed-transfer-names,seed-subname-transfer,seed-v1-transfer,seed-subname-grid,clear-own-resolver}.ts',
      'e2e/docs/manual-{v1-transfer,subname-transfer}.md',
    ],
  },

  // ── B5 registration / renewal / roles ────────────────────────────────────
  {
    target: 'B5',
    globs: [
      'e2e/projects/portal/tests/{roles,recreated-subnames,temporaryPremium}.spec.ts',
      'e2e/projects/manager/tests/{registration-resume,temporaryPremium}.spec.ts',
      'e2e/projects/manager/playwright.premium.config.ts',
      'e2e/docs/{missing-privileges-web1469,role-holders-verified-web1484,roles-remove-user-web1487,transaction-scope-web1418}-test-plan.md',
    ],
  },

  // ── B6 display / history / metadata ──────────────────────────────────────
  {
    target: 'B6',
    globs: [
      'e2e/projects/portal/tests/{history,dnsImport,dnsSyncBanners}.spec.ts',
      'e2e/projects/manager/tests/notification.spec.ts',
      'e2e/projects/metadata/**',
      'e2e/infra/Dockerfile.metadata-service',
      'e2e/infra/metadata-service/**',
      'e2e/helpers/metadataService.ts',
      'e2e/fixtures/metadataWebhook.ts',
      'e2e/docs/v1-history-assigned-resolver-web1445-test-plan.md',
      'e2e/docs/manual-metadata-service-testing.md',
    ],
  },

  // ── B7 V1 shape matrix ───────────────────────────────────────────────────
  {
    target: 'B7',
    globs: [
      'e2e/projects/portal/matrix/**',
      'e2e/scripts/generate-v1-matrix.ts',
      'e2e/docs/v1-shape-matrix.generated.md',
    ],
  },

  // ── B9 exploratory suites (before B8: they own the approval vite config) ──
  {
    target: 'B9',
    globs: [
      'e2e/projects/{migration-matrix,parity,replacement}/**',
      'e2e/projects/portal/playwright.review.config.ts',
      'e2e/scripts/{run-migration-matrix,run-prepared-matrix,run-replacement,check-replacement-coverage}.mjs',
      'e2e/scripts/{assert-matrix-evidence,verify-matrix-inventory}.mts',
      'e2e/scripts/fund-replacement.ts',
      'apps/manager/vite.approval.config.ts',
    ],
  },

  // ── B8 unit tests ────────────────────────────────────────────────────────
  {
    target: 'B8',
    globs: [
      'apps/*/src/**/*.test.{ts,tsx}',
      'packages/transaction-manager/**',
      'packages/dev-migration-tool/**',
    ],
  },

  // ── B0 infra (broad, so last) ────────────────────────────────────────────
  {
    target: 'B0',
    incremental: true,
    globs: [
      'e2e/package.json',
      'package.json',
      'pnpm-lock.yaml',
      // B0 carries these without the coverage-ledger passages (see B10).
      'e2e/README.md',
      'e2e/docs/local-e2e-stack.md',
    ],
  },
  {
    target: 'B0',
    globs: [
      'e2e/infra/**',
      'e2e/helpers/**',
      'e2e/fixtures/**',
      'e2e/contracts/**',
      'e2e/specs/**',
      'e2e/cache/**',
      'e2e/playwright.config.base.ts',
      'e2e/projects/{manager,portal,cross-app}/playwright.config.ts',
      'e2e/scripts/{check-address-literals,check-name-resolves,seed-name}.ts',
      '.gitignore',
      'apps/*/.env.example',
      'apps/*/vite.config.ts',
    ],
  },
]

// ── Smoke checklist ────────────────────────────────────────────────────────

export type App = 'Explorer' | 'Manager'

interface SmokeBase {
  flow: string
  app: App
  version: 'V1' | 'V2' | 'V1+V2' | 'V1→V2'
}

/** An existing test: `title` is a substring of its title in `spec`. */
interface SmokeTest extends SmokeBase {
  spec: string
  title: string
  /** Written on main (a gap filled after the freeze), so absent on the branch. */
  mainOnly?: true
}

interface SmokeGap extends SmokeBase {
  gap: string
}

interface SmokeNotApplicable extends SmokeBase {
  na: string
}

export type SmokeEntry = SmokeTest | SmokeGap | SmokeNotApplicable

const P = 'e2e/projects/portal/tests/'
const M = 'e2e/projects/manager/tests/'
const X = 'e2e/projects/cross-app/tests/'

/**
 * The flows the smoke suite must cover (agreed 2026-10-28). Every entry with a
 * `title` must carry `@smoke` on main before the branch can be discarded.
 */
export const smoke: SmokeEntry[] = [
  // Registration
  {
    flow: 'Registration',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}registration.spec.ts`,
    title: 'registers a name via headless wallet and stablecoin payment',
  },
  {
    flow: 'Registration',
    app: 'Manager',
    version: 'V2',
    spec: `${M}registration-rhinestone.spec.ts`,
    title: 'registers a name via Rhinestone HCA headless wallet',
  },
  {
    flow: 'Registration',
    app: 'Explorer',
    version: 'V1',
    na: 'new registrations are V2 only',
  },

  // Subnames
  {
    flow: 'Add 3LD',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}subnames.spec.ts`,
    title: 'creates a 3LD in the parent registry',
  },
  {
    flow: 'Add 4LD',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}subnames.spec.ts`,
    title: 'creates a 4LD under a 3LD that owns its own registry',
  },
  {
    flow: 'Add 4LD',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}v2-4ld.spec.ts`,
    title: 'creates a native 4LD in its immediate parent registry',
  },
  {
    flow: 'Add 3LD / 4LD',
    app: 'Explorer',
    version: 'V1',
    gap: 'no portal-suite test; parity/v1-subname.spec.ts (B9) creates V1 subnames under its authority matrix — port an allowed 3LD and 4LD case into portal/subnames',
  },

  // Renewals
  {
    flow: 'Renew',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}registration.spec.ts`,
    title:
      'Extend approves exactly the renewal price and leaves no allowance behind',
  },
  {
    flow: 'Renew',
    app: 'Explorer',
    version: 'V1',
    spec: `${P}registration.spec.ts`,
    title: 'renewing a V1 name approves ETHRenewerV1 exactly its price',
  },
  {
    flow: 'Renew',
    app: 'Manager',
    version: 'V2',
    spec: `${M}profile.spec.ts`,
    title: 'extend owned name by 28 days',
  },
  {
    flow: 'Renew',
    app: 'Manager',
    version: 'V1',
    spec: `${M}migration-time.spec.ts`,
    title: 'renewing an unwrapped V1 name in grace moves its lease',
  },
  {
    flow: 'Renew',
    app: 'Manager',
    version: 'V1',
    spec: `${M}migration-time.spec.ts`,
    title:
      'renewing a wrapped V1 name in grace also moves its NameWrapper expiry',
  },

  // Bulk renewals
  {
    flow: 'Bulk renew',
    app: 'Explorer',
    version: 'V1+V2',
    spec: `${P}registration.spec.ts`,
    title: 'two V1 and two V2 names: one approval per renewer',
  },
  {
    flow: 'Bulk renew',
    app: 'Manager',
    version: 'V2',
    spec: `${M}bulk-renew.spec.ts`,
    title: 'a wallet holding a V1 and a V2 name can bulk-renew only the V2 one',
  },

  // Primary name
  {
    flow: 'Set primary (name)',
    app: 'Manager',
    version: 'V2',
    spec: `${M}primaryName.spec.ts`,
    title: 'Set primary name',
  },
  {
    flow: 'Set primary (name)',
    app: 'Explorer',
    version: 'V2',
    gap: 'records-and-primary sets it in Manager; Explorer never sets a primary',
  },
  {
    flow: 'Set primary (subname)',
    app: 'Explorer',
    version: 'V1',
    spec: `${X}v1-4ld-observers.spec.ts`,
    title: 'explorer sets a V1 4LD primary name that survives migration',
  },
  {
    flow: 'Set primary (subname)',
    app: 'Manager',
    version: 'V2',
    spec: `${X}v2-4ld-observers.spec.ts`,
    title: 'manager sets a native 4LD primary name visible in explorer',
  },
  {
    flow: 'Set primary (subname)',
    app: 'Explorer',
    version: 'V2',
    gap: 'no Explorer test sets a V2 subname as primary',
  },

  // Records
  {
    flow: 'Edit records',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}records.spec.ts`,
    title:
      'saves several text records in one transaction and reads them back on-chain',
  },
  {
    flow: 'Edit records',
    app: 'Explorer',
    version: 'V1',
    spec: `${X}v1-4ld-observers.spec.ts`,
    title:
      'V1 4LD records edit in explorer resolves and manager requires upgrade',
  },
  {
    flow: 'Edit records',
    app: 'Manager',
    version: 'V2',
    spec: `${M}profile.spec.ts`,
    title: 'add lots of records to profile',
  },
  {
    flow: 'Add banner (header)',
    app: 'Manager',
    version: 'V2',
    gap: 'no test sets a header/banner image',
  },

  // Migration — major combinations
  {
    flow: 'Migration: unwrapped 2LD',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}migration.spec.ts`,
    title: 'an unwrapped 2LD lands in V2 with exactly the registration roles',
  },
  {
    flow: 'Migration: emancipated 2LD',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}migration.spec.ts`,
    title: 'an emancipated 2LD is unwrapped into the Graveyard',
  },
  {
    flow: 'Migration: wrapped, batched',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}migration.spec.ts`,
    title: 'two wrapped names move to the controller in one batched transfer',
  },
  {
    flow: 'Migration: records replayed',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}migration.spec.ts`,
    title:
      'text records and the ETH address are replayed onto the new V2 resolver',
  },
  {
    flow: 'Migration: locked 2LD',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}migration-fuses.spec.ts`,
    title: 'a locked 2LD keeps its wrapper in the Graveyard',
  },
  {
    flow: 'Migration: registry subname',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}migration-subname.spec.ts`,
    title:
      'copies a registry-only subname into a UserRegistry under its parent',
  },
  {
    flow: 'Migration: name in grace',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}migration-grace.spec.ts`,
    title:
      'renews then upgrades a grace-period name, charging the USDC the dialog quoted',
  },

  // CCIP
  {
    flow: 'CCIP read',
    app: 'Manager',
    version: 'V2',
    spec: `${M}offchain-resolver.spec.ts`,
    title: 'reads an offchain name in batched gateway requests',
  },
  {
    flow: 'CCIP read',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}offchain-resolver.spec.ts`,
    title: 'reads an offchain name and its wildcard subname in batches',
  },
  {
    flow: 'CCIP through migration',
    app: 'Manager',
    version: 'V1→V2',
    spec: `${M}offchain-migration.spec.ts`,
    title: 'V1 name on a CCIP-Read resolver keeps it',
  },

  // Transfers
  {
    flow: 'Transfer',
    app: 'Explorer',
    version: 'V1',
    spec: `${P}transfer.spec.ts`,
    title:
      'transfers an unwrapped V1 name, moving BOTH the registrant and the controller',
  },
  {
    flow: 'Transfer',
    app: 'Explorer',
    version: 'V1',
    spec: `${P}transfer.spec.ts`,
    title: 'transfers a WRAPPED V1 name in a single ERC-1155 step',
  },
  {
    flow: 'Transfer',
    app: 'Explorer',
    version: 'V1',
    spec: `${P}transfer.spec.ts`,
    title: 'transfers a V1 REGISTRY subname via setOwner alone',
  },
  {
    flow: 'Transfer',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}transfer.spec.ts`,
    title:
      'transfers a name from wallet A to wallet B, and wallet B is shown as the owner',
  },
  {
    flow: 'Transfer',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}transfer.spec.ts`,
    title: 'transfers a subname, moving the token in the parent subregistry',
  },

  // My Names
  {
    flow: 'My Names',
    app: 'Manager',
    version: 'V1+V2',
    spec: `${M}dashboard-names.spec.ts`,
    title: 'the dashboard pages and sorts the names bigname lists',
  },
  {
    flow: 'My Names',
    app: 'Manager',
    version: 'V1+V2',
    spec: `${M}dashboard-names.spec.ts`,
    title: 'the version chips list only ENSv1 or only ENSv2 names',
  },
  {
    flow: 'My Names',
    app: 'Explorer',
    version: 'V2',
    gap: 'only indirect (cross-app transfer-in-explorer); needs a direct My Names test',
  },

  // Resolver and registry
  {
    flow: 'Change resolver',
    app: 'Explorer',
    version: 'V2',
    spec: `${P}resolver.spec.ts`,
    title: 'points a name at a different resolver',
  },
  {
    flow: 'Change registry',
    app: 'Explorer',
    version: 'V2',
    gap: 'subnames spec only checks the deploy is offered; needs a set-registry test',
  },

  // History
  {
    flow: 'Transaction history',
    app: 'Explorer',
    version: 'V2',
    gap: 'history spec covers forged events only; needs a positive register/transfer/records history test',
  },
]
